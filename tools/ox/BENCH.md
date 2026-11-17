# OpenCode free-model benchmark

Run: 2026-11-17T12:34:00+00:00. OpenCode 2.3.0.

36 sequential runs, 120s per-run timeout, 5s gap between runs. Synthetic files in fresh
temporary directories outside the repository; no repository content supplied.
Pass means generated artifacts passed local checks, not model self-report.

| Model | Task | Result | Seconds | Error |
|---|---|---|---:|---|
| beam-free | rename | FAIL | 120.1 | timeout |
| beam-free | summary | PASS | 37.4 | — |
| beam-free | tests | PASS | 39.8 | — |
| big-pickle | rename | PASS | 61.6 | — |
| big-pickle | summary | PASS | 52.7 | — |
| big-pickle | tests | PASS | 82.1 | — |
| deepseek-v4.1-flash-free | rename | PASS | 46.8 | — |
| deepseek-v4.1-flash-free | summary | PASS | 54.3 | — |
| deepseek-v4.1-flash-free | tests | PASS | 50.3 | — |
| flint-40b-free | rename | PASS | 83.2 | — |
| flint-40b-free | summary | PASS | 71.1 | — |
| flint-40b-free | tests | PASS | 59.2 | — |
| glm-5.3-flash-free | rename | PASS | 99.2 | — |
| glm-5.3-flash-free | summary | PASS | 48.4 | — |
| glm-5.3-flash-free | tests | PASS | 49.7 | — |
| hy4-flash-free | rename | PASS | 61.5 | — |
| hy4-flash-free | summary | PASS | 57.4 | — |
| hy4-flash-free | tests | PASS | 57.4 | — |
| iceman-free | rename | PASS | 36.4 | — |
| iceman-free | summary | PASS | 46.3 | — |
| iceman-free | tests | PASS | 53.7 | — |
| inkling-2-small-free | rename | PASS | 65.2 | — |
| inkling-2-small-free | summary | PASS | 37.8 | — |
| inkling-2-small-free | tests | PASS | 35.7 | — |
| longcat-2.5-free | rename | PASS | 75.3 | — |
| longcat-2.5-free | summary | PASS | 57.2 | — |
| longcat-2.5-free | tests | PASS | 80.3 | — |
| mimo-v2.6-flash-free | rename | PASS | 53.3 | — |
| mimo-v2.6-flash-free | summary | PASS | 50.7 | — |
| mimo-v2.6-flash-free | tests | PASS | 66.8 | — |
| nemotron-3.5-lightning-free | rename | FAIL | 14.7 | {'type': 'provider.auth', 'message': 'Upstream request failed: Endpoint is unavailable.', 'status': 403, 'response': {'body': '{"error":{"type":"server_error","message":"Upstream request failed: Endpoint is unavailable."}}'}} |
| nemotron-3.5-lightning-free | summary | PASS | 59.1 | — |
| nemotron-3.5-lightning-free | tests | PASS | 52.8 | — |
| nemotron-3.5-super-vl-free | rename | PASS | 34.5 | — |
| nemotron-3.5-super-vl-free | summary | PASS | 51.6 | — |
| nemotron-3.5-super-vl-free | tests | PASS | 38.1 | — |

## Ranking

Ordered by passed tasks descending, then total elapsed seconds ascending.

| Rank | Model | Passed | Total seconds |
|---:|---|---:|---:|
| 1 | nemotron-3.5-super-vl-free | 3/3 | 124.3 |
| 2 | iceman-free | 3/3 | 136.5 |
| 3 | inkling-2-small-free | 3/3 | 138.7 |
| 4 | deepseek-v4.1-flash-free | 3/3 | 151.4 |
| 5 | mimo-v2.6-flash-free | 3/3 | 170.8 |
| 6 | hy4-flash-free | 3/3 | 176.4 |
| 7 | big-pickle | 3/3 | 196.5 |
| 8 | glm-5.3-flash-free | 3/3 | 197.3 |
| 9 | longcat-2.5-free | 3/3 | 212.8 |
| 10 | flint-40b-free | 3/3 | 213.5 |
| 11 | nemotron-3.5-lightning-free | 2/3 | 126.7 |
| 12 | beam-free | 2/3 | 197.3 |

Recommended default: `opencode/nemotron-3.5-super-vl-free`.

Fallback order: `nemotron-3.5-super-vl-free`, `iceman-free`, `inkling-2-small-free`, `deepseek-v4.1-flash-free`, `mimo-v2.6-flash-free`, `hy4-flash-free`, `big-pickle`, `glm-5.3-flash-free`, `longcat-2.5-free`, `flint-40b-free`, `nemotron-3.5-lightning-free`, `beam-free`.

One run per task is a small smoke benchmark; latency and availability can vary.
Rename checks old-name absence, compilation and behavior. Summary checks five bullets
and event keywords. Tests must execute ≥3 cases, pass, preserve source and reject a broken function.
