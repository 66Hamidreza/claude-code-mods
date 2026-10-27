import { expect, test } from 'claude-code/testing'

import { modelTone } from './board'
import { t3Label, t3Nodes, t3Status } from './t3'
import type { T3Scan } from './t3'

const scan: T3Scan = {
  threadId: 'root',
  title: 'Parent',
  pending: 0,
  children: [
    { id: 'a', childThreadId: 'child-a', title: 'calc CLI', driver: 'codex', model: 'gpt-6.1-sol', effort: 'medium', status: 'completed', startedAt: '2026-10-25T10:33:38.616Z', completedAt: '2026-10-25T10:37:04.781Z', activityAt: '2026-10-25T10:37:00.000Z', result: 'Changed: x', waiting: 0 },
    { id: 'b', title: 'Council', driver: 'claudeAgent', model: 'claude-opus-5-5', effort: 'high', status: 'running', startedAt: '2026-10-25T10:05:57.438Z', completedAt: null, activityAt: null, result: '', waiting: 1 },
  ],
}

test('t3 statuses map to board statuses', () => {
  expect(t3Status('completed')).toBe('done')
  expect(t3Status('failed')).toBe('failed')
  expect(t3Status('running')).toBe('running')
})

test('codex-driven child is a codex node with model and effort', () => {
  const [codex, claude] = t3Nodes(scan, Date.parse('2026-10-25T10:40:00Z'))
  expect(codex!.kind).toBe('codex')
  expect(codex!.status).toBe('done')
  expect(codex!.endedAt).toBe(Date.parse('2026-10-25T10:37:04.781Z'))
  expect(t3Label(codex!)).toBe('gpt-6.1-sol · medium')
  expect(modelTone(codex!, {}).label).toBe('gpt-6.1-sol · medium')
  expect(claude!.kind).toBe('agent')
  expect(claude!.status).toBe('waiting')
  expect(claude!.approvalSince).toBeDefined()
  expect(modelTone(claude!, { opus: 505 }).label).toBe('Opus 5.5 · high')
})


test('children carry their own thread identity and scans never fabricate new activity', () => {
  const first = t3Nodes(scan, Date.parse('2026-10-25T10:40:00Z'))[0]!
  const later = t3Nodes(scan, Date.parse('2026-10-25T11:40:00Z'))[0]!
  expect(first.t3?.childThreadId).toBe('child-a')
  expect(first.t3?.threadId).toBe('child-a')
  expect(later.activityAt).toBe(first.activityAt)
  expect(first.activityAt).toBe(first.endedAt!)
  expect(t3Nodes(scan, 0)[1]!.t3?.threadId).not.toBe(scan.threadId)
})

test('user-input waits are distinct from approval waits', () => {
  const [child] = t3Nodes({ ...scan, children: [{ ...scan.children[1]!, approvals: 0, inputs: 1 }] }, Date.now())
  expect(child!.status).toBe('waiting')
  expect(child!.phase).toBe('waiting-user')
  expect(child!.approvalSince).toBeUndefined()
})


test('missing T3 timestamps do not manufacture activity on each scan', () => {
  const input = { ...scan, children: [{ ...scan.children[0]!, startedAt: null, completedAt: null, activityAt: null }] }
  expect(t3Nodes(input, 1000)[0]!.activityAt).toBe(0)
  expect(t3Nodes(input, 2000)[0]!.activityAt).toBe(0)
})
