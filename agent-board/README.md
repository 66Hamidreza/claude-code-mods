# agent-board

```text
/plugin install agent-board --marketplace 66Hamidreza/claude-code-mods
```

Observes the main session, subagents, workflow agents, and Codex exec runs. Shows model, current tool, recent calls, errors, tokens, duration, and heuristic health indicators in a terminal pane and a local web board.

## Commands

- `/board`: open the pane.
- `/board web`: start the board at `http://localhost:7788/` for all local sessions.
- `/board notify on` / `/board notify off`: persist the native-notification preference; toasts remain enabled.
- `/board clear`: remove finished non-main nodes and clear event history.

The pane also offers controls for finished agents and history. The web board supports filtering, search, pinning and collapse, with browser-local preferences and opt-in browser alerts.

## Configuration and operation

No custom environment variables; `HOME` locates `~/.claude/mods-data/agent-board/web` and `~/.codex/sessions`. Polls agent state every second and writes session snapshots for the web board. Python 3 reads recent Codex rollout logs and serves static files bound to `127.0.0.1:7788`. Explicit `CX_RUN_V1` owner/run markers attribute delegated jobs; interactive Codex TUI sessions are excluded. Orchestration advice from prompt-router is compared with observed execution.

## Limits

Health flags are heuristics (repeated calls, repeated failures, inactivity), not proof of failure. Quiet or long-running work may be flagged. Codex parsing depends on rollout formats and scans recent day folders. The fixed port must be available; another server may already own it. Automatic browser opening tries `cmd.exe`; on other systems open the URL manually. Desktop notifications depend on host/OS support. Snapshots and logs can include command text, paths, and summaries; the local server has no authentication and exposes files in its web directory to local clients.

[Installation and development](../README.md) · [راهنمای فارسی](../docs/fa/agent-board.md)
