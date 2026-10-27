import { expect, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import type { AgentNode, CodexInfo } from '../types'
import { SCANNER } from './codex'
import {
  assessHealth,
  nodePhase,
  snapshotSummary,
  toolSignature,
  LIMITS,
  compareAdvice,
  freshAdvice,
  adviceTitle,
  adviceLine,
  codexRunId,
  codexTasks,
  describeTool,
  mergeCodexRun,
  parseCodexMarker,
  formatDuration,
  fromAgentStatus,
  isCodexCommand,
  linkDirection,
  modelTone,
  newestVersions,
  parseModel,
  parseTaskNotification,
  peerFromSnapshot,
  recentSummary,
  sparkline,
  treeOrder,
} from './board'

const node = (id: string, parentId?: string, fields: Partial<AgentNode> = {}): AgentNode => ({
  id,
  parentId,
  kind: id === 'main' ? 'main' : 'agent',
  label: id,
  type: 'general-purpose',
  model: 'sonnet',
  status: 'running',
  tools: 0,
  errors: 0,
  steps: 0,
  turns: 0,
  tokens: 0,
  startedAt: 0,
  lastEventAt: 0,
  activityAt: 0,
  phase: 'thinking',
  recent: [],
  health: 'ok',
  ...fields,
})

const codex = (fields: Partial<CodexInfo> = {}): CodexInfo => ({
  rollout: '/r.jsonl',
  threadId: 't',
  owner: 'session-a',
  run: 'run-1',
  cwd: '/repo',
  prompt: '',
  tasks: [],
  startedAt: 0,
  commands: 0,
  recentCommands: [],
  files: [],
  tokens: 0,
  isComplete: false,
  activityAt: 0,
  ...fields,
})

const call = (tool: string, detail: string, ok = true) => ({ tool, detail, at: 0, ok })

// Host fixture check: supply a real process runner to exercise the embedded Python.
export async function testScannerFixtures(run: EngineInterface['process']['run']) {
  const response = (text: string) => ({ type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text }] } })
  const event = (text: string) => ({ type: 'event_msg', payload: { type: 'user_message', message: text } })
  const item = (text: string) => ({ type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ text }] } } })
  const first = 'CX_RUN_V1 owner=session-a run=run-1 task=a,b\n' + 'x'.repeat(400)
  const resumed = 'CX_RUN_V1 owner=session-a run=run-2 task=-\nresume'
  const injected = response('# AGENTS.md instructions\nInjected rules')
  const fixtures = [
    [injected, response(first)], // (a) The injected prompt does not hide the marker.
    [injected, response(first), event(resumed), item('CX_RUN_V1 owner=session-a run=run-3 task=c\nlatest')], // (b)
    [injected, item('CX_RUN_V1 owner=session-b run=other task=c')], // (c)
    [injected, event('example\nCX_RUN_V1 owner=session-a run=ignored task=a')], // (d)
    [response(first), event('CX_RUN_V1 owner=session-b run=conflict task=c'), response(resumed)],
  ]
  const ran = await run(['python3', '-c', String.raw`
import json, pathlib, subprocess, sys, tempfile
with tempfile.TemporaryDirectory(prefix="codex-scanner-") as directory:
    paths = []
    for i, events in enumerate(json.loads(sys.argv[2])):
        path = pathlib.Path(directory) / (str(i) + ".jsonl")
        path.write_text("\n".join(json.dumps(event) for event in events) + "\n")
        paths.append(str(path))
    result = subprocess.run([sys.executable, "-c", sys.argv[1], *paths], check=True, capture_output=True, text=True)
    scanned = {pathlib.Path(info["rollout"]).stem: info for info in json.loads(result.stdout)}
    print(json.dumps([scanned.get(str(i)) for i in range(len(paths))]))
`, SCANNER, JSON.stringify(fixtures)])
  expect(ran.exitCode).toBe(0)
  const [later, latest, other, absent, conflict] = JSON.parse(ran.stdout) as (CodexInfo | null)[]
  expect(later?.owner).toBe('session-a')
  expect(later?.run).toBe('run-1')
  expect(later?.tasks).toEqual(['a', 'b'])
  expect(later?.prompt).toBe(first.slice(0, 300))
  expect(latest?.run).toBe('run-3')
  expect(latest?.tasks).toEqual(['c'])
  expect(latest?.prompt).toBe(first.slice(0, 300))
  expect(codexRunId(latest!, 'session-a')).toBe('codex-run-run-3')
  expect(other?.owner).toBe('session-b')
  expect(codexRunId(other!, 'session-a')).toBeUndefined()
  expect(absent).toBe(null)
  expect(conflict).toBe(null)
}

