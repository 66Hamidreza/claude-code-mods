import type { AgentNode, CodexInfo, Health, NodeStatus, PeerSession, RecentCall } from '../types'

export type OrchestrationAdvice = {
  at: number
  prompt: string
  mode: 'single' | 'parallel'
  parts: { title: string; executor: 'claude' | 'codex'; model: string; effort?: string }[]
  reason: string
}

export type AdviceComparison = {
  advisedParallel: number
  advisedCodex: number
  actualAgents: number
  actualCodex: number
  verdict: 'followed' | 'under' | 'over' | 'single-ok'
}

// The caller supplies the clock so freshness and comparisons stay deterministic.
export const freshAdvice = (value: unknown, now: number): OrchestrationAdvice | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const a = value as OrchestrationAdvice
  if (!Number.isFinite(a.at) || now - a.at > 6 * 3600_000 || a.at > now ||
      !['single', 'parallel'].includes(a.mode) || typeof a.prompt !== 'string' || typeof a.reason !== 'string' ||
      !Array.isArray(a.parts) || !a.parts.every(p => p && typeof p.title === 'string' &&
        ['claude', 'codex'].includes(p.executor) && typeof p.model === 'string' &&
        (p.effort === undefined || typeof p.effort === 'string'))) return undefined
  return a
}

// Nodes are already scoped to this session. Main-session work is never an extra agent.
export const compareAdvice = (advice: OrchestrationAdvice, nodes: readonly AgentNode[]): AdviceComparison => {
  const advisedParallel = advice.mode === 'parallel' ? advice.parts.filter(p => p.executor === 'claude').length : 0
  const advisedCodex = advice.mode === 'parallel' ? advice.parts.filter(p => p.executor === 'codex').length : 0
  const started = nodes.filter(n => n.startedAt >= advice.at)
  const actualAgents = started.filter(n => n.kind === 'agent' || n.kind === 'workflow').length
  const actualCodex = started.filter(n => n.kind === 'codex').length
  const verdict = actualAgents > advisedParallel || actualCodex > advisedCodex ? 'over'
    : advice.mode === 'single' ? 'single-ok'
    : actualAgents < advisedParallel || actualCodex < advisedCodex ? 'under' : 'followed'
  return { advisedParallel, advisedCodex, actualAgents, actualCodex, verdict }
}

export const adviceTitle = (advice: OrchestrationAdvice) => [advice.reason,
  ...advice.parts.map(p => `${p.title}: ${p.executor} · ${p.model}${p.effort ? ` · ${p.effort}` : ''}`),
].join('\n')

export const adviceLine = (advice: OrchestrationAdvice, c: AdviceComparison) =>
  `advice: ${advice.mode}${advice.mode === 'parallel' ? ` ×${advice.parts.length} (${c.advisedParallel} claude · ${c.advisedCodex} codex)` : ''} → ran ${c.actualAgents} agents · ${c.actualCodex} codex [${c.verdict}]`

export const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// One short line saying what a tool call is doing, from its input.
export const describeTool = (tool: string, input: Record<string, unknown>): string => {
  const pick = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined)
  const path = pick('file_path') ?? pick('path') ?? pick('notebook_path')
  const detail =
    pick('command') ??
    (path ? path.split('/').slice(-2).join('/') : undefined) ??
    pick('pattern') ??
    pick('query') ??
    pick('url') ??
    pick('description') ??
    pick('skill') ??
    pick('prompt') ??
    ''

  return clip(detail.replace(/\s+/g, ' ').trim(), 80)
}

