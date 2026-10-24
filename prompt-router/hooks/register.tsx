import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Advice, CodexJob, Decision, Tier } from '../types'
import { advise, adviceNote, CODEX_MODELS } from './advise'
import { codexOutput, codexTarget, looksSecret } from './codex'
import { EFFORT, LABELS, MODELS, parsePrefix, ruleTier, stickyModel, tierOfLabel } from './route'

const decision = atom({ plugin: 'prompt-router', key: 'decision' } as const, null)
const lastModel = atom({ plugin: 'prompt-router', key: 'lastModel' } as const, null)
const isEnabled = atom({ plugin: 'prompt-router', key: 'isEnabled' } as const, true)
const stats = atom({ plugin: 'prompt-router', key: 'stats' } as const, {})
const badModels = atom({ plugin: 'prompt-router', key: 'badModels' } as const, [])
const emptyModel = atom({ plugin: 'prompt-router', key: 'emptyModel' } as const, null)
const repoJobs = new Map<string, Promise<void>>()
const jobs = atom({ plugin: 'prompt-router', key: 'jobs' } as const, [])

const TAIL_LINES = 30

// agent-board reads this to show what was advised next to what actually ran.
const writeAdvice = async ($: EngineInterface, advice: Advice) => {
  const dir = `${(await $.env.get('HOME')) ?? ''}/.claude/mods-data/orchestration`
  await $.process.run(['mkdir', '-p', dir]).catch(() => undefined)
  await $.fs.write(`${dir}/${await $.session.id()}.json`, JSON.stringify(advice)).catch(() => undefined)
}

const decide = async ($: EngineInterface, text: string, forced: Tier | undefined): Promise<Decision> => {
  const at = await $.clock.now()
  if (forced) return { tier: forced, model: MODELS[forced], reason: `!${forced}`, source: 'prefix', at }

  const rule = ruleTier(text)
  if (rule?.tier === 'keep') {
    const last = await read($, decision)
    if (last) return { ...last, reason: rule.reason, source: 'keep', at }
  } else if (rule) {
    return { tier: rule.tier, model: MODELS[rule.tier], reason: rule.reason, source: 'rule', at }
  }

  try {
    const label = await $.model.classify(text.slice(0, 4000), Object.values(LABELS), { model: MODELS.light })
    const tier = tierOfLabel(label)
    if (tier) return { tier, model: MODELS[tier], reason: 'haiku classifier', source: 'haiku', at }
    // Name the raw answer so /route shows why the classifier did not decide.
    return { tier: 'standard', model: MODELS.standard, reason: `classifier answered ${JSON.stringify(label ?? null).slice(0, 80)}`, source: 'fallback', at }
  } catch (error) {
    return { tier: 'standard', model: MODELS.standard, reason: `classifier failed: ${String(error).slice(0, 80)}`, source: 'fallback', at }
  }
}

const writeJobs = async ($: EngineInterface) => {
  const dir = `${(await $.env.get('HOME')) ?? ''}/.claude/mods-data/codex-jobs`
  await $.process.run(['mkdir', '-p', dir]).catch(() => undefined)
  const file = `${dir}/${await $.session.id()}.json`
  await $.process.run(['touch', file]).catch(() => undefined)
  const privateFile = await $.process.run(['chmod', '600', file]).catch(() => undefined)
  if (privateFile?.exitCode !== 0) return
  await $.fs.write(file, JSON.stringify(await read($, jobs))).catch(() => undefined)
  await $.process.run(['chmod', '600', file]).catch(() => undefined)
}

const setJob = async ($: EngineInterface, id: number, patch: Partial<CodexJob>) => {
  await update($, jobs, list => list.map(job => (job.id === id ? { ...job, ...patch } : job)))
  await writeJobs($)
}

