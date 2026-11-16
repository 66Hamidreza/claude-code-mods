# claude-code-mods — HANDOFF (read first)

> Written 2026-11-08. **This repo is PUBLIC** (MIT) — no private names/hosts/secrets. Local `STATUS.md` is git-excluded by design.

## What it is
A marketplace of Claude Code function-hook plugins ("mods"), each installable alone: `project-status` (per-project task progress band), `session-chat` (sessions find/message each other), `agent-board` (live view of agents/subagents/Codex runs + usage; terminal pane and local web board), `prompt-router` (picks model per prompt; bulk work to Codex via `cx`), `t3-routing` (a CLAUDE.md policy snippet for T3 Code users). Plus `tools/` (the `cx` Codex wrapper). CI + release v0.1.0 + branch protection; Dependabot PRs for action bumps exist (not merged).

## Relation to the private repo
The mods are *developed* in a private working copy (see the owner's workspace index) and this public repo is the cleaned export. When both change, sync agent-board etc. by hand (latest sync: "agent-board mission-control redesign", 2026-11-03).

## State
Latest work (2026-11-03): agent-board web board redesign (glass/space theme, per-agent units, usage cards with reset detection). Tests: 43 pass for the web board; full hook suite blocked by existing `claude-code/testing` imports. Local always-on web board runs as user service `agent-board-web` (127.0.0.1:7788).
Open: Windows hosts entry `127.0.0.1 abd` for the pretty URL (needs admin), merge Dependabot PRs, verify the redesign in a real browser.

Update 2026-11-16: v0.5.0 released (agent-board usage strip, reset credits, Windows T3 sessions; t3-routing revision). t3-routing was revised from 138 logged delegations: bulk parts of a mixed task get their own fast-tier child, cross-family review only for security/data/auth/migrations, Fallback column defined, main thread stays a workhorse at medium effort. The owner's live policy files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) are the source of truth and now match `t3-routing/CLAUDE-snippet.md`; any policy change goes to all three plus `t3-routing/LOG.md` and `docs/fa/t3-routing.md`. Open: re-count fast-tier share and Claude share after ~100 more delegations.

## Not in git
`STATUS.md`, `.collab/`, `.playwright-mcp/` (now ignored), `~/.claude/mods-data/` runtime data.

## فارسی
بازار افزونه‌های Claude Code. این ریپو عمومی است؛ نسخهٔ خصوصی `claude-mods` است که در `~/.claude/mods` زندگی می‌کند. چیزی محرمانه در این ریپو نگذارید.

## 2026-11-17 — v0.5.1
Fix Windows T3 child usage ingestion, stale quota presentation and renewal wording. Missing usage is distinct from observed zero; provider context and cumulative log totals retain different meanings. Run `.github/scripts/test.py` plus Python unittest discovery in `agent-board` and `agent-board/hooks`. Restart the local web service after installation. Browser visual validation remains open.

Release validation: 93 Bun tests and 51 Python tests passed; shell syntax, release-note extraction and whitespace checks passed.