test('tool calls read as one short line', async () => {
  expect(describeTool('Bash', { command: 'npm   test\n --watch' })).toBe('npm test --watch')
  expect(describeTool('Read', { file_path: '/home/a/b/c.ts' })).toBe('b/c.ts')
  expect(describeTool('Grep', { pattern: 'TODO' })).toBe('TODO')
})

test('codex commands and their task names are spotted', async () => {
  expect(isCodexCommand('cx -t a,b -c "npm test"')).toBe(true)
  expect(isCodexCommand('cd repo && codex exec --skip-git-repo-check "x"')).toBe(true)
  expect(isCodexCommand('echo cxx')).toBe(false)
  expect(codexTasks('cx -t a,b -c "npm test"')).toEqual(['a', 'b'])
  expect(codexTasks('cd repo && cx -s -t "fix-1" -n')).toEqual(['fix-1'])
  expect(codexTasks('cx "do the thing"')).toEqual([])
})

test('durations, statuses and sparkline', async () => {
  expect(formatDuration(42_000)).toBe('42s')
  expect(formatDuration(125_000)).toBe('2m05s')
  expect(fromAgentStatus('completed')).toBe('done')
  expect(fromAgentStatus('killed')).toBe('failed')
  expect(sparkline([0, 1, 2])).toBe(' ▅█')
})

test('tree order walks depth first and adopts orphans under main', async () => {
  const order = treeOrder([node('main'), node('a', 'main'), node('b', 'a'), node('c', 'gone')])
  expect(order.map(row => `${row.node.id}:${row.depth}`)).toEqual(['main:0', 'a:1', 'b:2', 'c:1'])
})

test('tree order keeps main first and sorts siblings by creation time, preserving subtrees and ties', () => {
  const agents = [node('old', 'main', { startedAt: 10, activityAt: 999 }), node('main'),
    node('nested-old', 'new', { startedAt: 30 }), node('new', 'main', { startedAt: 20, status: 'done' }),
    node('nested-new', 'new', { startedAt: 40 }), node('tie', 'main', { startedAt: 20 }),
    node('orphan', 'missing', { startedAt: 5 })]
  const before = agents.map(a => a.id)
  expect(treeOrder(agents).map(({ node, depth, isLast }) => [node.id, depth, isLast])).toEqual([
    ['main', 0, true], ['new', 1, false], ['nested-new', 2, false], ['nested-old', 2, true],
    ['tie', 1, false], ['old', 1, false], ['orphan', 1, true],
  ])
  expect(agents.map(a => a.id)).toEqual(before)
})

test('recent calls fold runs of one tool', async () => {
  expect(recentSummary([call('Read', 'a'), call('Read', 'b'), call('Edit', 'a'), call('Bash', 'x', false)])).toBe('Read ×2 · Edit · Bash!')
})

test('the same call over and over is a loop', async () => {
  const repeated = Array.from({ length: 6 }, () => call('Bash', 'npm test'))
  expect(assessHealth(node('a', 'main', { recent: [call('Read', 'x'), ...repeated], lastEventAt: 0 }), 1000).health).toBe('looping')
  const failing = [call('Edit', 'a', false), call('Edit', 'b', false), call('Bash', 'c', false), call('Edit', 'd', false)]
  expect(assessHealth(node('a', 'main', { recent: failing }), 1000)).toEqual({ health: 'looping', note: '4 failed calls in a row' })
  expect(assessHealth(node('a', 'main', { recent: [call('Read', 'a'), call('Read', 'b'), call('Read', 'c')] }), 1000).health).toBe('ok')
})

