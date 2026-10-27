import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentNode, BoardEvent, CodexInfo, PeerSession } from '../types'
import {
  HEALTH_BADGE,
  STATUS_GLYPH,
  assessHealth,
  nodePhase,
  snapshotSummary,
  toolSignature,
  adviceLine,
  adviceTitle,
  compareAdvice,
  freshAdvice,
  clip,
  codexRunId,
  codexTasks,
  describeTool,
  mergeCodexRun,
  formatDuration,
  formatTokens,
  fromAgentStatus,
  isCodexCommand,
  linkDirection,
  modelTone,
  newestVersions,
  parseTaskNotification,
  peerFromSnapshot,
  recentSummary,
  sparkline,
  treeOrder,
} from './board'
import type { OrchestrationAdvice, Snapshot, SnapshotLink } from './board'
import { scanCodex } from './codex'
import { scanT3, t3Nodes, t3Status } from './t3'
import type { T3Scan } from './t3'
import { WEB_PAGE } from './web'

const PANE = 'agent-board'
const PORT = 7788
const HISTORY = 60
const EVENTS = 40
// A finished agent or turn shorter than this gets a toast, not a native notification.
const NOTIFY_AFTER_MS = 60_000

const agents = atom({ plugin: 'agent-board', key: 'agents' } as const, [])
const activity = atom({ plugin: 'agent-board', key: 'activity' } as const, [])
const now = atom({ plugin: 'agent-board', key: 'now' } as const, 0)
const webUrl = atom({ plugin: 'agent-board', key: 'webUrl' } as const, null)
const events = atom({ plugin: 'agent-board', key: 'events' } as const, [])
const peers = atom({ plugin: 'agent-board', key: 'peers' } as const, [])

type Job = { id: number; prompt: string; status: 'running' | 'done' | 'failed'; startedAt: number; endedAt?: number }

// Module state: rebuilt on reload, which is fine for things that only debounce announcements.
let sessionId = ''
let sessionStart = 0
let tick = 0
let busy = false
let seq = 0
let lastError: string | undefined
let sessionEnded = false
let snapshotQueue: Promise<void> = Promise.resolve()
let sessionCwd = ''
let snapshotPath = ''
const links: SnapshotLink[] = []
const linkIds = new Set<string>()
const recordLink = (link: SnapshotLink) => {
  if (linkIds.has(link.id)) return
  linkIds.add(link.id)
  links.push(link)
  links.sort((a, b) => a.at - b.at)
  if (links.length > 50) links.splice(0, links.length - 50)
}
const flow = (id: string, at: number, kind: SnapshotLink['kind'], from: string, to: SnapshotLink['to'], preview?: string) =>
  recordLink({ id, at, kind, from: { sessionId, nodeId: from }, to, preview: preview ? clip(preview, 200) : undefined })
const collectors = new Map<string, { at: number; running: boolean }>()
// A timed-out collector stays marked in flight until its underlying work settles.
const collect = async (name: string, at: number, work: () => Promise<void>) => {
  const state = collectors.get(name)
  if (state?.running || (state && at - state.at < 5000)) return
  const current = { at, running: true }
  collectors.set(name, current)
  let timer: ReturnType<typeof setTimeout> | undefined
  const job = Promise.resolve().then(work).then(() => {
    if (lastError?.startsWith(`${name}:`)) lastError = undefined
  }).finally(() => { current.running = false })
  try {
    await Promise.race([job, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('deadline exceeded')), 2500)
    })])
  } catch (error) {
    lastError = `${name}: ${String(error)}`
  } finally {
    if (timer) clearTimeout(timer)
  }
}
let notifyOn = true
const lastSeen = new Map<string, number>()
const announced = new Map<string, string>()
const turnStarts = new Map<string, number>()
let peerStates = new Map<string, PeerSession['state']>()
// What T3 Code says about this session's thread; empty outside T3.
let t3Thread: { threadId: string; title: string; parentThreadId?: string | null } | undefined

