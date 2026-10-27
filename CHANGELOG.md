# Changelog

All notable changes are documented here using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.0] - 2026-10-27

### Fixed

- agent-board web: working agents now glow (pulsing dot, side bar and token bar); inferred parent-to-child flow lines are drawn for children without recorded links, animated while the child works.
- agent-board web: delegated Codex and Claude children show their token counts and token bar (read from each child's own session log or transcript).

- agent-board web: a delegated child session (for example a council member) that finished no longer sits in "Waiting for you" forever; it counts as ended after 2 quiet minutes. Only a pending approval or input keeps a session from ending.

### Added (close button)

- agent-board web: a ✕ button on each session hides it until it is active again (stored in the browser).

### Added

- t3-routing: a routing policy for T3 Code users (a `CLAUDE.md` snippet, not a plugin): session-start catalog read, triage, per-task model routing through `delegate_task`, a rare council, and a change log. English and Persian guides.
- t3-routing: portable tier table with Start / Escalate / Fallback columns, new rows (exploration, CI triage, planning, perf, data/SQL, i18n, debug with/without repro), one escalation ladder, and author-relative review independence.

## [0.2.0] - 2026-10-27

### Changed (ended sessions)

- agent-board web: ended sessions are hidden from All, Needs attention, Running and Codex and appear only under Ended (pinned sessions stay).

### Added (local name and docs)

- agent-board: the server accepts `abd` as a Host value, so `http://abd:7788/` works after adding `127.0.0.1 abd` to the hosts file.
- Docs: dashboard screenshot (sample data) and web board behavior section in the English and Persian agent-board guides.

### Added (web board overhaul)

- agent-board: one `/sessions.json` index (with `serverNow` clock) replaces per-file polling; snapshots are written atomically after a cheap heartbeat that slow collectors can no longer starve; stale usage is kept and flagged instead of shown as 100% left.
- agent-board: session phases (`thinking`, `tool`, `waiting-*`, `idle`), `activityAt`, per-session summary, and recorded data-flow links (delegate, result, peer message) drawn as real edges plus a cross-session traffic strip.
- agent-board web: acknowledge-able Needs attention (grouped, capped), transition-only notifications with digest, one leader tab and per-session mute, collapsed finished agents, per-session agent search, stable session list (hysteresis, ended sessions only under Ended).
- agent-board usage: window reset shown as "Reset" with absolute time and countdown, labelled dates, and detection of early/unscheduled usage resets from a persisted reading history (`resets` in `/usage.json`) with banner and badge.

### Changed (web board overhaul)

- agent-board health thresholds relaxed (approval 60s, silent 8m, long tool 30m, loop 6 of 10 non-polling calls); approval clears when the tool starts.

### Fixed (web board overhaul)

- agent-board: sessions no longer vanish on clock skew, torn reads, failed polls or T3 child dedupe flapping; standalone Codex scanner keeps resumed logs and no longer marks quiet work done.

### Added

- agent-board: always-on web board independently discovers recent standalone T3 Code Codex main threads (project, model, action, status, tokens), without Claude hooks; excludes CX runs and T3 delegated children using read-only state.

- agent-board: shows T3 Code `delegate_task` children (model, effort, status, result) by reading T3's local store read-only; the T3 thread title names the session and child threads nest under their parent.

- agent-board: usage header with Claude and Codex limits left (5-hour and weekly windows, reset countdowns) and the Codex subscription end date, served from `/usage.json`.
- agent-board: `server.py` (static files plus `/usage.json`, localhost only, Host-header check) and an optional systemd user unit to keep the web board running without a session.

### Changed

- agent-board: redesigned web board (hierarchy, tabular numerals, incremental DOM updates).

### Fixed

- agent-board: the hooks module failed to load in new sessions because the T3 scanner was an arrow function; mod loaders only follow `$` into imported function declarations.
- agent-board: silent sessions that were not working are shown as ended instead of "needs attention".

## [0.1.0] - 2026-10-24

### Added

- First public marketplace release with project-status, session-chat, agent-board, and prompt-router.
- Codex hand-off wrapper with session-owned task specs, results, and resumable threads.
- English and Persian documentation, MIT license, contribution and security guidance.
- CI checks, tag-release automation, and community templates.

### Changed

- Project discovery and sync prompts are configurable without a private wallboard.
- Codex model allowlist can be configured with `CX_MODELS`.

Marketplace release numbering is independent of individual plugin manifest versions.

[Unreleased]: https://github.com/66Hamidreza/claude-code-mods/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/66Hamidreza/claude-code-mods/releases/tag/v0.1.0
