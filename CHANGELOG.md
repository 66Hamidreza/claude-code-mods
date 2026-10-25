# Changelog

All notable changes are documented here using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- agent-board: shows T3 Code `delegate_task` children (model, effort, status, result) by reading T3's local store read-only; the T3 thread title names the session and child threads nest under their parent.

### Fixed

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
