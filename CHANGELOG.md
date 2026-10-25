# Changelog

All notable changes are documented here using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