test('silence and long tools are stalls, unless a child is working', async () => {
  const quiet = node('a', 'main', { lastEventAt: 0 })
  expect(assessHealth(quiet, 9 * 60_000).health).toBe('stalled')
  expect(assessHealth(quiet, 60_000).health).toBe('ok')
  expect(assessHealth(quiet, 5 * 60_000, true).health).toBe('ok')
  const longTool = node('a', 'main', { tool: 'Edit', toolStartedAt: 0, lastEventAt: 0 })
  expect(assessHealth(longTool, 5 * 60_000).health).toBe('ok')
  expect(assessHealth(longTool, 31 * 60_000).note).toBe('Edit running 31m00s')
})

test('idle main, open asks and finished nodes', async () => {
  expect(assessHealth(node('main', undefined, { status: 'idle', lastEventAt: 0 }), 90_000)).toEqual({ health: 'idle', note: 'idle 1m30s' })
  expect(assessHealth(node('main', undefined, { status: 'idle' }), 90_000, true).health).toBe('ok')
  expect(assessHealth(node('a', 'main', { tool: 'Bash', approvalSince: 0 }), 61_000).health).toBe('approval')
  expect(assessHealth(node('a', 'main', { status: 'done', lastEventAt: 0 }), 10 * 60_000).health).toBe('ok')
})

test('codex runs stall on a quiet log and loop on one command', async () => {
  const run = (fields: Partial<CodexInfo>) => node('c', 'main', { kind: 'codex', codex: codex(fields) })
  expect(assessHealth(run({ activityAt: 0 }), 6 * 60_000).health).toBe('stalled')
  expect(assessHealth(run({ activityAt: 0, isComplete: true }), 6 * 60_000).health).toBe('ok')
  expect(assessHealth(run({ activityAt: 0, recentCommands: ['ls', ...Array(6).fill('npm test')] }), 1000).health).toBe('looping')
})

test('task notifications are read', async () => {
  const text = `<task-notification>
<task-id>b1x</task-id>
<tool-use-id>toolu_9</tool-use-id>
<output-file>/tmp/out</output-file>
<status>completed</status>
<summary>Background command "cx -t a" completed (exit code 0)</summary>
</task-notification>`
  expect(parseTaskNotification(text)).toEqual({
    taskId: 'b1x',
    toolUseId: 'toolu_9',
    status: 'completed',
    summary: 'Background command "cx -t a" completed (exit code 0)',
    outputFile: '/tmp/out',
  })
  expect(parseTaskNotification('hello')).toBe(undefined)
})

test('peer sessions read as working, flagged, idle or silent', async () => {
  const snapshot = (agents: AgentNode[], updatedAt = 100_000) => ({ sessionId: 's', name: 'repo', cwd: '/repo', updatedAt, agents })
  expect(peerFromSnapshot(snapshot([node('main', undefined, { tool: 'Bash', detail: 'npm test' })]), 101_000).state).toBe('working')
  expect(peerFromSnapshot(snapshot([node('main', undefined, { status: 'idle' })]), 101_000).note).toBe('waiting for you')
  expect(peerFromSnapshot(snapshot([node('main'), node('a', 'main', { health: 'looping', healthNote: 'Bash x ×4' })]), 101_000).note).toBe('a: Bash x ×4')
  expect(peerFromSnapshot(snapshot([node('main')], 0), 60_000).state).toBe('silent')
})

test('parseModel reads family and version from real model ids', () => {
  expect(parseModel('claude-opus-5-5')).toEqual({ family: 'opus', version: 505, label: 'Opus 5.5' })
  expect(parseModel('claude-opus-4-1-20250805')).toEqual({ family: 'opus', version: 401, label: 'Opus 4.1' })
  expect(parseModel('claude-3-5-sonnet-20241022').family).toBe('sonnet')
  expect(parseModel('haiku').version).toBe(0)
  expect(parseModel('gpt-5').family).toBeUndefined()
})

test('modelTone keeps one hue per family and fades older versions', () => {
  const newest = node('a', 'main', { model: 'claude-opus-5-5' })
  const older = node('b', 'main', { model: 'claude-opus-4-7' })
  const best = newestVersions([newest, older])

  expect(modelTone(newest, best).color).toBe('#6e7dff')
  expect(modelTone(older, best).color).not.toBe('#6e7dff')
  expect(modelTone(node('c', 'main', { kind: 'codex', model: 'codex' }), best).color).toBe('#ff3ec0')
  expect(modelTone(node('d', 'main', { model: '' }), best).label).toBe('')
})