// Tokenize shell words while keeping quoted separators inside their argument.
const commandSegments = (command: string): string[][] => {
  const segments: string[][] = [[]]
  const tokens = command.match(/(?:[^\s;&|()'"\\]+|\\[\s\S]|"(?:\\.|[^"\\])*"|'[^']*')+|[;&|()\n]/g) ?? []
  for (const token of tokens) {
    if (/^[;&|()\n]$/.test(token)) segments.push([])
    else segments[segments.length - 1]!.push(token.replace(/^(['"])(.*)\1$/, '$2'))
  }
  return segments.map(words => {
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0] ?? '')) words.shift()
    return words
  })
}

export const isCodexCommand = (command: string) => commandSegments(command).some(words =>
  (words[0] === 'cx' && !words.slice(1).some(word => ['-h', '--help', '--version'].includes(word))) ||
  (words[0] === 'codex' && words[1] === 'exec'),
)

export const CODEX_MARKER = /^CX_RUN_V1 owner=(\S+) run=(\S+) task=(\S+)(?:\r?\n|$)/

export const parseCodexMarker = (text: string) => {
  const match = text.match(CODEX_MARKER)
  return match ? { owner: match[1]!, run: match[2]!, tasks: match[3] === '-' ? [] : match[3]!.split(',') } : undefined
}

export const codexRunId = (rollout: CodexInfo, sessionId: string): string | undefined =>
  rollout.owner === sessionId ? `codex-run-${rollout.run}` : undefined

// The stdout marker is the only link between a Bash call and a rollout.
export const mergeCodexRun = (list: AgentNode[], toolUseId: string, output: string): AgentNode[] => {
  const run = output.match(/(?:^|\n)cx-run: ([^\s]+)(?:\r?\n|$)/)?.[1]
  const bash = list.find(one => one.kind === 'codex' && one.toolUseId === toolUseId)
  if (!run || !bash) return list
  const id = `codex-run-${run}`
  const scanned = list.find(one => one.id === id)
  const merged = { ...bash, ...(scanned ?? {}), id, parentId: bash.parentId, toolUseId }
  return list.filter(one => one.id !== bash.id && one.id !== id).concat(merged)
}

// The task names a `cx -t a,b` call runs, so a Codex node reads as the specs it works on.
export const codexTasks = (command: string): string[] => {
  const match = command.match(/(?:^|\s)cx\b[^|;&]*?\s-[a-z]*t\s+(?:"([^"]+)"|'([^']+)'|(\S+))/)
  const names = match?.[1] ?? match?.[2] ?? match?.[3]

  return names ? names.split(',').map(name => name.trim()).filter(Boolean) : []
}

export const formatDuration = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`

  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

export const formatTokens = (tokens: number) =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : `${tokens}`

const BARS = '▁▂▃▄▅▆▇█'

export const sparkline = (values: readonly number[]) => {
  const top = Math.max(1, ...values)

  return values.map(value => (value === 0 ? ' ' : BARS[Math.min(7, Math.round((value / top) * 7))])).join('')
}

export const STATUS_GLYPH: Record<NodeStatus, string> = {
  running: '●',
  waiting: '◐',
  idle: '○',
  done: '✓',
  failed: '✗',
}

export const HEALTH_BADGE: Record<Health, string> = {
  ok: '',
  idle: 'idle',
  approval: '⏸ needs you',
  stalled: '⚠ stalled',
  looping: '↻ looping',
}

export const fromAgentStatus = (status: string): NodeStatus =>
  status === 'running' || status === 'pending'
    ? 'running'
    : status === 'waiting'
      ? 'waiting'
      : status === 'idle'
        ? 'idle'
        : status === 'completed'
          ? 'done'
          : 'failed'

// Depth-first order under the main node, so a flat list reads as a tree.
export const treeOrder = (agents: readonly AgentNode[]): { node: AgentNode; depth: number; isLast: boolean }[] => {
  const children = new Map<string, AgentNode[]>()
  const ids = new Set(agents.map(node => node.id))
  for (const node of agents) {
    if (node.kind === 'main') continue
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : 'main'
    children.set(parent, [...(children.get(parent) ?? []), node])
  }
  const out: { node: AgentNode; depth: number; isLast: boolean }[] = []
  const walk = (node: AgentNode, depth: number, isLast: boolean) => {
    out.push({ node, depth, isLast })
    const kids = children.get(node.id) ?? []
    kids.forEach((kid, index) => walk(kid, depth + 1, index === kids.length - 1))
  }
  const main = agents.find(node => node.kind === 'main')
  if (main) walk(main, 0, true)

  return out
}

// "Read ×3 · Edit · Bash": the last calls, runs of one tool folded.
export const recentSummary = (recent: readonly RecentCall[], max = 5) => {
  const runs: { tool: string; count: number; failed: boolean }[] = []
  for (const call of recent.slice(-12)) {
    const last = runs[runs.length - 1]
    if (last && last.tool === call.tool) {
      last.count++
      last.failed ||= call.ok === false
    } else runs.push({ tool: call.tool, count: 1, failed: call.ok === false })
  }

  return runs
    .slice(-max)
    .map(run => `${run.tool}${run.count > 1 ? ` ×${run.count}` : ''}${run.failed ? '!' : ''}`)
    .join(' · ')
}

export const LIMITS = {
  // A call repeated this often in the last WINDOW calls is a loop.
  repeat: 4,
  window: 8,
  failStreak: 3,
  // Nothing from the model for this long, with no tool in flight.
  silentMs: 4 * 60_000,
  // One tool call in flight for this long.
  longToolMs: 12 * 60_000,
  // A Codex rollout untouched for this long while not complete.
  codexSilentMs: 5 * 60_000,
  approvalMs: 20_000,
}

// The most repeated entry and how often, among the last `window`.
export const mostRepeated = (signatures: readonly string[], window = LIMITS.window) => {
  const counts = new Map<string, number>()
  for (const signature of signatures.slice(-window)) counts.set(signature, (counts.get(signature) ?? 0) + 1)
  let best = { signature: '', count: 0 }
  for (const [signature, count] of counts) if (count > best.count) best = { signature, count }

  return best
}

const failStreak = (recent: readonly RecentCall[]) => {
  let streak = 0
  for (let index = recent.length - 1; index >= 0 && recent[index]?.ok === false; index--) streak++

  return streak
}

// Whether a node needs a look, and the few words that say why.
export const assessHealth = (node: AgentNode, now: number, hasRunningChildren = false): { health: Health; note?: string } => {
  if (node.status === 'done' || node.status === 'failed') return { health: 'ok' }

  if (node.kind === 'codex' && node.codex) {
    const repeated = mostRepeated(node.codex.recentCommands)
    if (repeated.count >= LIMITS.repeat) return { health: 'looping', note: `${clip(repeated.signature, 40)} ×${repeated.count}` }
    const quiet = now - node.codex.activityAt
    if (!node.codex.isComplete && quiet > LIMITS.codexSilentMs) return { health: 'stalled', note: `no Codex output for ${formatDuration(quiet)}` }

    return { health: 'ok' }
  }

  if (node.approvalSince !== undefined && now - node.approvalSince > LIMITS.approvalMs) {
    return { health: 'approval', note: `${node.tool ?? 'tool'} waiting for approval ${formatDuration(now - node.approvalSince)}` }
  }

  const streak = failStreak(node.recent)
  if (streak >= LIMITS.failStreak) return { health: 'looping', note: `${streak} failed calls in a row` }
  const repeated = mostRepeated(node.recent.map(call => `${call.tool} ${call.detail}`))
  if (repeated.count >= LIMITS.repeat) return { health: 'looping', note: `${clip(repeated.signature, 40)} ×${repeated.count}` }

  if (node.status === 'idle' || node.status === 'waiting') {
    return hasRunningChildren ? { health: 'ok' } : { health: 'idle', note: `idle ${formatDuration(now - node.lastEventAt)}` }
  }

  if (node.toolStartedAt !== undefined) {
    const inFlight = now - node.toolStartedAt
    if (inFlight > LIMITS.longToolMs && !hasRunningChildren) {
      return { health: 'stalled', note: `${node.tool ?? 'tool'} running ${formatDuration(inFlight)}` }
    }

    return { health: 'ok' }
  }
  const quiet = now - node.lastEventAt
  if (quiet > LIMITS.silentMs && !hasRunningChildren) return { health: 'stalled', note: `no activity for ${formatDuration(quiet)}` }

  return { health: 'ok' }
}

export type TaskNotification = { taskId?: string; toolUseId?: string; status?: string; summary?: string; outputFile?: string }

// The fields of a background task's <task-notification> prompt.
export const parseTaskNotification = (text: string): TaskNotification | undefined => {
  if (!text.includes('<task-notification>')) return undefined
  const tag = (name: string) => text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim()

  return {
    taskId: tag('task-id'),
    toolUseId: tag('tool-use-id'),
    status: tag('status'),
    summary: tag('summary'),
    outputFile: tag('output-file'),
  }
}

export type Snapshot = {
  sessionId: string
  name: string
  // The title Claude Code gives the session; empty until its transcript has one.
  title?: string
  cwd: string
  updatedAt: number
  isEnded?: boolean
  agents: AgentNode[]
  advice?: OrchestrationAdvice
}

// How another session reads from its last snapshot.
export const peerFromSnapshot = (snapshot: Snapshot, now: number): PeerSession => {
  const main = snapshot.agents.find(node => node.kind === 'main')
  const running = snapshot.agents.filter(node => node.kind !== 'main' && node.status === 'running').length
  const flagged = snapshot.agents.find(node => node.health === 'looping' || node.health === 'stalled' || node.health === 'approval')
  const base = { sessionId: snapshot.sessionId, name: snapshot.title || snapshot.name, running, updatedAt: snapshot.updatedAt }
  if (snapshot.isEnded) return { ...base, state: 'ended', note: 'closed', since: snapshot.updatedAt }
  const silentFor = now - snapshot.updatedAt
  if (silentFor > 20_000) {
    return { ...base, state: 'silent', note: `no heartbeat for ${formatDuration(silentFor)}`, since: snapshot.updatedAt }
  }
  if (flagged) {
    const label = flagged.kind === 'main' ? '' : `${clip(flagged.label, 24)}: `

    return { ...base, state: flagged.health as PeerSession['state'], note: `${label}${flagged.healthNote ?? flagged.health}`, since: flagged.lastEventAt }
  }
  if (main?.status === 'running') return { ...base, state: 'working', note: main.tool ? `${main.tool} ${main.detail ?? ''}`.trim() : 'thinking', since: main.lastEventAt }

  return { ...base, state: 'idle', note: running ? `${running} running in background` : 'waiting for you', since: main?.lastEventAt ?? snapshot.updatedAt }
}

// Model colors: one hue per family, the newest version of a family full strength, older ones faded toward the terminal ground.
export type ModelFamily = 'opus' | 'sonnet' | 'haiku'

const FAMILY_HUE: Record<ModelFamily | 'codex', string> = {
  opus: '#6e7dff',
  sonnet: '#19f0e0',
  haiku: '#ff9a3d',
  codex: '#ff3ec0',
}
const NO_MODEL = '#8a877f'

// "claude-opus-4-1-20250805", "opus", "claude-3-5-sonnet" -> family plus version as major * 100 + minor (0 when unknown).
export const parseModel = (raw: string): { family?: ModelFamily; version: number; label: string } => {
  const text = raw.toLowerCase()
  const family = (['opus', 'sonnet', 'haiku'] as const).find(name => text.includes(name))
  if (!family) return { version: 0, label: raw }
  const hit = text.match(new RegExp(`${family}[-_ ]?(\\d{1,2})(?:[-._](\\d{1,2})(?!\\d))?`)) ?? text.match(new RegExp(`(\\d{1,2})(?:[-._](\\d{1,2}))?[-_ ]${family}`))
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  if (!hit) return { family, version: 0, label: name }
  const minor = hit[2] ? Number(hit[2]) : 0

  return { family, version: Number(hit[1]) * 100 + minor, label: `${name} ${hit[1]}${hit[2] ? `.${minor}` : ''}` }
}

export const newestVersions = (nodes: readonly AgentNode[]) => {
  const best: Partial<Record<ModelFamily, number>> = {}
  for (const node of nodes) {
    const { family, version } = parseModel(node.model)
    if (family && version > (best[family] ?? 0)) best[family] = version
  }

  return best
}

const fade = (hex: string, strength: number) => {
  const ground = 0x1a
  const channel = (at: number) => Math.round(ground + (parseInt(hex.slice(at, at + 2), 16) - ground) * strength)

  return `#${[1, 3, 5].map(at => channel(at).toString(16).padStart(2, '0')).join('')}`
}

// tier 1 = newest of its family (full), 2 = same major, 3 = older. Codex is always its own magenta, faded once finished.
export const modelTone = (node: AgentNode, best: Partial<Record<ModelFamily, number>>) => {
  if (node.kind === 'codex') return { color: fade(FAMILY_HUE.codex, node.status === 'done' || node.status === 'failed' ? 0.5 : 1), label: 'Codex' }
  const { family, version, label } = parseModel(node.model)
  if (!family) return { color: NO_MODEL, label: node.model }
  const top = best[family] ?? version
  const tier = !version ? 2 : version === top ? 1 : Math.floor(version / 100) === Math.floor(top / 100) ? 2 : 3

  return { color: fade(FAMILY_HUE[family], tier === 1 ? 1 : tier === 2 ? 0.7 : 0.45), label }
}

// Which way a link is flowing: the task going down to the child, or its answer coming back up.
export const linkDirection = (node: AgentNode): 'send' | 'recv' | 'done' | 'idle' => {
  if (node.status === 'done' || node.status === 'failed') return 'done'
  if (node.status !== 'running') return 'idle'
  if (node.kind === 'codex' && node.codex && (node.codex.lastMessage || node.codex.isComplete)) return 'recv'

  return 'send'
}
