# Model routing in T3 Code
Applies when T3 tools (`delegate_task`, `orchestrator_capabilities`) exist. Outside T3, delegate by hand.
Priority: **save main-provider quota first**, second provider's quota second, quality never below "correct".

## Session start (automatic)
On the first actionable turn make `orchestrator_capabilities` the first T3 call, before any edit or
delegation (loading its schema via ToolSearch and read-only context reads may come first). Cache
provider/model IDs and option descriptors for the session; refresh on resume, provider change or
selection error. Map the table's tiers to the nearest live model (IDs go stale; never hardcode from memory).
Then triage the whole task by risk, uncertainty, scope, dependencies. Risk beats keywords; never judge
complexity by prompt length or language.

## Triage (in order)
0. Consequence gate first: council triggers and main-thread-only rows are checked before choosing inline vs delegated.
1. Clear + low-risk, <=2 files / ~30 lines, needs session context, or spec costs as much as the work: do inline.
2. Else delegate ONE coherent task via `delegate_task` (async). Split only genuinely independent
   deliverables; max 2 active children; children are leaves (no further delegation); parallel writers
   get disjoint paths or `isolation:"worktree"` from a committed base.
3. Council trigger matches: council (below). Otherwise never.
Mixed task (e.g. feature + its tests): one child, routed by the hardest part's row. Launch async
children first, then do inline work while they run.
Spec = goal, file paths (never contents), constraints, acceptance check, result <=15 lines as the
child's final reply.
Always pass explicit `target.providerInstanceId`, `model`, `options`; verify the returned selection.

## Routing table (start low, escalate on evidence)
Tiers: P-F / P-W = primary provider's fast / workhorse model; C-F / C-W / C-D = Claude's fast / workhorse / deep model.
Replace them with what `orchestrator_capabilities` lists for you.

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

Effort rules:
1. Safety gates first (council triggers, main-thread-only rows), then the row's start effort. Size and language never override consequence. Start one step higher for irreversible or shared state, one lower for an exact spec.
2. One quality ladder. "Failed" = acceptance check fails or the result violates the spec. Wrong/vague spec: fix the spec, rerun at the same effort. Reasoning failure: one step up in effort on the same model, with a changed hypothesis. Second failure: one attempt on the fallback. Third: main thread. Tool/environment failures are counted separately.
3. Availability is separate from quality: skip a provider that is down, use the nearest Claude tier (C-F simple, C-W implementation, C-D high for consequential), keep the row's quality floor and cross-family review rule.
4. `xhigh` needs a one-line reason. Banned unless you ask: max, ultra, ultrathink, ultracode, fast modes, priority service tiers (priority only if you are actively blocked on a critical-path child).
5. If a row passes first try 3 times in a row, lower its start effort a step; if it needs escalation 3 times in a row, raise it. Log the change.
Keep a list of **excluded models** (exhausted credit, not permitted) and never route to them, in any role including council.
Autonomy: choose single vs multi-agent, provider, model and effort yourself using the table; one line of reason per non-default choice. If blocked or ambiguous in a way sensible defaults can't settle (unclear goal, conflicting constraints, irreversible/outward action, two failed attempts), ask the user at once with 2-4 concrete options and a recommended first.

## Council (rare)
Triggers: architecture/schema/RLS decision, security design, irreversible migration, root cause still
unknown after one failed fix, unresolved reviewer objection. Never for routine features/bug fixes.
Members: P-W xhigh + C-W high (C-D only for the most consequential).
Read-only, one round, each <=45 lines; main thread synthesizes. Max 1 council per session unless asked.
If a member hits a rate limit, proceed without it; do not retry.

## Rules
- Main-thread model: cheapest that can orchestrate.
- Follow the effort-rule ladder above. No identical retries.
- Review cost: read result + `git diff --stat`; open the full diff only for risky files or a failed check. Pick the reviewer relative to the author (security/data/auth/migrations/>200 lines: the other family).
- Worktrees only when parallel writers touch the same files; commit locally first (uncommitted edits aren't copied).
- Push is main-thread-only, after review and tests pass.
- Any deviation from this table gets one line of reason in the reply.