const runCodex = async ($: EngineInterface, prompt: string, cwd: string, repo: string) => {
  const home = (await $.env.get('HOME')) ?? ''
  const cx = (await $.fs.exists(`${home}/.local/bin/cx`)) ? `${home}/.local/bin/cx` : 'cx'
  const id = ((await read($, jobs)).at(-1)?.id ?? 0) + 1
  const job: CodexJob = { id, prompt, cwd, status: 'queued', startedAt: await $.clock.now() }
  await update($, jobs, list => [...list, job].slice(-20))
  await writeJobs($)
  $.ui.status(`codex #${id} queued`)

  const previous = repoJobs.get(repo) ?? Promise.resolve()
  const task = previous.catch(() => undefined).then(async () => {
    await setJob($, id, { status: 'running', startedAt: await $.clock.now() })
    $.ui.status(`codex #${id} running`)
    let output = ''
    let code: number | null = null
    try {
      const child = $.process.spawn({ argv: [cx, '--', prompt], cwd })
      for await (const piece of child) output = (output + piece.text).slice(-20_000)
      const ended = await child.result
      code = ended.code
    } catch (error) {
      output += `\n${String(error)}`
    }
    const tail = output.trim().split('\n').slice(-TAIL_LINES).join('\n')
    const isDone = code === 0
    await setJob($, id, { status: isDone ? 'done' : 'failed', endedAt: await $.clock.now(), tail })
    $.ui.status(undefined)
    $.ui.toast(`codex #${id} ${isDone ? 'finished' : `failed (exit ${code ?? '?'})`}`)
    void $.ui.notify(`Codex job #${id} ${isDone ? 'finished' : 'failed'}`, { title: 'prompt-router' }).catch(() => undefined)
    await $.session
      .append({
        message: {
          type: 'user',
          content: [
            {
              type: 'text',
              text:
                `[prompt-router] Codex job #${id} ${isDone ? 'finished' : `failed (exit ${code ?? '?'})`} in ${cwd}.\n` +
                `${codexOutput(id, tail)}\n` +
                'Review it (git show --stat) before relying on it; cx commits locally and never pushes.',
            },
          ],
        },
      })
      .catch(() => undefined)
  }).catch(() => undefined)
  repoJobs.set(repo, task)
  void task.then(() => {
    if (repoJobs.get(repo) === task) repoJobs.delete(repo)
  })

  return id
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get('isEnabled')
    if (saved === false) await update($, isEnabled, () => false)
    await $.command.register({
      name: 'route',
      description: 'Prompt router: /route (status), /route on, /route off. Prefix a prompt with !haiku !sonnet !opus !fable !codex',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    // Why the last prompt was or was not routed; /route prints it.
    const dir = `${(await $.env.get('HOME')) ?? ''}/.claude/mods-data/prompt-router`
    await $.process.run(['mkdir', '-p', dir]).catch(() => undefined)
    await $.fs
      .write(`${dir}/last-submit.json`, JSON.stringify({ at: await $.clock.now(), origin: e.origin, command: e.command ?? null, isMeta: e.isMeta ?? false }))
      .catch(() => undefined)
    // The person's own prompt: typed at this terminal or sent through Remote Control.
    const isOwn = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (e.command || e.isMeta || !isOwn || !(await read($, isEnabled))) return next(e)

    const { forced, text } = parsePrefix(e.text)
    const secret = looksSecret(text)
    let chosen = secret
      ? { tier: 'standard' as const, model: MODELS.standard, reason: 'possible secret, kept local', source: 'fallback' as const, at: await $.clock.now() }
      : await decide($, text, forced)
    let advice = advise(text, await $.clock.now())
    if (secret) advice = { ...advice, mode: 'single', parts: [], reason: chosen.reason }

    if (codexTarget(chosen, advice, text)) {
      const cwd = await $.session.cwd()
      const repo = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd }).catch(() => undefined)
      if (repo?.exitCode === 0) {
        const id = await runCodex($, text, cwd, repo.stdout.trim())
        await update($, stats, all => ({ ...all, codex: (all.codex ?? 0) + 1 }))
        // Only a dispatched job gets a synthetic part on the board.
        advice = { ...advice, mode: 'parallel', parts: [{ title: text.slice(0, 70), executor: 'codex', model: CODEX_MODELS.cheap, effort: 'medium' }], reason: 'bulk/mechanical: sent to Codex' }
        await writeAdvice($, advice)

        return { drop: `prompt-router: sent to Codex as job #${id} (${chosen.reason}); its result lands here when done.` }
      }
      chosen = { ...chosen, tier: 'standard', model: MODELS.standard, reason: 'codex needs a git repo', source: 'fallback' }
    } else if (chosen.tier === 'codex') {
      const tier = advice.parts.some(part => part.model === MODELS.heavy) ? 'heavy' : 'standard'
      chosen = { ...chosen, tier, model: MODELS[tier], reason: 'parallel parts kept in Claude', source: 'fallback' }
    }
    await writeAdvice($, advice)

    await update($, decision, () => chosen)
    await update($, stats, all => ({ ...all, [chosen.model]: (all[chosen.model] ?? 0) + 1 }))
    $.ui.status(`route: ${chosen.model} · ${chosen.reason}`)

    const note = adviceNote(advice)

    return next(text === e.text && !note ? e : { ...e, text: text + note })
  })

  on('turn.step', async function* ($, e, next) {
    const chosen = await read($, decision)
    if (e.agentId !== undefined || chosen === null || !(await read($, isEnabled))) return yield* next(e)

    const last = (await read($, lastModel)) ?? undefined
    const model = stickyModel(chosen.model, last, e.messageCount, chosen.source === 'prefix')
    // Skip unavailable models for the session.
    if (model === e.model || (await read($, badModels)).includes(model)) {
      await update($, emptyModel, () => null)
      return yield* next(e)
    }
    const effort = model === MODELS.light ? undefined : (EFFORT[chosen.tier] ?? e.effort)
    if (model !== last) await update($, lastModel, () => model)
    if (model !== chosen.model) $.ui.status(`route: kept ${model} (long context, cache)`)

    const result = yield* next({ ...e, model, effort })
    const empty = !next.signal.aborted && result.stopReason === null && result.usage === null && result.toolUses.length === 0
    const previousEmpty = await read($, emptyModel)
    await update($, emptyModel, () => (empty ? model : null))
    // No abort flag on the result: require two consecutive empty replies.
    if (empty && previousEmpty === model) {
      await update($, badModels, all => (all.includes(model) ? all : [...all, model]))
      await update($, lastModel, () => null)
      $.ui.status(`route: ${model} unavailable, kept ${e.model}`)
    }
    return result
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    const verb = e.args.trim()
    if (verb === 'on' || verb === 'off') {
      await update($, isEnabled, () => verb === 'on')
      await $.store.set('isEnabled', verb === 'on')
      if (verb === 'off') $.ui.status(undefined)

      return { text: `Prompt router ${verb}.` }
    }

    const chosen = await read($, decision)
    const counts = Object.entries(await read($, stats))
      .map(([model, n]) => `${model} ${n}`)
      .join(', ')
    const recent = (await read($, jobs))
      .slice(-5)
      .map(job => `  #${job.id} ${job.status}: ${job.prompt.slice(0, 60)}`)
      .join('\n')

    return {
      text: [
        `Router ${(await read($, isEnabled)) ? 'on' : 'off'}.`,
        chosen ? `Last: ${chosen.model} (${chosen.tier}, ${chosen.source}: ${chosen.reason}).` : 'No prompt routed yet.',
        `Model in use: ${(await read($, lastModel)) ?? 'session default'}.`,
        counts ? `This session: ${counts}.` : '',
        recent ? `Codex jobs:\n${recent}` : '',
        'Prefixes: !haiku !sonnet !opus !fable !codex !auto',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })
}