test('linkDirection says which way the link is flowing', () => {
  expect(linkDirection(node('a', 'main', { status: 'running' }))).toBe('send')
  expect(linkDirection(node('b', 'main', { status: 'done' }))).toBe('done')
  expect(linkDirection(node('c', 'main', { status: 'waiting' }))).toBe('idle')
})

test('Codex markers parse owners, unmarked prompts and resumed runs', () => {
  expect(parseCodexMarker('CX_RUN_V1 owner=session-a run=run-1 task=a,b\nRead .collab/session-a/tasks/a.md')).toEqual({ owner: 'session-a', run: 'run-1', tasks: ['a', 'b'] })
  expect(parseCodexMarker('CX_RUN_V1 owner=session-b run=run-2 task=-')).toEqual({ owner: 'session-b', run: 'run-2', tasks: [] })
  expect(parseCodexMarker('CX_RUN_V1 owner=session-a run=resume-1 task=a')).toEqual({ owner: 'session-a', run: 'resume-1', tasks: ['a'] })
  expect(parseCodexMarker('Read .collab/tasks/a.md')).toBeUndefined()
  expect(parseCodexMarker('example\nCX_RUN_V1 owner=session-a run=run-1 task=a')).toBeUndefined()
})

test('only the explicit owner adopts a run, with distinct resumed ids', () => {
  expect(codexRunId(codex(), 'session-a')).toBe('codex-run-run-1')
  expect(codexRunId(codex(), 'session-b')).toBeUndefined()
  expect(codexRunId(codex({ run: 'resume-1' }), 'session-a')).toBe('codex-run-resume-1')
})

test('Codex detection checks executable words and excludes help and lookups', () => {
  for (const command of ['which cx', 'echo cx', 'command -v cx', 'cx -h', 'cx --help', 'cx --version', 'VAR=1 cx -h', 'echo "start; cx -t a"', "echo 'cx -t a'"]) {
    expect(isCodexCommand(command)).toBe(false)
  }
  for (const command of ['cx -t a', 'codex exec "work"', 'VAR=1 cx -t a', 'VAR="some value" cx -t a', 'cd repo; cx -t a', 'cd repo\ncx -t a']) {
    expect(isCodexCommand(command)).toBe(true)
  }
  expect(codexTasks('VAR=1 cx -t a,b "Read .collab/session-a/tasks/a.md and .collab/session-a/tasks/b.md"')).toEqual(['a', 'b'])
})

test('stdout markers merge Bash and scanned nodes in either discovery order', () => {
  const bash = node('codex-tool-1', 'parent', { kind: 'codex', toolUseId: 'tool-1' })
  const scanned = node('codex-run-run-1', 'main', { kind: 'codex', codex: codex() })
  const merged = mergeCodexRun([bash, scanned], 'tool-1', 'cx-run: run-1\nworking')
  expect(merged.length).toBe(1)
  expect(merged[0]?.id).toBe('codex-run-run-1')
  expect(merged[0]?.parentId).toBe('parent')
  expect(merged[0]?.toolUseId).toBe('tool-1')
  expect(merged[0]?.codex?.run).toBe('run-1')
  expect(mergeCodexRun([bash], 'tool-1', 'cx-run: run-1\n')[0]?.id).toBe('codex-run-run-1')
  expect(mergeCodexRun([bash, scanned], 'tool-1', 'unrelated output')).toEqual([bash, scanned])
  expect(mergeCodexRun([bash, scanned], 'tool-1', 'echo cx-run: run-1')).toEqual([bash, scanned])
})

const adviceAt = 30_000_000
const advice = {
  at: adviceAt, prompt: 'test', mode: 'parallel' as const, reason: 'Independent tasks',
  parts: [
    { title: 'one', executor: 'claude' as const, model: 'sonnet' },
    { title: 'two', executor: 'claude' as const, model: 'opus' },
    { title: 'bulk', executor: 'codex' as const, model: 'gpt-6-sol', effort: 'high' },
  ],
}
const advisedNodes = [node('main', undefined, { startedAt: adviceAt }),
  node('a', undefined, { startedAt: adviceAt }), node('b', undefined, { kind: 'workflow', startedAt: adviceAt + 1 }),
  node('cx', undefined, { kind: 'codex', startedAt: adviceAt + 2 })]

