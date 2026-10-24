import { expect, test } from 'claude-code/testing'

import { advise, adviceNote, CODEX_MODELS, cxFlags } from './advise'

test('one coherent task stays single', async () => {
  expect(advise('fix the login redirect bug in auth.ts', 1).mode).toBe('single')
})

test('sequential steps stay single', async () => {
  expect(advise('first migrate the schema and then update the API to use it', 1).mode).toBe('single')
  expect(advise('اول دیتابیس را مهاجرت بده سپس API را عوض کن', 1).mode).toBe('single')
})

test('bulleted independent items go parallel with per-part executors', async () => {
  const advice = advise('- write unit tests for parse.ts\n- redesign the landing page layout\n- review the security of the auth module', 1)
  expect(advice.mode).toBe('parallel')
  expect(advice.parts).toHaveLength(3)
  expect(advice.parts[0]).toMatchObject({ executor: 'codex', model: CODEX_MODELS.cheap })
  expect(advice.parts[1]).toMatchObject({ executor: 'claude', model: 'claude-sonnet-5-5' })
  expect(advice.parts[2]).toMatchObject({ executor: 'claude', model: 'claude-opus-5-5' })
})

test('splits Persian items joined by همچنین', async () => {
  const advice = advise('برای همه فایل ها هدر لایسنس اضافه کن همچنین معماری سیستم صف را بررسی کن', 1)
  expect(advice.mode).toBe('parallel')
  expect(advice.parts.map(part => part.executor)).toEqual(['codex', 'claude'])
})

test('fan-out over many targets is parallel', async () => {
  expect(advise('update the footer text in every project', 1).mode).toBe('parallel')
})

test('caps parts at six', async () => {
  const list = Array.from({ length: 9 }, (_, i) => `- do independent item number ${i}`).join('\n')
  expect(advise(list, 1).parts).toHaveLength(6)
})

test('note only for parallel, mentions cx flags for codex parts', async () => {
  expect(adviceNote(advise('fix one bug', 1))).toBe('')
  const note = adviceNote(advise('- write tests for a.ts\n- audit the security design of b', 1))
  expect(note).toContain('cx -m gpt-6-luna -e medium')
  expect(note).toContain('claude-opus-5-5')
})

test('requirement bullets are one task; Persian order across lines is sequential; long input is fast', async () => {
  expect(advise('Fix the form. Requirements:\n- it must validate email\n- it should keep state', 1).mode).toBe('single')
  expect(advise('اول این را بنویس\n- فایل الف\n- فایل ب\nبعد تست کن', 1).mode).toBe('single')
  const start = Date.now()
  advise(' '.repeat(20_000), 1)
  expect(Date.now() - start).toBeLessThan(500)
})

test('empty input is a single task with no parts', async () => {
  expect(advise('', 1)).toMatchObject({ mode: 'single', parts: [], prompt: '' })
})

test('semicolon splits; quick questions go to haiku without effort', async () => {
  const advice = advise('what is a closure?; explain promises', 1)
  expect(advice.mode).toBe('parallel')
  expect(advice.parts[0]).toEqual({ title: 'what is a closure?', executor: 'claude', model: 'claude-haiku-5-5' })
  expect(advice.parts[1]).toMatchObject({ executor: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' })
})

test('English parallel separators split independent parts', async () => {
  for (const separator of ['and also', 'as well as', 'in parallel', 'separately', 'plus', 'at the same time']) {
    const advice = advise(`write tests for parser.ts ${separator} update README documentation`, 1)
    expect(advice.mode).toBe('parallel')
    expect(advice.parts).toHaveLength(2)
  }
})

test('long read-heavy items go to the Codex workhorse model', async () => {
  const advice = advise('- investigate and map every caller of the legacy payment client across the codebase\n- fix typo in readme', 1)
  expect(advice.parts[0]).toMatchObject({ executor: 'codex', model: CODEX_MODELS.main, effort: 'medium' })
  expect(advice.parts[0]!.title.endsWith('…')).toBe(true)
  expect(advice.parts[0]!.title.length).toBeLessThanOrEqual(70)
})

test('frontend items stay with Claude even when they look mechanical', async () => {
  const advice = advise('- add a login page component\n- write tests for parse.ts', 1)
  expect(advice.parts.map(part => part.executor)).toEqual(['claude', 'codex'])
})

test('fan-out yields one base part; Persian bullets are split', async () => {
  const fan = advise('refactor the logging in each project', 1)
  expect(fan).toMatchObject({ mode: 'parallel', reason: 'same work over many targets: one agent per target' })
  expect(fan.parts).toHaveLength(1)
  expect(advise('- حذف کن فایل\n- ۱ تست بنویس', 1).parts).toHaveLength(2)
})

test('input is clipped to 4000 chars; prompt preview to 120; at is passed through', async () => {
  const advice = advise(`${'a'.repeat(5000)}`, 42)
  expect(advice.at).toBe(42)
  expect(advice.prompt).toHaveLength(120)
})

test('cxFlags omits -e when the part has no effort', async () => {
  expect(cxFlags({ title: 't', executor: 'codex', model: CODEX_MODELS.cheap })).toBe('cx -m gpt-6-luna')
  expect(cxFlags({ title: 't', executor: 'codex', model: CODEX_MODELS.main, effort: 'high' })).toBe('cx -m gpt-6.1-sol -e high')
})

test('note lists haiku parts without effort and numbers every part', async () => {
  const note = adviceNote(advise('- what is a closure in js\n- write tests for a.ts', 1))
  expect(note).toContain('1. what is a closure in js -> subagent model claude-haiku-5-5\n')
  expect(note).toContain('2. write tests for a.ts -> Codex:')
})

test('note formats executor instructions and Codex spec hint', async () => {
  const note = adviceNote(advise('- write tests for a.ts\n- explain what a closure is', 1))
  expect(note).toContain('[orchestration advice: 2 independent parts.')
  expect(note).toContain('start every part below in ONE message')
  expect(note).toContain('1. write tests for a.ts -> Codex: cx -m gpt-6-luna -e medium -t <task> (background)')
  expect(note).toContain('2. explain what a closure is -> subagent model claude-sonnet-5-5')
  expect(note).toContain('write the spec to .collab/$CLAUDE_CODE_SESSION_ID/tasks/<task>.md first.')
})
