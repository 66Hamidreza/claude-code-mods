import type { Advice, AdvicePart } from '../types'
import { ruleTier } from './route'

const MAX_PARTS = 6

// Codex models by cost: luna = fast/cheap, sol = workhorse. astra is never picked automatically.
export const CODEX_MODELS = { cheap: 'gpt-6-luna', main: 'gpt-6.1-sol' } as const

const BULLET = /^\s*(?:[-*•]|\d+[.)]|[۰-۹]+\s*[-.)])\s+/
const SEQUENTIAL =
  /\b(then|after that|afterwards|once (that|it)'?s? done|first [\s\S]{3,80}(then|and then)|step by step)\b|بعد از (آن|اون|این)|سپس|و بعد|مرحله به مرحله|اول [\s\S]{3,80}بعد/i
const ALSO = /(?:;|؛|\band also\b|\bas well as\b|\bin parallel\b|\bseparately\b|\bplus\b|\bat the same time\b|همچنین|و همزمان|به[‌ ]?صورت موازی|جداگانه)/i
const FANOUT = /\b(each|every|all) (of the )?(project|repo|service|module|package|file|page)s?\b|(هر|همه[‌ ]?ی?|تمام) (پروژه|ریپو|سرویس|ماژول|پکیج|صفحه)/i
const FRONTEND = /\b(ui|ux|frontend|front-end|css|layout|redesign|web design|component|page|landing)\b|رابط کاربری|فرانت|طراحی (صفحه|ui)|ظاهر/i
// Bullets that state rules or acceptance criteria are one task, not several.
const REQUIREMENTS = /\b(requirements?|acceptance criteria|constraints?|must|should)\b|الزامات|شرایط|باید|ملاحظات/i
const READ_HEAVY = /\b(explore|investigate|survey|audit|review|find all|map|analy[sz]e)\b|بررسی|بگرد|پیدا کن|مرور|آنالیز/i

const items = (text: string): string[] => {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const bulleted = lines.filter(line => BULLET.test(line)).map(line => line.replace(BULLET, ''))
  if (bulleted.length >= 2) return bulleted

  const pieces = text.split(ALSO).map(piece => piece.trim()).filter(piece => piece.length > 12)

  return pieces.length >= 2 ? pieces : [text.trim()]
}

const partFor = (item: string): AdvicePart => {
  const title = item.length > 70 ? `${item.slice(0, 69)}…` : item
  if (FRONTEND.test(item)) return { title, executor: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' }

  const rule = ruleTier(item)
  if (rule?.tier === 'codex') return { title, executor: 'codex', model: CODEX_MODELS.cheap, effort: 'medium' }
  if (rule?.tier === 'heavy') return { title, executor: 'claude', model: 'claude-opus-5-5', effort: 'high' }
  if (READ_HEAVY.test(item) && item.length > 60) return { title, executor: 'codex', model: CODEX_MODELS.main, effort: 'medium' }
  if (rule?.tier === 'light') return { title, executor: 'claude', model: 'claude-haiku-5-5' }

  return { title, executor: 'claude', model: 'claude-sonnet-5-5', effort: 'medium' }
}

// Decides single agent vs parallel agents, and which model runs each part.
export const advise = (rawText: string, at: number): Advice => {
  const text = rawText.slice(0, 4000)
  const prompt = text.trim().slice(0, 120)
  const parts = items(text).slice(0, MAX_PARTS).map(partFor)
  const isFanout = FANOUT.test(text)

  if (REQUIREMENTS.test(text) && text.split('\n').some(line => BULLET.test(line))) {
    return { at, prompt, mode: 'single', parts: [], reason: 'bullets are requirements of one task' }
  }
  if (SEQUENTIAL.test(text)) {
    return { at, prompt, mode: 'single', parts: [], reason: 'steps depend on each other' }
  }
  if (parts.length >= 2) {
    return { at, prompt, mode: 'parallel', parts, reason: `${parts.length} independent parts` }
  }
  if (isFanout) {
    const base = parts[0] ?? partFor(text)

    return { at, prompt, mode: 'parallel', parts: [base], reason: 'same work over many targets: one agent per target' }
  }

  return { at, prompt, mode: 'single', parts: [], reason: 'one coherent task' }
}

export const cxFlags = (part: AdvicePart) => `cx -m ${part.model}${part.effort ? ` -e ${part.effort}` : ''}`

// Short note appended to the prompt so the main model follows the advice.
export const adviceNote = (advice: Advice): string => {
  if (advice.mode !== 'parallel') return ''
  const lines = advice.parts.map((part, index) =>
    part.executor === 'codex'
      ? `${index + 1}. ${part.title} -> Codex: ${cxFlags(part)} -t <task> (background)`
      : `${index + 1}. ${part.title} -> subagent model ${part.model}${part.effort ? `, effort ${part.effort}` : ''}`,
  )

  const hasCodex = advice.parts.some(part => part.executor === 'codex')
  const codexHint = hasCodex ? '\nFor Codex parts write the spec to .collab/$CLAUDE_CODE_SESSION_ID/tasks/<task>.md first.' : ''

  return (
    `\n\n[orchestration advice: ${advice.reason}. Do not do these parts yourself one after another: ` +
    `start every part below in ONE message (subagents via Agent, Codex via Bash with run_in_background), ` +
    `then only supervise, review and merge.\n${lines.join('\n')}${codexHint}]`
  )
}
