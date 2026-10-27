# t3-routing

A routing policy for people who run Claude Code inside [T3 Code](https://t3.codes): the main thread stays cheap, and real work goes to the right model through `delegate_task`. It is a policy, not a plugin: you paste it into your `CLAUDE.md`, and the model follows it.

[prompt-router](../prompt-router/README.md) routes each prompt to a model by rules. t3-routing instead decides, per task, whether to work inline, delegate to one child, or convene a council, using the model list T3 reports. They can be used together.

## Install

1. Open `~/.claude/CLAUDE.md` (or a project `CLAUDE.md`).
2. Append the contents of [CLAUDE-snippet.md](CLAUDE-snippet.md).
3. Edit the routing table: replace the tier names with the models `orchestrator_capabilities` lists for your account, and fill in your excluded models.

It only takes effect where T3 tools (`delegate_task`, `orchestrator_capabilities`) exist.

## How it works

- **Session start:** read the live model catalog first; never hardcode IDs.
- **Triage:** small or context-bound work stays inline; otherwise one delegated child, at most two at once, no nested delegation.
- **Routing table:** start with the cheap tier and escalate only on a failed check or real ambiguity.
- **Council:** rare, read-only, one round, for architecture, security, irreversible changes or a root cause still unknown after one failed fix.
- **Rules:** pushes happen only from the main thread after review and tests; secrets and prod infrastructure are never delegated.

## Who gets what, why, and at what effort

The author's current mapping, as an example (model names go stale; map the tiers to what your `orchestrator_capabilities` lists):

| Task | Model (example) | Effort | Why |
| --- | --- | --- | --- |
| Mechanical edits, formatting, renames | gpt-6-luna | low | Exact spec, nothing to reason about; cheapest tier is enough |
| Search, inventory, log summaries | gpt-6-luna (fallback Haiku 5.5) | low / medium | Read-heavy and low risk; keeps the main thread's context clean |
| Tests, fixtures, docs drafts | gpt-6-luna, then gpt-6-astra | medium | Needs some judgment; move up a tier only after one failure |
| Features, backend, refactors | gpt-6.1-sol (fallback Sonnet 5.5) | medium, high after a failed check | Real logic, but a failing check is the cheapest signal to spend more |
| Hard debugging, architecture, security, DB/RLS | gpt-6.1-sol (fallback Opus 5.5) | high; xhigh only after one failed attempt | Mistakes are costly; the main thread reviews the result |
| UI build | gpt-6.1-sol (fallback Sonnet 5.5) | high; xhigh only for a new design system | Visual quality needs the strongest model plus named design skills |
| UI visual check | Sonnet 5.5 + browser automation | medium, max 2 rounds | Cheap, bounded loop; avoids endless polishing |
| Diff review | fresh-context gpt-6.1-sol, read-only | high | A reviewer with no author context; security/data reviews use a different model family from the author |
| Council | gpt-6.1-sol + Sonnet 5.5 (Opus only if most consequential) | xhigh + high | Two families, one round, read-only; rare |
| Secrets, prod infra, irreversible ops | main thread only | n/a | Never delegated |

**How effort is chosen:** start at the lowest effort the row allows; escalate one step only on evidence (a failed acceptance check or real ambiguity), never because the prompt is long or sounds important; the same task failing twice moves to the fallback model, and a third failure goes to the main thread. `max`/`ultra` efforts, fast modes and priority service tiers are off unless you ask for them (priority only when you are blocked on the critical-path child).

## Improving it

Changes and the evidence behind them are recorded in [LOG.md](LOG.md). To change the policy, edit `CLAUDE-snippet.md`, add a dated LOG entry with the reason (what failed or cost too much), and note it in `CHANGELOG.md`.

Persian guide: [docs/fa/t3-routing.md](../docs/fa/t3-routing.md)