const dataDir = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/mods-data`

const readAdvice = async ($: EngineInterface, id: string, at: number) => {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return undefined
  return $.fs.read(`${await dataDir($)}/orchestration/${id}.json`)
    .then(text => freshAdvice(JSON.parse(text), at)).catch(() => undefined)
}
let currentAdvice: OrchestrationAdvice | undefined
let peerAdvice = new Map<string, { advice: OrchestrationAdvice; nodes: AgentNode[] }>()

const node = (fields: Pick<AgentNode, 'id' | 'kind' | 'label' | 'type' | 'model' | 'status' | 'startedAt'> & Partial<AgentNode>): AgentNode => ({
  tools: 0,
  errors: 0,
  steps: 0,
  turns: 0,
  tokens: 0,
  recent: [],
  health: 'ok',
  lastEventAt: fields.startedAt,
  activityAt: fields.startedAt,
  phase: fields.status === 'running' ? 'thinking' : 'idle',
  ...fields,
})

const patch = (id: string, change: (one: AgentNode) => AgentNode) => (list: AgentNode[]) =>
  list.map(one => (one.id === id ? change(one) : one))

const upsert = (fresh: AgentNode) => (list: AgentNode[]) =>
  list.some(one => one.id === fresh.id) ? patch(fresh.id, old => ({ ...old, ...fresh })) (list) : [...list, fresh]

const isOver = (one: AgentNode) => one.status === 'done' || one.status === 'failed'

// Says something once per key and signature: a toast always, a native notification when `loud` and notifications are on.
// The signature is what must change to speak again; text with a running duration in it would otherwise repeat every tick.
const announce = async ($: EngineInterface, key: string, event: Omit<BoardEvent, 'at'>, loud: boolean, signature = event.text) => {
  if (announced.get(key) === signature) return
  announced.set(key, signature)
  const at = await $.clock.now()
  await update($, events, list => [...list, { ...event, at }].slice(-EVENTS))
  $.ui.toast(event.text, { timeoutMs: event.level === 'info' ? 4000 : 8000 })
  if (loud && notifyOn) void $.ui.notify(event.text, { title: 'Agent board' }).catch(() => undefined)
}

// Ownership is explicit; cwd, timing and peer snapshots never attribute a run.
const syncCodex = async ($: EngineInterface) => {
  const rollouts = await scanCodex($, sessionStart - 60_000).catch(() => [] as CodexInfo[])
  for (const rollout of rollouts) {
    const id = codexRunId(rollout, sessionId)
    if (!id) continue
    if (!(await read($, agents)).some(one => one.id === id)) {
      await update($, agents, upsert(node({
        id, parentId: 'main', kind: 'codex', label: 'codex', type: 'codex', model: 'codex',
        status: 'running', startedAt: rollout.startedAt,
      })))
    }
    const before = (await read($, agents)).find(one => one.id === id)
    const label = rollout.tasks.length > 0 ? `codex: ${rollout.tasks.join(', ')}` : before?.label ?? 'codex'
    await update(
      $,
      agents,
      patch(id, one => ({
        ...one,
        label,
        codex: rollout,
        tokens: rollout.tokens,
        tools: rollout.commands,
        lastEventAt: Math.max(one.lastEventAt, rollout.activityAt),
        activityAt: Math.max(one.activityAt ?? 0, rollout.activityAt),
        detail: rollout.lastAction,
        // A foreground `cx` returns after committing; the log says Codex itself is through.
        status: rollout.isComplete && one.status === 'running' ? 'done' : one.status,
        endedAt: rollout.isComplete && one.status === 'running' ? rollout.activityAt : one.endedAt,
      })),
    )
    if (rollout.lastMessage && before?.codex?.lastMessage !== rollout.lastMessage && !rollout.isComplete) {
      await announce($, `${id}:said`, { level: 'info', text: `Codex: ${clip(rollout.lastMessage, 160)}`, nodeId: id }, false)
    }
    if (rollout.isComplete && !before?.codex?.isComplete) {
      const took = formatDuration(rollout.activityAt - rollout.startedAt)
      await announce(
        $,
        `${id}:end`,
        { level: 'done', text: `✓ Codex finished (${took}, ${rollout.files.length} files): ${clip(rollout.summary ?? label, 200)}`, nodeId: id },
        true,
      )
    }
  }
}

// T3 Code's delegated children and the thread title, read from T3's store.
const syncT3 = async ($: EngineInterface, at: number) => {
  const scan: T3Scan | undefined = await scanT3($, sessionId)
  if (!scan) return
  t3Thread = { threadId: scan.threadId, title: scan.title, parentThreadId: scan.parentThreadId }
  if (scan.approvals !== undefined) await update($, agents, patch('main', one => ({ ...one,
    status: (scan.inputs ?? 0) > 0 ? 'waiting' : one.status === 'waiting' && one.phase === 'waiting-user' ? 'running' : one.status,
    approvalSince: scan.approvals! > 0 && one.toolStartedAt === undefined ? one.approvalSince ?? at : undefined,
  })))
  for (const fresh of t3Nodes(scan, at)) {
    const before = (await read($, agents)).find(one => one.id === fresh.id)
    await update($, agents, upsert({ ...fresh, approvalSince: fresh.approvalSince === undefined ? undefined : before?.approvalSince ?? at }))
    flow(`${fresh.id}:delegate`, fresh.startedAt, 'delegate', 'main', { sessionId, nodeId: fresh.id }, fresh.label)
    if (isOver(fresh)) flow(`${fresh.id}:result`, fresh.endedAt ?? at, 'result', fresh.id, { sessionId, nodeId: 'main' }, fresh.t3?.result ?? fresh.label)
    if (!isOver(fresh) || before?.status === fresh.status) continue
    const who = `${fresh.t3?.driver === 'codex' ? 'Codex' : 'Agent'} "${clip(fresh.label, 40)}"`
    await announce(
      $,
      `${fresh.id}:end`,
      {
        level: fresh.status === 'done' ? 'done' : 'fail',
        text: `${fresh.status === 'done' ? '✓' : '✗'} ${who} ${fresh.status === 'done' ? 'finished' : 'failed'} (${formatDuration((fresh.endedAt ?? at) - fresh.startedAt)}): ${clip(fresh.t3?.result ?? fresh.model, 140)}`,
        nodeId: fresh.id,
      },
      fresh.status === 'failed' || (fresh.endedAt ?? at) - fresh.startedAt > NOTIFY_AFTER_MS,
      fresh.status,
    )
  }
}

// Other sessions' snapshots: who is working, idle, stuck, or gone quiet.
const syncPeers = async ($: EngineInterface, at: number) => {
  const dir = `${await dataDir($)}/agent-board/web/sessions`
  const entries = (await $.fs.list(dir).catch(() => [])).filter(
    entry => entry.kind === 'file' && entry.name.endsWith('.json') && entry.name !== `${sessionId}.json` && at - entry.mtimeMs < 6 * 3600_000,
  )
  const snapshots = (
    await Promise.all(entries.map(entry => $.fs.read(`${dir}/${entry.name}`).then(text => JSON.parse(text) as Snapshot).catch(() => undefined)))
  ).filter((one): one is Snapshot => one !== undefined && Array.isArray(one.agents) && !isHelperCwd(one.cwd ?? ''))

  const adviceEntries = await Promise.all(snapshots.map(async one => {
    const advice = await readAdvice($, one.sessionId, at)
    return advice ? [one.sessionId, { advice, nodes: one.agents }] as const : undefined
  }))
  peerAdvice = new Map(adviceEntries.filter(one => one !== undefined))

  const list = snapshots
    .map(one => peerFromSnapshot(one, at))
    .filter(one => one.state !== 'ended' || at - one.updatedAt < 600_000)
    .filter(one => one.state !== 'silent' || at - one.updatedAt < 3600_000)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  await update($, peers, () => list)

  // One live session speaks for the rest, so a frozen session is reported once.
  const live = [sessionId, ...list.filter(one => one.state !== 'silent' && one.state !== 'ended').map(one => one.sessionId)].sort()
  const isLeader = live[0] === sessionId
  for (const peer of list) {
    const was = peerStates.get(peer.sessionId)
    if (isLeader && peer.state === 'silent' && (was === 'working' || was === 'looping' || was === 'stalled')) {
      await announce($, `peer:${peer.sessionId}`, { level: 'warn', text: `⚠ Session ${peer.name} stopped answering while it was working` }, true, 'silent')
    }
    if (peer.state !== 'silent') announced.delete(`peer:${peer.sessionId}`)
  }
  peerStates = new Map(list.map(one => [one.sessionId, one.state]))
}

// The session's title (its ai-title in the transcript), re-read every 15s so two sessions in one folder tell apart.
let title = ''
let titleAt = 0
const sessionTitle = async ($: EngineInterface, cwd: string, at: number) => {
  if (title && at - titleAt < 15_000) return title
  titleAt = at
  const home = (await $.env.get('HOME')) ?? ''
  const transcript = `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`
  const found = await $.process.run(['grep', '-o', '"aiTitle":"[^"]*"', transcript]).catch(() => undefined)
  const last = found?.stdout.trim().split('\n').pop() ?? ''
  title = last.match(/"aiTitle":"([^"]*)"/)?.[1] ?? title
  return title
}

// Helper sessions (the remember plugin's summarizer) are not user work.
function isHelperCwd(cwd: string) {
  return cwd.startsWith('/tmp/remember-summarizer-cwd')
}

// The heartbeat has no transcript, database, rollout, or peer reads on its path.
const writeSnapshot = ($: EngineInterface, at: number, isEnded = false): Promise<void> => {
  sessionEnded ||= isEnded
  const job = snapshotQueue.catch(() => undefined).then(async () => {
    if (isHelperCwd(sessionCwd)) return
    await update($, agents, list => {
      const activeParents = new Set(list.filter(n => (n.status === 'running' || n.status === 'waiting') && n.id !== 'main').map(n => n.parentId ?? 'main'))
      for (let depth = 0; depth < list.length; depth++) {
        const size = activeParents.size
        for (const n of list) if (activeParents.has(n.id) && n.parentId) activeParents.add(n.parentId)
        if (activeParents.size === size) break
      }
      const activity = new Map(list.map(n => [n.id, Math.max(n.activityAt ?? n.lastEventAt, lastSeen.get(n.id) ?? 0)]))
      // Propagate actual evidence, never the scanner's polling/heartbeat time.
      for (let depth = 0; depth < list.length; depth++) {
        let changed = false
        for (const n of list) {
          if (!n.parentId || !activity.has(n.parentId)) continue
          if (activity.get(n.id)! > activity.get(n.parentId)!) {
            activity.set(n.parentId, activity.get(n.id)!); changed = true
          }
        }
        if (!changed) break
      }
      return list.map(one => {
        const fresh = { ...one, activityAt: activity.get(one.id)!, lastEventAt: Math.max(one.lastEventAt, lastSeen.get(one.id) ?? 0) }
        const children = activeParents.has(one.id)
        const judged = assessHealth(fresh, at, children)
        return { ...fresh, phase: nodePhase(fresh, children), health: judged.health, healthNote: judged.note }
      })
    })
    const list = await read($, agents)
    const snapshot: Snapshot & { activity: number[]; events: BoardEvent[] } = {
      sessionId, name: sessionCwd.split('/').pop() ?? sessionCwd,
      title: t3Thread?.title || title, t3: t3Thread, cwd: sessionCwd,
      updatedAt: at, seq: ++seq, lastError, isEnded: sessionEnded,
      summary: snapshotSummary(list), links: [...links], advice: currentAdvice,
      agents: list, activity: await read($, activity), events: (await read($, events)).slice(-15),
    }
    const body = JSON.stringify(snapshot)
    try {
      await $.fs.write(`${snapshotPath}.tmp`, body)
      const moved = await $.process.run(['mv', '-f', `${snapshotPath}.tmp`, snapshotPath], { timeoutMs: 3000 })
      if (moved.exitCode !== 0) throw new Error('mv failed')
    } catch {
      // A failed rename still emits a heartbeat.
      await $.fs.write(snapshotPath, body)
    }
  })
  snapshotQueue = job
  return job
}

const syncLocal = async ($: EngineInterface, at: number) => {
  const listed = await $.agent.list().catch(() => [])
  for (const info of listed) {
    const status = fromAgentStatus(info.status)
    await update($, agents, list =>
      list.some(one => one.id === info.id)
        ? patch(info.id, one => (one.status === status ? one : { ...one, status, activityAt: at, lastEventAt: at, endedAt: status === 'done' || status === 'failed' ? at : undefined, approvalSince: undefined }))(list)
        : status === 'done' || status === 'failed'
          ? list
          : [
              ...list,
              node({
                id: info.id,
                parentId: info.parentId ?? 'main',
                kind: 'agent',
                label: info.description || info.name || info.type,
                type: info.type,
                model: '',
                status,
                startedAt: at,
              }),
            ],
    )
  }

  // Codex jobs the prompt-router mod started for this session.
  try {
    const jobs: Job[] = JSON.parse(await $.fs.read(`${await dataDir($)}/codex-jobs/${sessionId}.json`))
    const known = new Set((await read($, agents)).map(one => one.id))
    for (const job of jobs) {
      if (job.status !== 'running' && !known.has(`codex-job-${job.id}`) && at - (job.endedAt ?? 0) > 60_000) continue
      const status = job.status === 'running' ? 'running' : job.status === 'done' ? 'done' : 'failed'
      const id = `codex-job-${job.id}`
      await update(
        $,
        agents,
        known.has(id)
          ? patch(id, one => ({ ...one, status: one.status === 'done' ? one.status : status, endedAt: one.endedAt ?? job.endedAt }))
          : upsert(node({ id, parentId: 'main', kind: 'codex', label: job.prompt.slice(0, 60), type: 'codex', model: 'codex', status, startedAt: job.startedAt, endedAt: job.endedAt })),
      )
    }
  } catch {}

}

const sync = async ($: EngineInterface) => {
  if (busy || sessionEnded) return
  busy = true
  try {
    tick++
    const at = await $.clock.now()
    await writeSnapshot($, at)
    await Promise.all([
      collect('agents/jobs', at, () => syncLocal($, at)),
      collect('codex', at, () => syncCodex($)),
      collect('peers', at, () => syncPeers($, at)),
      collect('t3', at, () => syncT3($, at)),
      collect('metadata', at, async () => {
        currentAdvice = await readAdvice($, sessionId, at)
        await sessionTitle($, sessionCwd, at)
      }),
    ])

    await collect('notifications', at, async () => {
      for (const one of await read($, agents)) {
        if (one.kind !== 'main' && isOver(one)) flow(`${one.id}:result`, one.endedAt ?? at, 'result', one.id, { sessionId, nodeId: one.parentId ?? 'main' }, one.t3?.result ?? one.codex?.summary ?? one.label)
        const who = one.kind === 'main' ? 'Main session' : one.kind === 'codex' ? 'Codex' : `Agent "${clip(one.label, 40)}"`
        if (one.health === 'looping' || one.health === 'stalled') {
          await announce($, `${one.id}:health`, { level: 'warn', text: `${HEALTH_BADGE[one.health]} ${who}: ${one.healthNote ?? ''}`, nodeId: one.id }, true, one.health)
        } else if (one.health === 'approval') {
          await announce($, `${one.id}:health`, { level: 'warn', text: `⏸ ${who}: ${one.healthNote ?? 'waiting for approval'}`, nodeId: one.id }, false, one.health)
        } else announced.delete(`${one.id}:health`)

        if (one.kind !== 'main' && one.kind !== 'codex' && !one.t3 && isOver(one)) {
          const took = (one.endedAt ?? at) - one.startedAt
          await announce(
            $,
            `${one.id}:end`,
            {
              level: one.status === 'done' ? 'done' : 'fail',
              text: `${one.status === 'done' ? '✓' : '✗'} ${who} ${one.status === 'done' ? 'finished' : 'failed'} (${formatDuration(took)}, ${one.tools} tools)`,
              nodeId: one.id,
            },
            took > NOTIFY_AFTER_MS || one.status === 'failed',
            one.status,
          )
        }
      }
    })

    const list = await read($, agents)
    const running = list.filter(one => one.status === 'running').length
    await update($, activity, history => [...history, running].slice(-HISTORY))
    if (tick % 2 === 0 || running > 0) await update($, now, () => at)
  } catch (error) {
    lastError = String(error)
  } finally {
    busy = false
  }
}

const startWeb = async ($: EngineInterface) => {
  const dir = `${await dataDir($)}/agent-board/web`
  const url = `http://localhost:${PORT}/`
  await update($, webUrl, () => url)
  void (async () => {
    try {
      const server = $.process.spawn({
        argv: ['python3', '-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', dir],
      })
      for await (const piece of server) {
        if (/Address already in use/.test(piece.text)) $.ui.log(`agent-board: port ${PORT} already served`, { to: 'debug' })
      }
    } catch {}
  })()

  return url
}