test('advice counts agents and Codex separately, ignoring earlier work and the main session', async () => {
  const c = compareAdvice(advice, [...advisedNodes, node('old', undefined, { startedAt: adviceAt - 1 }),
    node('old-cx', undefined, { kind: 'codex', startedAt: adviceAt - 1 })])
  expect(c).toEqual({ advisedParallel: 2, advisedCodex: 1, actualAgents: 2, actualCodex: 1, verdict: 'followed' })
  expect(adviceLine(advice, c)).toBe('advice: parallel ×3 (2 claude · 1 codex) → ran 2 agents · 1 codex [followed]')
  expect(adviceTitle(advice)).toBe('Independent tasks\none: claude · sonnet\ntwo: claude · opus\nbulk: codex · gpt-6-sol · high')
})

test('advice reports missing agents or Codex as under', async () => {
  expect(compareAdvice(advice, advisedNodes.slice(0, 3)).verdict).toBe('under')
  expect(compareAdvice(advice, []).verdict).toBe('under')
})

test('advice reports excess agents or Codex as over, including mixed deficits', async () => {
  expect(compareAdvice(advice, [...advisedNodes, node('extra', undefined, { startedAt: adviceAt })]).verdict).toBe('over')
  expect(compareAdvice(advice, [advisedNodes[3]!, node('extra-cx', undefined, { kind: 'codex', startedAt: adviceAt })]).verdict).toBe('over')
})

test('single advice needs no additional agents or Codex', async () => {
  const single = { ...advice, mode: 'single' as const, parts: advice.parts.slice(0, 1) }
  expect(compareAdvice(single, [advisedNodes[0]!]).verdict).toBe('single-ok')
  expect(compareAdvice(single, advisedNodes).verdict).toBe('over')
  expect(compareAdvice(single, [advisedNodes[3]!]).verdict).toBe('over')
})

test('stale, absent, future and malformed advice is hidden', async () => {
  expect(freshAdvice(undefined, adviceAt)).toBeUndefined()
  expect(freshAdvice(null, adviceAt)).toBeUndefined()
  expect(freshAdvice(advice, adviceAt + 6 * 3600_000 + 1)).toBeUndefined()
  expect(freshAdvice(advice, adviceAt + 6 * 3600_000)).toEqual(advice)
  expect(freshAdvice(advice, adviceAt - 1)).toBeUndefined()
  expect(freshAdvice({ ...advice, parts: [{}] }, adviceAt)).toBeUndefined()
  expect(freshAdvice({ ...advice, at: NaN }, adviceAt)).toBeUndefined()
})


test('health thresholds avoid ordinary pauses, reads, polling and finished-turn history', () => {
  expect(LIMITS).toMatchObject({ approvalMs: 60_000, silentMs: 480_000, longToolMs: 1_800_000, repeat: 6, window: 10, failStreak: 4 })
  const repeats = Array.from({ length: 6 }, () => call('Bash', 'bun test'))
  for (const status of ['idle', 'done', 'failed', 'waiting'] as const) {
    expect(assessHealth(node('main', undefined, { status, recent: repeats }), 1000).health).not.toBe('looping')
  }
  for (const tool of ['Read', 'Grep', 'Glob']) {
    expect(assessHealth(node('a', 'main', { recent: Array.from({ length: 10 }, () => call(tool, 'same')) }), 1000).health).toBe('ok')
  }
  expect(toolSignature('Bash', { command: 'git status --short' })).toBeUndefined()
  expect(assessHealth(node('a', 'main', { recent: Array.from({ length: 10 }, () => call('Bash', 'git status')) }), 1000).health).toBe('ok')
  expect(assessHealth(node('a'), 8 * 60_000).health).toBe('ok')
  expect(assessHealth(node('main'), 5 * 60_000 + 1).health).toBe('stalled')
  expect(assessHealth(node('main', undefined, { activityAt: 5 * 60_000 }), 6 * 60_000).health).toBe('ok')
  expect(assessHealth(node('main'), 6 * 60_000, true).health).toBe('ok')
})

