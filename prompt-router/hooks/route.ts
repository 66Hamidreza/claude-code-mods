import type { Tier } from '../types'

export const MODELS: Record<Tier, string> = {
  light: 'claude-haiku-5-5',
  standard: 'claude-sonnet-5-5',
  heavy: 'claude-opus-5-5',
  max: 'claude-fable-5-1',
  codex: 'codex',
}

export const EFFORT: Partial<Record<Tier, 'low' | 'medium' | 'high'>> = {
  standard: 'medium',
  heavy: 'high',
  max: 'high',
}

// Cheapest first; used to tell an upgrade from a downgrade.
// Full ids: turn.step sends the model to the API as named, so an alias fails.
export const RANK: Record<string, number> = {
  'claude-haiku-5-5': 0,
  'claude-sonnet-5-5': 1,
  'claude-opus-5-5': 2,
  'claude-fable-5-1': 3,
}

const PREFIXES: Record<string, Tier | 'auto'> = {
  haiku: 'light',
  light: 'light',
  sonnet: 'standard',
  opus: 'heavy',
  fable: 'max',
  max: 'max',
  codex: 'codex',
  auto: 'auto',
}

export const parsePrefix = (text: string): { forced?: Tier; isAuto: boolean; text: string } => {
  const found = /^!([a-z]+)\s+/i.exec(text)
  const tier = found ? PREFIXES[found[1]!.toLowerCase()] : undefined
  if (!found || tier === undefined) return { isAuto: false, text }
  const rest = text.slice(found[0].length)

  return tier === 'auto' ? { isAuto: true, text: rest } : { forced: tier, isAuto: false, text: rest }
}

const CONTINUE = /^(ok(ay)?|yes|yep|sure|continue|go on|go ahead|proceed|do it|next|بله|آره|اره|ادامه|برو|اوکی|باشه|انجام بده|خوبه)(\s|[.!،,]|$)/i
const CODEX =
  /(write|add|generate) (unit |e2e |integration )?tests|تست\s+(?:\S+\s+){0,2}(بنویس|اضافه)|boilerplate|bulk (edit|rename|change)|rename .+ (across|everywhere|in all)|across (all|every) files?|in every file|همه[‌ ]?ی? فایل|تمام فایل|mechanical|docs? draft|پیش[‌ ]?نویس (داک|مستند)/i
const HEAVY =
  /architect|معماری|security|امنیت|vulnerab|آسیب[‌ ]?پذیر|threat model|race condition|deadlock|memory leak|root cause|ریشه[‌ ]?ی? (مشکل|باگ)|\bRLS\b|migration plan|trade-?offs?|design (a|the) (system|schema|api)|طراحی (سیستم|دیتابیس|اسکیما)|why (does|is|do) .{0,60}(fail|break|crash|hang)|چرا .{0,40}(کار نمی|خطا|کرش)|hard (bug|problem)|دیباگ|debug/i
const QUESTION = /^(what|how|why|which|where|when|who|is|are|does|do|can|should|چی|چه|چطور|چرا|کجا|کدوم|کی|آیا)(\s|$)|[?؟]\s*$/i
const CODE_VERB =
  /\b(fix|add|implement|edit|change|update|create|build|write|refactor|remove|delete|move|install|deploy|commit|push)\b|درست کن|اضافه کن|بساز|تغییر بده|بنویس|پیاده[‌ ]?(سازی|کن)|حذف کن|نصب کن|دیپلوی|کامیت/i

export type RuleVerdict = { tier: Tier | 'keep'; reason: string } | undefined

export const ruleTier = (text: string): RuleVerdict => {
  const trimmed = text.trim()
  const continuation = CONTINUE.exec(trimmed)
  const rest = continuation ? trimmed.slice(continuation[0].length) : ''
  if (continuation && trimmed.length < 60 && !CODEX.test(rest) && !HEAVY.test(rest) && !CODE_VERB.test(rest)) {
    return { tier: 'keep', reason: 'continuation' }
  }
  if (CODEX.test(trimmed)) return { tier: 'codex', reason: 'bulk/mechanical' }
  if (HEAVY.test(trimmed) || trimmed.length > 1500) return { tier: 'heavy', reason: 'hard or long' }
  if (trimmed.length < 100 && QUESTION.test(trimmed) && !CODE_VERB.test(trimmed)) {
    return { tier: 'light', reason: 'short question' }
  }
  if (CODE_VERB.test(trimmed)) return { tier: 'standard', reason: 'code change' }

  return undefined
}

export const LABELS: Record<Exclude<Tier, 'max'>, string> = {
  light: 'light: a quick question, explanation, lookup or one-line change',
  standard: 'standard: ordinary coding work, edit or add code, fix a normal bug, write a script',
  heavy: 'heavy: architecture, hard debugging, security, data modelling, a careful multi-step plan',
  codex: 'codex: bulk mechanical work with a clear spec, many-file renames, writing tests, boilerplate',
}

// The classifier may answer with the full label or just its first word ("standard").
export const tierOfLabel = (label: string | undefined): Tier | undefined => {
  if (!label) return undefined
  const word = label.trim().toLowerCase().split(/[\s:.,;!?'"`]+/)[0]
  const tiers = Object.keys(LABELS) as Exclude<Tier, 'max'>[]

  return tiers.find(tier => LABELS[tier] === label.trim()) ?? tiers.find(tier => tier === word)
}

// In a long conversation a model switch re-reads the whole context without the
// prompt cache, so only upgrades switch unless the person forced the model.
export const stickyModel = (
  wanted: string,
  last: string | undefined,
  messageCount: number,
  isForced: boolean,
  stickAfter = 30,
) => {
  if (isForced || last === undefined || messageCount <= stickAfter) return wanted

  return (RANK[wanted] ?? 1) < (RANK[last] ?? 1) ? last : wanted
}
