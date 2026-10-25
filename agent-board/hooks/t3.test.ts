import { expect, test } from 'claude-code/testing'

import { modelTone } from './board'
import { t3Label, t3Nodes, t3Status } from './t3'
import type { T3Scan } from './t3'

const scan: T3Scan = {
  threadId: 'root',
  title: 'Parent',
  pending: 0,
  children: [
    { id: 'a', title: 'calc CLI', driver: 'codex', model: 'gpt-6.1-sol', effort: 'medium', status: 'completed', startedAt: '2026-10-25T10:33:38.616Z', completedAt: '2026-10-25T10:37:04.781Z', activityAt: '2026-10-25T10:37:00.000Z', result: 'Changed: x', waiting: 0 },
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
  expect(claude!.status).toBe('running')
  expect(claude!.approvalSince).toBeDefined()
  expect(modelTone(claude!, { opus: 505 }).label).toBe('Opus 5.5 · high')
})