test('repeat signatures contain complete stable arguments and count only the last ten calls', () => {
  const long = 'a'.repeat(100)
  const calls = Array.from({ length: 6 }, (_, i) => ({ ...call('Edit', 'same clipped detail'), signature: toolSignature('Edit', { file_path: 'a', new_string: long + i }) }))
  expect(assessHealth(node('a', 'main', { recent: calls }), 1000).health).toBe('ok')
  expect(toolSignature('Edit', { b: 2, a: 1 })).toBe(toolSignature('Edit', { a: 1, b: 2 }))
  expect(assessHealth(node('a', 'main', { recent: [...Array(6).fill(call('Bash', 'bun test')), ...Array(5).fill(call('Read', 'a'))] }), 1000).health).toBe('ok')
})

test('approval clears on execution, and background/monitoring tools may run quietly', () => {
  expect(assessHealth(node('a', 'main', { approvalSince: 0 }), 60_000).health).toBe('ok')
  expect(assessHealth(node('a', 'main', { approvalSince: 0 }), 60_001).health).toBe('approval')
  expect(assessHealth(node('a', 'main', { approvalSince: 0, tool: 'Edit', toolStartedAt: 30_000 }), 90_000).health).toBe('ok')
  for (const tool of ['Monitor', 'Task', 'Agent', 'WebFetch', 'sleep']) {
    expect(assessHealth(node('a', 'main', { tool, toolStartedAt: 0 }), 31 * 60_000).health).toBe('ok')
  }
  expect(assessHealth(node('a', 'main', { tool: 'Bash', toolStartedAt: 0, toolBackground: true }), 31 * 60_000).health).toBe('ok')
  expect(assessHealth(node('a', 'main', { tool: 'Bash', detail: 'sleep 3600', toolStartedAt: 0 }), 31 * 60_000).health).toBe('ok')
  expect(assessHealth(node('a', 'main', { tool: 'Bash', toolStartedAt: 0 }), 31 * 60_000).health).toBe('stalled')
})

test('phase and summary include main work and preserve real activity time', () => {
  expect(nodePhase(node('main'))).toBe('thinking')
  expect(nodePhase(node('main'), true)).toBe('waiting-children')
  expect(nodePhase(node('main', undefined, { status: 'idle' }))).toBe('waiting-user')
  expect(nodePhase(node('a', 'main', { approvalSince: 0 }))).toBe('waiting-approval')
  expect(nodePhase(node('a', 'main', { toolStartedAt: 0 }))).toBe('tool')
  expect(snapshotSummary([node('main', undefined, { activityAt: 123 }), node('a', 'main', { status: 'waiting', phase: 'waiting-user' }), node('b', 'main', { status: 'failed', health: 'stalled' })])).toEqual({ running: 1, waiting: 1, failed: 1, flagged: 1, lastActivityAt: 123 })
})

