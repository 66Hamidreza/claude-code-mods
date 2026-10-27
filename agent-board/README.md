# agent-board

```text
/plugin install agent-board --marketplace 66Hamidreza/claude-code-mods
```

Observes the main session, subagents, workflow agents, Codex exec runs, and standalone Codex main threads driven by T3 Code. Shows model, current tool, recent calls, errors, tokens, duration, and heuristic health indicators in a terminal pane and a local web board.

## Commands

- `/board`: open the pane.
- `/board web`: start the board at `http://localhost:7788/` for all local sessions (static fallback server, no usage header; see Always-on web board).
- `/board notify on` / `/board notify off`: persist the native-notification preference; toasts remain enabled.
- `/board clear`: remove finished non-main nodes and clear event history.

The pane also offers controls for finished agents and history. The web board supports filtering, search, pinning and collapse, with browser-local preferences and opt-in browser alerts.

## Configuration and operation

No custom environment variables; `HOME` locates `~/.claude/mods-data/agent-board/web` and `~/.codex/sessions`. Polls agent state every second and writes session snapshots for the web board. Inside T3 Code, delegated children are read from `~/.t3/userdata/statev2.sqlite` (read-only, matched to the session by its provider thread id). Python 3 reads recent Codex rollout logs and serves static files bound to `127.0.0.1:7788`. Explicit `CX_RUN_V1` owner/run markers attribute delegated jobs; interactive Codex TUI sessions are excluded. The always-on server independently scans T3 Code Codex main rollouts, excluding CX-marked runs and native IDs mapped to T3 delegated children. Orchestration advice from prompt-router is compared with observed execution.

## Usage header

The top of the web page shows how much of the Claude and Codex limits is left (5-hour and weekly windows, reset countdowns) and the Codex subscription end date. `server.py` computes it on request from local files only: Claude from the `rate_limit_event` entries T3 Code logs under `~/.t3/userdata/logs/provider`, Codex from the newest rollout in `~/.codex/sessions`, and the plan dates from the Codex ID-token claims. No token is returned. Claude's renewal date is not stored locally and shows as unavailable; Claude data refreshes only while a T3 session is active, and the card shows when it was last updated.

## Always-on web board

Optional: serve the board without any session open. Copy `agent-board-web.service` to `~/.config/systemd/user/` (it runs `server.py`; adjust the path to where the mod is installed), then `systemctl --user enable --now agent-board-web`. It serves the static files plus `/usage.json` (Claude and Codex limits left, read from T3's provider logs, Codex rollouts and the Codex plan dates; Claude's renewal date is not stored locally). The `/board web` fallback server has no `/usage.json`. Claude session data comes from snapshots live sessions write. Standalone T3 Code Codex rows are discovered independently via `/codex-sessions.json`, so they appear without any Claude session or mod hook running. The server serves the installed `hooks/web.ts` page directly. The scanner reads only the newest two day directories, keeps rollouts modified within two hours, caches unchanged files, and shows project, model, last action and token totals. `task_complete` (or an aborted turn) marks done; `task_started` resumes running, with five minutes of log silence also treated as done. T3 child mappings are read-only and refreshed each scan; if an existing T3 database cannot be queried, standalone results are withheld until it recovers. Install `server.py` and `hooks/codex_standalone.py` alongside the updated `hooks/web.ts`, then restart the service. Terminal panes continue to show hook-driven sessions and children. `/board web` copes with the port already being served.

## Web board behavior

Sessions are served from `/sessions.json` (written atomically; a heartbeat keeps live sessions from vanishing). The list stays stable: rows are not reordered by timestamp churn, severity changes are debounced, and a session missing from a poll is kept briefly before it is dropped. Ended sessions are hidden from All, Needs attention, Running and Codex; they appear only under the Ended filter (pinned sessions always stay). Browser alerts fire on state transitions only. Real delegate/result/peer-message links are drawn between agents and sessions. The usage cards show reset times and flag early or unscheduled resets (a drop of 10% or more, or a clock shift before the scheduled time) with a badge, a dismissible banner and per-window history; the Codex card also shows available rate-limit reset credits (read-only fetch every five minutes).

For a friendlier local name, add `127.0.0.1 abd` to your hosts file (on WSL with a Windows browser: `C:\Windows\System32\drivers\etc\hosts`, as administrator) and open `http://abd:7788/`. The server accepts only `localhost`, `127.0.0.1` and `abd` as `Host` values.

## Limits

Health flags are heuristics (repeated calls, repeated failures, inactivity), not proof of failure. Quiet or long-running work may be flagged. Codex parsing depends on rollout formats and scans recent day folders. The fixed port must be available; another server may already own it. Automatic browser opening tries `cmd.exe`; on other systems open the URL manually. Desktop notifications depend on host/OS support. Snapshots and logs can include command text, paths, and summaries; the local server has no authentication and exposes files in its web directory to local clients.

[Installation and development](../README.md) · [راهنمای فارسی](../docs/fa/agent-board.md)
