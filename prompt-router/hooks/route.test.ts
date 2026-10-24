import { expect, test } from 'claude-code/testing'

import { EFFORT, LABELS, MODELS, parsePrefix, RANK, ruleTier, stickyModel, tierOfLabel } from './route'

test('prefix forces a tier and is stripped', async () => {
  expect(parsePrefix('!opus design the cache')).toEqual({ forced: 'heavy', isAuto: false, text: 'design the cache' })
  expect(parsePrefix('!codex write tests for parse.ts').forced).toBe('codex')
  expect(parsePrefix('!auto hi there')).toEqual({ isAuto: true, text: 'hi there' })
  expect(parsePrefix('!nope hi')).toEqual({ isAuto: false, text: '!nope hi' })
})

test('rules pick tiers in English and Persian', async () => {
  expect(ruleTier('ادامه بده')?.tier).toBe('keep')
  expect(ruleTier('ok')?.tier).toBe('keep')
  expect(ruleTier('write unit tests for the parser')?.tier).toBe('codex')
  expect(ruleTier('برای همه فایل ها هدر لایسنس اضافه کن')?.tier).toBe('codex')
  expect(ruleTier('review the RLS policies for a security hole')?.tier).toBe('heavy')
  expect(ruleTier('معماری این سرویس رو بازطراحی کن')?.tier).toBe('heavy')
  expect(ruleTier('what does this regex match?')?.tier).toBe('light')
  expect(ruleTier('این تابع چی کار میکنه؟')?.tier).toBe('light')
  expect(ruleTier('چطور این کار میکنه')?.tier).toBe('light')
  expect(ruleTier('fix the typo in README')?.tier).toBe('standard')
  expect(ruleTier('دکمه لاگین رو درست کن')?.tier).toBe('standard')
  expect(ruleTier('hmm interesting')).toBeUndefined()
})

test('classifier labels map back to tiers', async () => {
  expect(tierOfLabel(LABELS.heavy)).toBe('heavy')
  expect(tierOfLabel('something else')).toBeUndefined()
})

test('Persian test writing allows up to two words before the verb', async () => {
  for (const text of ['تست بنویس', 'تست unit بنویس', 'تست واحد بنویس', 'تست واحد جدید اضافه کن']) {
    expect(ruleTier(text)?.tier).toBe('codex')
  }
  expect(ruleTier('این تست رو اجرا کن')?.tier).not.toBe('codex')
  expect(ruleTier('تست یک دو سه بنویس')?.tier).not.toBe('codex')
})

test('continuations defer to work in the remaining text', async () => {
  for (const text of ['ok', 'ادامه بده', 'yes go ahead']) expect(ruleTier(text)?.tier).toBe('keep')
  expect(ruleTier('okay, now review the RLS security')?.tier).toBe('heavy')
  expect(ruleTier('ok now fix the typo')?.tier).toBe('standard')
  expect(ruleTier('yes write unit tests')?.tier).toBe('codex')
})

test('long conversations only switch upward unless forced', async () => {
  expect(stickyModel('claude-haiku-5-5', 'claude-opus-5-5', 10, false)).toBe('claude-haiku-5-5')
  expect(stickyModel('claude-haiku-5-5', 'claude-opus-5-5', 80, false)).toBe('claude-opus-5-5')
  expect(stickyModel('claude-opus-5-5', 'claude-sonnet-5-5', 80, false)).toBe('claude-opus-5-5')
  expect(stickyModel('claude-haiku-5-5', 'claude-opus-5-5', 80, true)).toBe('claude-haiku-5-5')
})

test('every Claude model has a rank, cheapest first', async () => {
  expect(RANK[MODELS.light]! < RANK[MODELS.standard]!).toBe(true)
  expect(RANK[MODELS.standard]! < RANK[MODELS.heavy]!).toBe(true)
  expect(RANK[MODELS.heavy]! < RANK[MODELS.max]!).toBe(true)
  expect(RANK[MODELS.codex]).toBeUndefined()
  expect(EFFORT.light).toBeUndefined()
  expect(EFFORT.codex).toBeUndefined()
})