test('hook heartbeat precedes hung collectors, skips overlapping ticks, and clears approvals on tool start', async () => {
  const { spawnSync } = await import('node:child_process')
  const ran = spawnSync('bun', ['--eval', String.raw`
import { mock } from 'bun:test'
import assert from 'node:assert/strict'
const state = new Map()
mock.module('claude-code', () => ({
 atom: (key, initial) => { state.set(key.key, initial); return key.key },
 read: async (_, key) => state.get(key),
 update: async (_, key, fn) => { state.set(key, fn(state.get(key))) },
}))
mock.module('react/jsx-dev-runtime', () => ({ jsxDEV: () => null }))
const { register } = await import(process.argv[1])
const handlers = new Map(); let tick; let clock = 1000; let t3Calls = 0
register((name, filter, fn) => { handlers.set(name, fn ?? filter) })
const files = new Map(); const writes = []
const $ = {
 env: { get: async () => '/fixture' }, session: { id: async () => 's', cwd: async () => '/repo', model: async () => 'sonnet' },
 fs: {
  read: async path => { if (!files.has(path)) throw Error('missing'); return files.get(path) },
  write: async (path, body) => { files.set(path, body); if (path.endsWith('.json.tmp')) writes.push(JSON.parse(body)) },
  rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from) }, list: async () => [],
 },
 process: { run: async argv => {
  if (argv[0] === 'python3') { t3Calls++; return new Promise(() => {}) }
  if (argv[0] === 'mv') { files.set(argv[3], files.get(argv[2])); files.delete(argv[2]); return { stdout: '', exitCode: 0 } }
  return { stdout: '', exitCode: 0 }
 } },
 agent: { list: async () => [] }, clock: { now: async () => clock, every: (_, cb) => { tick = cb } },
 store: { get: async () => false }, command: { register: async () => {} },
 ui: { toast: () => {}, log: () => {}, notify: async () => {}, open: async () => {} },
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const next = async e => e
await handlers.get('session.start')($, {}, next)
assert.equal(writes.length, 1)
clock = 2000; tick(); tick(); await delay(20)
assert.equal(writes.length, 2, 'busy tick wrote a duplicate snapshot')
assert.equal(t3Calls, 1)
await delay(2600)
clock = 8000; tick(); await delay(20)
assert.equal(writes.length, 3)
assert.equal(writes.at(-1).updatedAt, 8000)
assert.equal(writes.at(-1).seq, 3)
assert.match(writes.at(-1).lastError, /t3:.*deadline/)
assert.equal(t3Calls, 1, 'timed-out collector was launched again')
assert.ok(files.has('/fixture/.claude/mods-data/agent-board/web/sessions/s.json'))
assert.equal([...files.keys()].some(path => path.endsWith('.tmp')), false)
clock = 9000; await handlers.get('turn.start')($, {}, next)
await handlers.get('tool.check')($, { tool_use_id: 'tool-1' }, async () => ({ decision: 'ask' }))
assert.equal(state.get('agents')[0].approvalSince, 9000)
let resolveTool
clock = 10000
const tool = handlers.get('tool.call')($, { tool: 'Edit', tool_use_id: 'tool-1', file_path: '/a', new_string: 'body' },
 () => new Promise(resolve => { resolveTool = resolve }))
await delay(10)
assert.equal(state.get('agents')[0].approvalSince, undefined)
assert.equal(state.get('agents')[0].phase, 'tool')
clock = 11000; resolveTool({ text: 'ok' }); await tool
assert.equal(state.get('agents')[0].activityAt, 11000)
assert.match(state.get('agents')[0].recent.at(-1).signature, /new_string/)
await handlers.get('agent.spawn')($, { subagentType: 'worker', description: 'Child' }, async () => ({ agentId: 'child', model: 'sonnet' }))
clock = 12000; tick(); await delay(20)
assert.equal(writes.at(-1).summary.running, 2)
assert.ok(writes.at(-1).links.some(link => link.kind === 'delegate' && link.to.nodeId === 'child'))
clock = 13000
await handlers.get('tool.call')($, { tool: 'mcp__t3_code__delegate_task', tool_use_id: 'delegate-1', task: 'Child work', target: { providerInstanceId: 'codex', model: 'gpt-6.1-sol' } }, async () => ({
 result: { content: [{ text: JSON.stringify({ taskId: 'task-1', childThreadId: 'child-thread', status: 'completed', summary: 'Result' }) }] },
}))
await handlers.get('tool.call')($, { tool: 'SendMessage', tool_use_id: 'message-1', to: 'Other', targetSessionId: 'other-session', message: 'Hello' }, async () => ({ text: 'sent' }))
clock = 14000; tick(); await delay(20)
assert.ok(writes.at(-1).links.some(link => link.kind === 'delegate' && link.to.nodeId === 't3-task-1'))
assert.ok(writes.at(-1).links.some(link => link.kind === 'result' && link.from.nodeId === 't3-task-1'))
assert.ok(writes.at(-1).links.some(link => link.kind === 'peer-msg' && link.to.sessionId === 'other-session' && link.to.peer === 'Other'))
assert.equal(writes.at(-1).agents.find(n => n.id === 't3-task-1').t3.childThreadId, 'child-thread')
`, `${import.meta.dir}/register.tsx`], { encoding: 'utf8', timeout: 10000 })
  expect(ran.stderr).toBe('')
  expect(ran.status).toBe(0)
}, 15000)
