# Routing log

Newest first. One entry per change: date, what changed, why (the observed failure or cost).

## 2026-10-25
- Priority is now "save main-provider quota first, second provider second, quality never below correct".
- UI build/visual work moved to the strongest model with a separate visual-check step (max 2 rounds), instead of a single provider.
- Excluded-models list added as a first-class concept (a model whose credit ran out must never be routed to, council included).
- Council limited to one per session; members fixed to the strongest model at xhigh plus a mid Claude at high.
- Basis: a council review comparing both providers' recommendations.