const setNotify = async ($: EngineInterface, on: boolean) => {
  notifyOn = on
  await $.store.set('notify', on)
}

const ago = (ms: number) => (ms < 5000 ? 'now' : `${formatDuration(ms)} ago`)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    sessionId = await $.session.id()
    sessionCwd = await $.session.cwd()
    sessionEnded = false
    const dir = `${await dataDir($)}/agent-board/web`
    snapshotPath = `${dir}/sessions/${sessionId}.json`
    try {
      const previous = JSON.parse(await $.fs.read(snapshotPath)).seq
      if (Number.isSafeInteger(previous)) seq = Math.max(seq, previous)
    } catch {}
    await $.process.run(['mkdir', '-p', `${dir}/sessions`]).catch(() => undefined)
    await $.fs.write(`${dir}/index.html`, WEB_PAGE).catch(() => undefined)
    notifyOn = (await $.store.get('notify').catch(() => undefined)) !== false

    const at = await $.clock.now()
    const main = (await read($, agents)).find(one => one.id === 'main')
    sessionStart = main?.startedAt ?? at
    await update(
      $,
      agents,
      list =>
        // A reload keeps the board; nodes from before this version get the new fields.
        main
          ? list.map(one => node({ ...one }))
          : upsert(node({ id: 'main', kind: 'main', label: 'main session', type: 'main', model: '', status: 'idle', startedAt: at }))(list),
    )
    void $.session.model().then(model => update($, agents, patch('main', one => ({ ...one, model }))))
    await $.command.register({
      name: 'board',
      description: 'Live agent board: /board (pane), /board web, /board notify on|off, /board clear',
    })
    await writeSnapshot($, at)
    $.clock.every(1000, () => void sync($).catch(error => $.ui.log(`agent-board: ${String(error)}`, { to: 'debug' })))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await writeSnapshot($, await $.clock.now(), true).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    const [verb, arg] = e.args.trim().split(/\s+/)
    if (verb === 'web') {
      const url = await startWeb($)
      await $.process.run(['cmd.exe', '/c', 'start', '', url], { timeoutMs: 5000 }).catch(() => undefined)

      return { text: `Agent board on ${url} (all sessions on this machine).` }
    }
    if (verb === 'notify') {
      const turnOn = arg === undefined ? !notifyOn : arg !== 'off'
      await setNotify($, turnOn)
      const tried = turnOn ? await $.ui.notify('Agent board notifications are on', { title: 'Agent board' }).catch(() => undefined) : undefined

      return {
        text: turnOn
          ? `Native notifications on${tried && !tried.isSent ? ` (but not delivered: ${tried.reason}; toasts still show)` : ''}.`
          : 'Native notifications off; toasts still show.',
      }
    }
    if (verb === 'clear') {
      await update($, agents, all => all.filter(one => one.kind === 'main' || !isOver(one)))
      await update($, events, () => [])

      return { text: 'Cleared finished agents and the event list.' }
    }
    await $.ui.open({ id: PANE, title: 'Agents' })

    return { text: 'Agent board opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.agentId) {
      await update(
        $,
        agents,
        upsert(
          node({
            id: spawned.agentId,
            parentId: e.parentAgentId ?? 'main',
            kind: e.workflow ? 'workflow' : 'agent',
            label: e.description || e.subagentType,
            type: e.subagentType,
            model: spawned.model,
            status: 'running',
            startedAt: await $.clock.now(),
          }),
        ),
      )
      flow(`agent:${spawned.agentId}:delegate`, await $.clock.now(), 'delegate', e.parentAgentId ?? 'main', { sessionId, nodeId: spawned.agentId }, e.description || e.subagentType)
      if ((await read($, agents)).filter(one => one.kind !== 'main').length === 1) {
        void $.ui.open({ id: PANE, title: 'Agents' }).catch(() => undefined)
      }
    }

    return spawned
  })

  // A finished background task: the Codex node it ran learns how it ended.
  on('prompt.submit', async ($, e, next) => {
    const note = e.origin.kind === 'task-notification' ? parseTaskNotification(e.text) : undefined
    if (note) {
      lastSeen.set('main', await $.clock.now())
      const target = (await read($, agents)).find(n => n.id === note.taskId || (note.toolUseId !== undefined && n.toolUseId === note.toolUseId))
      flow(`notification:${note.taskId ?? note.toolUseId}:${note.status}`, await $.clock.now(), 'result', target?.id ?? note.taskId ?? 'child', { sessionId, nodeId: target?.parentId ?? 'main' }, note.summary)
    }
    if (note?.toolUseId) {
      if (note.outputFile) {
        const output = await $.fs.read(note.outputFile).catch(() => '')
        await update($, agents, list => mergeCodexRun(list, note.toolUseId!, output))
      }
      const target = (await read($, agents)).find(one => one.toolUseId === note.toolUseId)
      const id = target?.id ?? `codex-${note.toolUseId}`
      if (target) {
        const exit = Number(note.summary?.match(/exit code (\d+)/)?.[1] ?? 0)
        const failed = note.status !== 'completed' || exit !== 0
        const at = await $.clock.now()
        await update($, agents, patch(id, one => ({ ...one, status: failed ? 'failed' : 'done', endedAt: one.endedAt ?? at, activityAt: at, approvalSince: undefined, phase: 'idle' })))
        flow(`${id}:result`, at, 'result', id, { sessionId, nodeId: target.parentId ?? 'main' }, note.summary)
        if (failed) {
          await announce($, `${id}:end`, { level: 'fail', text: `✗ Codex run failed: ${clip(note.summary ?? note.status ?? '', 200)}`, nodeId: id }, true)
        } else if (!target.codex?.isComplete) {
          await announce($, `${id}:end`, { level: 'done', text: `✓ Codex run finished: ${clip(note.summary ?? target.label, 200)}`, nodeId: id }, true)
        }
      }
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const id = e.agentId ?? 'main'
    const at = await $.clock.now()
    turnStarts.set(id, at)
    lastSeen.set(id, at)
    await update(
      $,
      agents,
      patch(id, one => ({ ...one, status: 'running', endedAt: undefined, turns: one.turns + 1, lastEventAt: at, activityAt: at, phase: 'thinking', approvalSince: undefined })),
    )

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId ?? 'main'
    lastSeen.set(id, Date.now())
    await update($, agents, patch(id, one => ({ ...one, steps: one.steps + 1, model: e.model || one.model })))
    // Every streamed piece counts as a sign of life; the 1 s tick folds it into the node.
    const stream = next(e)
    for await (const chunk of stream) {
      lastSeen.set(id, Date.now())
      yield chunk
    }

    return await stream.result
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? 'main'
    const usage = e.usage
    const spent = usage ? usage.input_tokens + usage.output_tokens + (usage.cache_creation_input_tokens ?? 0) : 0
    const at = await $.clock.now()
    await update(
      $,
      agents,
      patch(id, one => ({
        ...one,
        status: e.agentId === undefined ? 'idle' : one.status,
        tool: undefined,
        detail: undefined,
        toolStartedAt: undefined,
        approvalSince: undefined,
        lastEventAt: at,
        activityAt: at,
        phase: e.agentId === undefined ? 'waiting-user' : 'idle',
        tokens: one.tokens + spent,
      })),
    )
    const took = at - (turnStarts.get(id) ?? at)
    if (e.agentId === undefined) {
      if (e.reason === 'error') {
        await announce($, `main:turn:${at}`, { level: 'fail', text: `✗ Main turn ended on an API error after ${formatDuration(took)}`, nodeId: 'main' }, true)
      } else if (e.reason === 'answer' && took > NOTIFY_AFTER_MS) {
        await announce($, `main:turn:${at}`, { level: 'done', text: `✓ Turn finished (${formatDuration(took)}), waiting for you`, nodeId: 'main' }, true)
      }
    }

    return next(e)
  })

  // An ask the mode puts to the person: remembered until the call ends.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id) {
      const at = await $.clock.now()
      await update($, agents, patch(e.agentId ?? 'main', one => ({ ...one, approvalSince: one.approvalSince ?? at, phase: 'waiting-approval' })))
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? 'main'
    const tool = String(e.tool)
    const input = e as unknown as Record<string, unknown>
    const detail = describeTool(tool, input)
    const startedAt = await $.clock.now()
    lastSeen.set(id, startedAt)
    await update($, agents, patch(id, one => ({ ...one, tool, detail, toolStartedAt: startedAt, toolBackground: input.run_in_background === true, approvalSince: undefined, phase: 'tool', tools: one.tools + 1, lastEventAt: startedAt, activityAt: startedAt })))

    const command = typeof input.command === 'string' ? input.command : ''
    const codexId = tool === 'Bash' && isCodexCommand(command) ? `codex-${e.tool_use_id}` : undefined
    if (codexId) {
      const tasks = codexTasks(command)
      await update(
        $,
        agents,
        upsert(
          node({
            id: codexId,
            parentId: id,
            kind: 'codex',
            label: tasks.length > 0 ? `codex: ${tasks.join(', ')}` : detail,
            type: 'codex',
            model: 'codex',
            status: 'running',
            startedAt,
            toolUseId: e.tool_use_id,
          }),
        ),
      )
      await announce($, `${codexId}:start`, { level: 'info', text: `Codex started: ${clip(tasks.join(', ') || detail, 120)}`, nodeId: codexId }, false)
    }

    // Messaging calls expose their destination in the tool input.
    if (/SendMessage|session[-_]chat.*(?:broadcast|send|message)/i.test(tool)) {
      const peer = input.to ?? input.recipient ?? input.target ?? input.name
      const knownPeer = (await read($, peers)).find(p => p.sessionId === peer || p.name === peer)
      const targetSession = input.targetSessionId ?? input.target_session_id ?? knownPeer?.sessionId
      flow(`tool:${e.tool_use_id}:message`, startedAt, 'peer-msg', id,
        { sessionId: typeof targetSession === 'string' ? targetSession : undefined, peer: typeof peer === 'string' ? peer : 'broadcast' },
        String(input.message ?? input.content ?? input.text ?? detail))
    }
    const ran = await next(e).catch(async error => {
      const at = await $.clock.now()
      lastSeen.set(id, at)
      await update($, agents, patch(id, one => ({ ...one, tool: undefined, detail: undefined,
        toolStartedAt: undefined, approvalSince: undefined, phase: 'thinking', activityAt: at, lastEventAt: at,
        errors: one.errors + 1, recent: [...one.recent, { tool, detail, at, ok: false, signature: toolSignature(tool, input), polling: toolSignature(tool, input) === undefined }].slice(-12),
      })))
      throw error
    })
    const endedAt = await $.clock.now()
    if (/(?:^|__|\.)delegate_task$/.test(tool)) {
      const decode = (value: unknown): Record<string, unknown> | undefined => {
        if (typeof value === 'string') { try { return decode(JSON.parse(value)) } catch { return undefined } }
        if (!value || typeof value !== 'object') return undefined
        const obj = value as Record<string, unknown>
        if (obj.taskId || obj.subagentId || obj.childThreadId) return obj
        if (obj.structuredContent) return decode(obj.structuredContent)
        if (Array.isArray(obj.content)) for (const block of obj.content) {
          const found = decode(block?.text); if (found) return found
        }
        return undefined
      }
      const result = decode(ran.result) ?? decode(ran.text)
      const task = result?.subagentId ?? result?.taskId
      if (typeof task === 'string' && !ran.isError && ran.deny === undefined) {
        const childId = `t3-${task}`
        const childThreadId = typeof result?.childThreadId === 'string' ? result.childThreadId : undefined
        const status = t3Status(String(result?.status ?? 'running'))
        const target = input.target as { model?: string; providerInstanceId?: string } | undefined
        if (!(await read($, agents)).some(n => n.id === childId)) await update($, agents, upsert(node({
          id: childId, parentId: id, kind: target?.providerInstanceId === 'codex' ? 'codex' : 'agent',
          label: String(input.title ?? input.task ?? 'Delegated task').slice(0, 120), type: 't3', model: target?.model ?? '',
          status, startedAt, activityAt: endedAt, endedAt: status === 'done' || status === 'failed' ? endedAt : undefined,
          t3: { threadId: childThreadId ?? '', childThreadId, driver: String(result?.providerInstanceId ?? target?.providerInstanceId ?? ''), result: typeof result?.summary === 'string' ? result.summary : undefined },
        })))
        flow(`${childId}:delegate`, startedAt, 'delegate', id, { sessionId, nodeId: childId }, String(input.task ?? detail))
        if (status === 'done' || status === 'failed') flow(`${childId}:result`, endedAt, 'result', childId, { sessionId, nodeId: id }, String(result?.summary ?? ''))
      }
    }
    lastSeen.set(id, endedAt)
    const ok = !ran.isError && ran.deny === undefined
    await update($, agents, list => {
      const output = [ran.text, typeof ran.result === 'string' ? ran.result : (ran.result as { stdout?: string } | undefined)?.stdout].filter(Boolean).join('\n')
      const linked = codexId ? mergeCodexRun(list, e.tool_use_id, output) : list
      const runId = linked.find(one => one.toolUseId === e.tool_use_id)?.id ?? codexId
      const cleared = patch(id, one => ({
        ...one,
        ...(one.tool === tool && one.detail === detail ? { tool: undefined, detail: undefined, toolStartedAt: undefined } : {}),
        approvalSince: undefined,
        errors: one.errors + (ok ? 0 : 1),
        lastEventAt: endedAt,
        activityAt: endedAt,
        phase: 'thinking',
        recent: [...one.recent, { tool, detail, at: endedAt, ok, signature: toolSignature(tool, input), polling: toolSignature(tool, input) === undefined }].slice(-12),
      }))(linked)
      if (!codexId) return cleared
      // A background Bash call returns at once; its task notification ends the node.
      const isBackground = input.run_in_background === true || (ran.result as { backgroundTaskId?: string } | undefined)?.backgroundTaskId !== undefined

      return isBackground ? cleared : patch(runId!, one => ({ ...one, status: ok ? 'done' : 'failed', endedAt: one.endedAt ?? endedAt }))(cleared)
    })
    if (codexId && !ok && input.run_in_background !== true) {
      const failedId = (await read($, agents)).find(one => one.toolUseId === e.tool_use_id)?.id ?? codexId
      await announce($, `${failedId}:end`, { level: 'fail', text: `✗ Codex run failed: ${clip(ran.text ?? ran.deny ?? '', 200)}`, nodeId: failedId }, true)
    }

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const at = (await read($, now)) || (await $.clock.now())
    const width = Math.max(40, e.props.bodyColumns ?? e.viewport?.columns ?? 80)
    const rows = treeOrder(list)
    const best = newestVersions(list)
    const counts = {
      running: list.filter(one => one.status === 'running').length,
      done: list.filter(one => one.status === 'done').length,
      failed: list.filter(one => one.status === 'failed').length,
      flagged: list.filter(one => one.health === 'looping' || one.health === 'stalled' || one.health === 'approval').length,
    }
    const url = await read($, webUrl)
    const feed = (await read($, events)).slice(-6).reverse()
    const others = await read($, peers)
    const urgent = (state: PeerSession['state']) => state === 'approval' || state === 'looping' || state === 'stalled' || state === 'silent'
    const waiting = list.filter(one => one.health === 'approval').length + others.filter(peer => peer.state === 'approval').length
    const trouble = list.filter(one => one.health === 'looping' || one.health === 'stalled' || one.status === 'failed').length + others.filter(peer => urgent(peer.state) && peer.state !== 'approval').length
    const quiet = others.filter(peer => peer.state === 'ended').length
    const spark = sparkline((await read($, activity)).slice(-Math.min(HISTORY, width - 12)))
    const color = (one: AgentNode) =>
      one.status === 'failed'
        ? 'red'
        : one.health === 'looping' || one.health === 'stalled'
          ? 'red'
          : one.health === 'approval'
            ? 'yellow'
            : one.status === 'done'
              ? undefined
              : one.kind === 'codex'
                ? 'magenta'
                : one.status === 'running'
                  ? 'green'
                  : 'yellow'
    const labelRoom = Math.max(12, Math.floor(width * 0.35))
    const eventColor = (level: BoardEvent['level']) => (level === 'fail' ? 'red' : level === 'warn' ? 'yellow' : level === 'done' ? 'green' : undefined)
    const peerColor = (state: PeerSession['state']) =>
      state === 'working' ? 'green' : state === 'looping' || state === 'stalled' || state === 'silent' ? 'red' : state === 'approval' ? 'yellow' : undefined
    const peerGlyph = (state: PeerSession['state']) =>
      state === 'working' ? '●' : state === 'idle' ? '○' : state === 'ended' ? '·' : state === 'approval' ? '⏸' : state === 'silent' ? '?' : '⚠'

    const renderAdvice = (id: string, advice: OrchestrationAdvice | undefined, nodes: AgentNode[]) => {
      if (!freshAdvice(advice, at) || !advice) return null
      const comparison = compareAdvice(advice, nodes)
      const line = adviceLine(advice, comparison)
      const chunks = line.split(/(\d+ codex)/)
      return (
        <Box key={`advice-${id}`} flexDirection="column">
          <Text dir="ltr" wrap="truncate">{chunks.map((chunk, i) => /\d+ codex/.test(chunk)
            ? <Text key={`codex-${i}`} color="magenta">{chunk}</Text> : chunk)}</Text>
          <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }}>
            <Text>{adviceTitle(advice)}</Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {(waiting > 0 || trouble > 0) && (
          <Box>
            {waiting > 0 && <Text color="yellow">⏸ {waiting} waiting for you  </Text>}
            {trouble > 0 && <Text color="red">⚠ {trouble} in trouble</Text>}
          </Box>
        )}
        <Box>
          <Text bold>{list.length - 1} agents </Text>
          <Text color="green">{counts.running} running </Text>
          <Text dimColor>· {counts.done} done </Text>
          {counts.failed > 0 && <Text color="red">· {counts.failed} failed </Text>}
          {counts.flagged > 0 && <Text color="yellow">· {counts.flagged} need a look</Text>}
        </Box>
        {renderAdvice(sessionId, currentAdvice, list)}
        <Text color="green">{spark || ' '}</Text>
        <Text> </Text>
        {rows.map(({ node: one, depth, isLast }) => {
          const arrow = { send: '▶', recv: '◀', done: '✓', idle: '·' }[linkDirection(one)]
          const indent = depth === 0 ? '' : `${'│ '.repeat(depth - 1)}${isLast ? '└' : '├'}${arrow}`
          const tone = modelTone(one, best)
          const pad = ' '.repeat(indent.length + 2)
          const room = Math.max(10, width - indent.length - 4)
          const elapsed = formatDuration((one.endedAt ?? at) - one.startedAt)
          const meta = [
            one.kind === 'agent' ? one.type : one.kind,
            one.t3 ? '' : one.kind === 'codex' ? `${one.tools} cmds` : `${one.tools} tools`,
            one.errors ? `${one.errors} err` : '',
            one.tokens ? formatTokens(one.tokens) : '',
            elapsed,
          ]
            .filter(Boolean)
            .join(' · ')
          const now = one.tool
            ? `${one.tool} ${one.detail ?? ''}`.trim() + (one.toolStartedAt ? ` (${formatDuration(at - one.toolStartedAt)})` : '')
            : one.kind === 'codex'
              ? one.detail ?? (one.codex ? 'thinking' : 'starting')
              : one.status === 'running'
                ? `thinking · last sign ${ago(at - one.lastEventAt)}`
                : one.status
          const badge = HEALTH_BADGE[one.health]
          const recent = one.kind === 'codex' ? '' : recentSummary(one.recent)
          const codexLine = one.codex
            ? [`${one.codex.files.length} files`, one.codex.tasks.length ? `tasks ${one.codex.tasks.join(', ')}` : '', one.codex.cwd.split('/').pop() ?? '']
                .filter(Boolean)
                .join(' · ')
            : ''

          return (
            <Box key={one.id} flexDirection="column">
              <Box>
                <Text color={depth === 0 ? undefined : tone.color} dimColor={depth === 0}>{indent}</Text>
                <Text color={color(one)}>{STATUS_GLYPH[one.status]} </Text>
                <Text bold={one.status === 'running'} dimColor={one.status === 'done'}>
                  {one.label.slice(0, labelRoom)}
                </Text>
                {badge !== '' && one.health !== 'idle' && <Text color={color(one)}> {badge}</Text>}
                {tone.label !== '' && <Text color={tone.color} bold> {tone.label}</Text>}
                <Text dimColor>  {meta}</Text>
                {(one.kind === 'agent' || one.kind === 'workflow') && !isOver(one) && (
                  <Button key={`view-${one.id}`} plain label=" [view]" onPress={() => void $.ui.view({ agentId: one.id })} />
                )}
              </Box>
              {!isOver(one) && (
                <Text dimColor={!one.tool && one.kind !== 'codex'} wrap="truncate">
                  {pad}
                  {clip(now, room)}
                </Text>
              )}
              {one.healthNote && one.health !== 'ok' && (
                <Text color={one.health === 'idle' ? undefined : color(one)} dimColor={one.health === 'idle'} wrap="truncate">
                  {pad}
                  {clip(one.healthNote, room)}
                </Text>
              )}
              {codexLine !== '' && (
                <Text dimColor wrap="truncate">
                  {pad}
                  {clip(codexLine, room)}
                </Text>
              )}
              {isOver(one) && one.codex?.summary && (
                <Text dimColor wrap="truncate">
                  {pad}
                  {clip(one.codex.summary, room)}
                </Text>
              )}
              {!isOver(one) && recent !== '' && (
                <Text dimColor wrap="truncate">
                  {pad}recent: {clip(recent, room - 8)}
                </Text>
              )}
            </Box>
          )
        })}
        {feed.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold>Events</Text>
            {feed.map((event, index) => (
              <Text key={`event-${event.at}-${index}`} color={eventColor(event.level)} wrap="truncate">
                {clip(`${ago(at - event.at).padEnd(10)} ${event.text}`, width - 2)}
              </Text>
            ))}
          </Box>
        )}
        {others.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold>Other sessions</Text>
            {others.slice(0, 8).map(peer => (
              <Box key={`peer-${peer.sessionId}`} flexDirection="column">
              <Text color={peerColor(peer.state)} wrap="truncate">
                {clip(
                  `${peerGlyph(peer.state)} ${clip(peer.name, 22).padEnd(22)} ${peer.state.padEnd(8)} ${peer.note}${peer.running ? ` · ${peer.running} running` : ''} · ${formatDuration(at - peer.since)}`,
                  width - 2,
                )}
              </Text>
              {renderAdvice(peer.sessionId, peerAdvice.get(peer.sessionId)?.advice, peerAdvice.get(peer.sessionId)?.nodes ?? [])}
              </Box>
            ))}
            {others.length > 8 && <Text dimColor>+{others.length - 8} more sessions ({quiet} ended)</Text>}
          </Box>
        )}
        <Text> </Text>
        <Box>
          {url ? <Text dimColor>web: {url}</Text> : <Button key="web" plain label="[open web board]" onPress={() => void startWeb($)} />}
          <Text> </Text>
          <Button
            key="clear"
            plain
            label="[clear finished]"
            onPress={async () => {
              await update($, agents, all => all.filter(one => one.kind === 'main' || !isOver(one)))
            }}
          />
          <Text> </Text>
          <Button key="clear-history" plain label="[clear history]" onPress={async () => void (await update($, events, () => []))} />
          <Text> </Text>
          <Button
            key="notify"
            plain
            label={notifyOn ? '[notifications: on]' : '[notifications: off]'}
            onPress={async () => {
              await setNotify($, !notifyOn)
              await update($, now, () => Date.now())
            }}
          />
        </Box>
      </Box>
    )
  })
}
