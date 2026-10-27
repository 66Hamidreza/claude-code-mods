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

## Routing table (start low, escalate on evidence: failed check or real ambiguity)
Tiers below use example model names; replace them with what `orchestrator_capabilities` lists for you.

| Task | Primary | Fallback |
|---|---|---|
| Mechanical edits, formatting, renames | small-fast model, low effort | mid model, medium |
| Search, inventory, log summaries, "where is X" | small-fast model, low | smallest Claude, medium |
| Tests, fixtures, docs drafts | small-fast model, medium (mid model if it fails once) | mid model, medium |
| Features, backend, refactors | mid model, medium, then high on failing checks | mid Claude, medium |
| Hard debugging, architecture, security, DB/RLS | strongest model, high; xhigh only after one failed attempt; main thread reviews | strongest Claude, high |
| UI build | strongest model, high (xhigh only for a new design system) | mid Claude, high |
| UI visual check | mid Claude, medium + browser automation, max 2 rounds | main thread |
| Review of a diff | fresh-context strong model, high, read-only; security/data: a different model family from the author | mid Claude |
| Secrets, prod infra, irreversible ops | main thread only, never delegated | none |
If the primary provider is down (quota/error twice): smallest Claude for simple work, mid Claude for implementation, strongest Claude (high) for consequential work.
Keep a list of **excluded models** (exhausted credit, not permitted) and never route to them.
Banned unless you ask: max/ultra effort, fast modes, priority service tiers (only if you are actively blocked on a critical-path child).
Autonomy: choose single vs multi-agent, provider, model and effort yourself using the table; one line of reason per non-default choice. If blocked or ambiguous in a way sensible defaults can't settle (unclear goal, conflicting constraints, irreversible/outward action, two failed attempts), ask the user at once with 2-4 concrete options and a recommended first.

## Council (rare)
Triggers: architecture/schema/RLS decision, security design, irreversible migration, root cause still
unknown after one failed fix, unresolved reviewer objection. Never for routine features/bug fixes.
Members: strongest model xhigh + a mid Claude high (strongest Claude only for the most consequential).
Read-only, one round, each <=45 lines; main thread synthesizes. Max 1 council per session unless asked.
If a member hits a rate limit, proceed without it; do not retry.

## Rules
- Main-thread model: cheapest that can orchestrate.
- Fail twice on one task: next fallback; fail again: main thread does it. No identical retries.
- Review cost: read result + `git diff --stat`; open the full diff only for risky files or a failed check.
- Worktrees only when parallel writers touch the same files; commit locally first (uncommitted edits aren't copied).
- Push is main-thread-only, after review and tests pass.
- Any deviation from this table gets one line of reason in the reply.
