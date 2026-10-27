# Routing log

Newest first. One entry per change: date, what changed, why (the observed failure or cost).

## 2026-10-27
- Routing table rebuilt from a council (gpt-6.1-sol xhigh + Sonnet 5.5 high): portable tiers (P-F/P-W, C-F/C-W/C-D), explicit Start / Escalate / Fallback columns, and 12 new or split rows (exploration, CI triage, planning, security-critical tests, data/SQL, perf, debug with/without repro, i18n, established vs new UI, routine vs high-risk review).
- One quality ladder replaces the conflicting "one failure" / "two failures" rules; availability failures are counted separately; wrong specs are fixed, not escalated.
- Review independence is now relative to the author (other family for security/data/auth/migrations/>200 lines), and a consequence gate runs before the inline-vs-delegate triage.
- Added a feedback rule: lower a row's start effort after 3 first-try passes, raise it after 3 escalations.
- Reason: README table, snippet and live CLAUDE.md disagreed, and broad rows mispriced work. Still to do: sync the live ~/.claude/CLAUDE.md by hand.

## 2026-10-25
- Priority is now "save main-provider quota first, second provider second, quality never below correct".
- UI build/visual work moved to the strongest model with a separate visual-check step (max 2 rounds), instead of a single provider.
- Excluded-models list added as a first-class concept (a model whose credit ran out must never be routed to, council included).
- Council limited to one per session; members fixed to the strongest model at xhigh plus a mid Claude at high.
- Basis: a council review comparing both providers' recommendations.
