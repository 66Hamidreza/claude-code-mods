# ox — free OpenCode delegation

Requires Python 3.9+, Bash, ps, and `opencode` on PATH; no Python packages.
Free-model providers receive task data. Use only reviewed, non-sensitive tasks.

```bash
export CLAUDE_CODE_SESSION_ID=my-session
# From the repository root (or pass -d /path/to/repo):
tools/ox/ox 'Rename helper foo to bar in src/util.py'
tools/ox/ox -t cleanup -c 'python3 -m unittest discover'
tools/ox/ox -m beam-free -T 120 -d /tmp/synthetic 'Reply with exactly OK'
```

Specs: `.collab/$CLAUDE_CODE_SESSION_ID/tasks/<name>.md`.
Results: `.collab/$CLAUDE_CODE_SESSION_ID/results/<name>.md`, at most 15 lines.
Ad hoc prompts get an automatically named task and result file.
Run from the repo root: ox deliberately does not invoke git to discover it.
`-m` selects a model from models.txt by short name or `opencode/<name>`; fallback follows the list.
Default model is its first line, ranked by BENCH.md's synthetic benchmark.
`-T` defaults to 180 seconds **per attempt** and also bounds the optional check.
Empty output, provider errors, rate limits and timeouts trigger fallback.
Exit codes: 0 success, 1 check failed/timed out, 2 invalid input/all models failed.
Models never receive a commit/push instruction; ox never commits or pushes.
Secret-like names anywhere in the target tree or task references cause refusal.
External symlinks are refused. Name checks cannot detect secrets in ordinary files.
Prompts restrict file access and prohibit git; these are not an OS sandbox.
Failed attempts can leave edits; inspect changes before accepting/retrying work.
A missing model result gets a clearly marked wrapper placeholder.
Re-run the 36-run benchmark: `python3 tools/ox/bench.py` (sequential, 5s gaps).
BENCH.md, models.txt and bench-results.json are regenerated at completion.