test('prefix is case-insensitive, needs whitespace and must lead', async () => {
  expect(parsePrefix('!OPUS refactor it')).toEqual({ forced: 'heavy', isAuto: false, text: 'refactor it' })
  expect(parsePrefix('!light hi').forced).toBe('light')
  expect(parsePrefix('!max hi').forced).toBe('max')
  expect(parsePrefix('!fable hi').forced).toBe('max')
  expect(parsePrefix('!sonnet   spaced').text).toBe('spaced')
  expect(parsePrefix('!sonnet\nnext line').text).toBe('next line')
  expect(parsePrefix('!opus')).toEqual({ isAuto: false, text: '!opus' })
  expect(parsePrefix('please !opus do it')).toEqual({ isAuto: false, text: 'please !opus do it' })
})

test('rule precedence and edge cases', async () => {
  // Codex wins over heavy when both match.
  expect(ruleTier('write unit tests for the security module')?.tier).toBe('codex')
  expect(ruleTier('rename getUser across all files')?.tier).toBe('codex')
  expect(ruleTier('یک پیش نویس داک برای API بنویس')?.tier).toBe('codex')
  expect(ruleTier('why does the build fail on CI')?.tier).toBe('heavy')
  expect(ruleTier('debug the flaky login')?.tier).toBe('heavy')
  expect(ruleTier('آسیب پذیری این فرم رو پیدا کن')?.tier).toBe('heavy')
  expect(ruleTier('x'.repeat(1501))?.tier).toBe('heavy')
  // A continuation word only keeps the tier on short replies.
  expect(ruleTier('ok, now fix the login redirect in the auth middleware and all of its callers')?.tier).toBe('standard')
  // A question with a code verb is work, not a quick lookup.
  expect(ruleTier('how do I fix this?')?.tier).toBe('standard')
  expect(ruleTier('is this regex anchored?')?.tier).toBe('light')
  expect(ruleTier('این فایل کجاست؟')?.tier).toBe('light')
  expect(ruleTier('   ')).toBeUndefined()
})

test('classifier answer may be the full label or only its first word', async () => {
  expect(tierOfLabel('standard')).toBe('standard')
  expect(tierOfLabel('Heavy.')).toBe('heavy')
  expect(tierOfLabel(' light: a quick question')).toBe('light')
  expect(tierOfLabel('codex')).toBe('codex')
  expect(tierOfLabel('max')).toBeUndefined()
  expect(tierOfLabel('not sure')).toBeUndefined()
  expect(tierOfLabel('')).toBeUndefined()
})

test('every classifier label maps back to its own tier', async () => {
  for (const tier of Object.keys(LABELS) as (keyof typeof LABELS)[]) expect(tierOfLabel(LABELS[tier])).toBe(tier)
  expect(tierOfLabel(undefined)).toBeUndefined()
})

test('sticky switch boundary, unknown models and custom threshold', async () => {
  expect(stickyModel('claude-haiku-5-5', 'claude-opus-5-5', 30, false)).toBe('claude-haiku-5-5')
  expect(stickyModel('claude-haiku-5-5', 'claude-opus-5-5', 31, false)).toBe('claude-opus-5-5')
  expect(stickyModel('claude-haiku-5-5', undefined, 100, false)).toBe('claude-haiku-5-5')
  expect(stickyModel('claude-sonnet-5-5', 'some-new-model', 80, false)).toBe('claude-sonnet-5-5')
  expect(stickyModel('claude-haiku-5-5', 'some-new-model', 80, false)).toBe('some-new-model')
  expect(stickyModel('claude-haiku-5-5', 'claude-opus-5-5', 10, false, 5)).toBe('claude-opus-5-5')
})
