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

Tiers: **P-F / P-W** = primary provider's fast / workhorse model; **C-F / C-W / C-D** = Claude's fast / workhorse / deep model. The author's current mapping (names go stale; resolve them from `orchestrator_capabilities`): P-F = gpt-6-luna, P-W = gpt-6.1-sol, C-F = Haiku 5.5, C-W = Sonnet 5.5, C-D = Opus 5.5.

| Task | Primary | Start | Escalate to | Fallback | Why |
| --- | --- | --- | --- | --- | --- |
| Mechanical edits, formatting, renames | P-F | low | P-W medium | C-F medium | Exact spec; the check proves it |
| Lookup, inventory, log summaries | P-F | low | P-F medium, then P-W medium | C-F medium | Retrieval is cheap; interpretation costs more |
| Repo exploration (>5 files), architecture map | P-F | medium | P-W medium | C-W high | Breadth over depth; result is a short file:line map |
| CI failure diagnosis | P-W | medium | high | C-W high | Tell code bugs, infra and flaky checks apart |
| Fixtures, docs drafts, commit/PR text | P-F | medium | P-W medium | C-W medium | Bounded drafting from verified facts |
| Planning, specs, acceptance criteria | P-W | medium | high | C-W high | A good spec is the cheapest way to cut downstream cost |
| Tests (routine) | P-F | medium | P-W medium | C-W medium | Some judgment, rarely deep |
| Tests for auth, money or data integrity | P-W | medium | high | C-W high | Weak tests there cost the most |
| Features, backend, refactors | P-W | medium | high | C-W medium | A failing check is the cheapest signal to spend more |
| Data transforms, read-only SQL | P-W | medium | high | C-W medium | Validate cardinality, nulls, output |
| Performance work | P-W | medium | high | C-W high | A benchmark is the acceptance check; no guessing |
| Debugging with a repro | P-W | medium | high, then xhigh | C-D high | The failing test makes the target concrete |
| Debugging without a repro | P-W | high | xhigh, then council | C-D high | Ambiguity is the cost driver |
| Architecture, security, schema/migration/RLS | P-W | high | xhigh | C-D high | Mistakes are costly; the main thread reviews and applies irreversible steps |
| i18n / translation | P-F | medium | P-W medium | C-W medium | Glossary and placeholder checks; sensitive copy routes by risk |
| UI change in an existing design system | P-W | medium | high | C-W high | The system constrains the decisions; spec names the design skills |
| UI: new design system or landing page | P-W | high | xhigh | C-W high | Broad visual decisions justify the budget |
| UI visual check | Opposite-family W + browser | medium | one targeted recheck | main thread | Rendered evidence, max 2 rounds |
| Diff review, routine | P-W (P-F for mechanical), fresh context, read-only | medium | high | C-W medium | No author context; read the diff and the check output |
| Diff review: security, data, auth, migrations, or >200 lines | The family that did not author it, read-only | high | council on unresolved objection | main thread, noting the independence gap | Different lineage catches different bugs |
| Council | P-W + C-W (C-D only for the most consequential) | xhigh + high | n/a | proceed with the available member | Two families, one round, read-only; rare |
| Secrets, prod infra, irreversible ops | main thread only | n/a | n/a | stop if prerequisites are missing | Never delegated |

**How effort is chosen:**

1. Apply the safety gates first (council triggers, main-thread-only rows), then the row's start effort. Size and language never override consequence. Start one step higher for irreversible or shared state; one step lower for an exact spec.
2. One quality ladder. "Failed" means the acceptance check fails or the result violates the spec. A wrong or vague spec: fix the spec and rerun at the same effort. A reasoning failure: one step up in effort on the same model, with a changed hypothesis. Second failure: one attempt on the fallback. Third: the main thread. Tool or environment failures are counted separately.
3. Availability is separate from quality: skip a provider that is down, use the nearest Claude tier, and keep the row's quality floor and its cross-family review rule.
4. `xhigh` needs a one-line reason. `max`, `ultra`, `ultrathink`, `ultracode`, fast modes and priority service tiers are off unless you ask (priority only when you are blocked on the critical-path child).
5. Tune from evidence: if a row passes first try three times in a row, lower its start effort one step; if it needs escalation three times in a row, raise it. Log either change in [LOG.md](LOG.md).

## Improving it

Changes and the evidence behind them are recorded in [LOG.md](LOG.md). To change the policy, edit `CLAUDE-snippet.md`, add a dated LOG entry with the reason (what failed or cost too much), and note it in `CHANGELOG.md`.

Persian guide: [docs/fa/t3-routing.md](../docs/fa/t3-routing.md)
