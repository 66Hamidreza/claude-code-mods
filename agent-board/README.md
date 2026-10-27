# agent-board

```text
/plugin install agent-board --marketplace 66Hamidreza/claude-code-mods
```

Observes the main session, subagents, workflow agents, Codex exec runs, and standalone Codex main threads and their delegated children driven by T3 Code. Shows model, current tool, recent calls, errors, tokens, duration, and heuristic health indicators in a terminal pane and a local web board.

![agent-board web dashboard with sample data](../docs/images/agent-board.png)

## Commands

- `/board`: open the pane.
- `/board web`: start the board at `http://localhost:7788/` for all local sessions (static fallback server, no usage header; see Always-on web board).
- `/board notify on` / `/board notify off`: persist the native-notification preference; toasts remain enabled.
- `/board clear`: remove finished non-main nodes and clear event history.

The pane also offers controls for finished agents and history. The web board supports filtering, search, pinning and collapse, with browser-local preferences and opt-in browser alerts.

## Configuration and operation

No custom environment variables; `HOME` locates `~/.claude/mods-data/agent-board/web` and `~/.codex/sessions`. Polls agent state every second and writes session snapshots for the web board. Inside T3 Code, delegated children are read from `~/.t3/userdata/statev2.sqlite` (read-only, matched to the session by its provider thread id). Python 3 reads recent Codex rollout logs and serves static files bound to `127.0.0.1:7788`. Explicit `CX_RUN_V1` owner/run markers attribute delegated jobs; interactive Codex TUI sessions are excluded. The always-on server independently scans T3 Code Codex main rollouts and attaches their app-owned delegated children, including Claude children, from T3's projections. CX-marked runs are excluded; child native IDs are excluded as separate mains. Orchestration advice from prompt-router is compared with observed execution.

## Usage header

The top of the web page shows how much of the Claude and Codex limits is left (5-hour and weekly windows, reset countdowns) and the Codex subscription end date. `server.py` computes it on request from local files only: Claude from the `rate_limit_event` entries T3 Code logs under `~/.t3/userdata/logs/provider`, Codex from the newest rollout in `~/.codex/sessions`, and the plan dates from the Codex ID-token claims. No token is returned. Claude's renewal date is not stored locally and shows as unavailable; Claude data refreshes only while a T3 session is active, and the card shows when it was last updated.

## Always-on web board

Optional: serve the board without any session open. Copy `agent-board-web.service` to `~/.config/systemd/user/` (it runs `server.py`; adjust the path to where the mod is installed), then `systemctl --user enable --now agent-board-web`. It serves the static files plus `/usage.json` (Claude and Codex limits left, read from T3's provider logs, Codex rollouts and the Codex plan dates; Claude's renewal date is not stored locally). The `/board web` fallback server has no `/usage.json`. Claude session data comes from snapshots live sessions write. Standalone T3 Code Codex rows and their delegated children are discovered independently via `/codex-sessions.json`, so they appear without any Claude session or mod hook running. The server serves the installed `hooks/web.ts` page directly. The scanner checks all day directories for rollouts modified within two hours, caches unchanged files, and shows project, model, last action and token totals. `task_complete` (or an aborted turn) marks the main done; `task_started` resumes running, with five minutes of log silence treated as idle. Running or waiting children keep the session active after its main finishes. T3 mappings, child status, model, effort and approval/input waits are read-only and refreshed each scan, even if rollouts have not changed. Child activity uses stored timestamps, not poll time. Child nodes do not require child rollouts; their command and token counts are unavailable and remain zero. The T3 thread identity lets the web board deduplicate matching hook-driven child sessions; multiple main rollouts for one T3 thread produce one standalone row. If an existing T3 database cannot be queried, the scanner retains its last good result (or returns no rows before its first successful scan) until it recovers. Install `server.py` and `hooks/codex_standalone.py` alongside the updated `hooks/web.ts`, then restart the service. Terminal panes continue to show hook-driven sessions and children. `/board web` copes with the port already being served.

در حالت همیشه‌فعال، فرزندان واگذارشدهٔ T3 (Codex یا Claude) از پایگاه دادهٔ فقط‌خواندنی زیر نشست اصلی Codex نمایش داده می‌شوند و به هوک یا لاگ مستقل فرزند نیاز ندارند. لاگ فرزند به‌عنوان نشست اصلی جداگانه نمایش داده نمی‌شود. وضعیت، مدل، سطح تلاش و انتظار تأیید یا ورودی در هر اسکن تازه می‌شوند؛ تعداد فرمان و توکن فرزند در این مسیر در دسترس نیست و صفر می‌ماند. پس از پایان نشست اصلی، فرزند فعال نشست را باز نگه می‌دارد. اسکنر همهٔ پوشه‌های روزانه را برای لاگ‌های تغییرکرده در دو ساعت اخیر بررسی می‌کند و پنج دقیقه سکوت را بیکار محسوب می‌کند. اگر پایگاه موجود قابل خواندن نباشد، آخرین نتیجهٔ معتبر حفظ می‌شود؛ پیش از نخستین اسکن موفق، خروجی خالی است.

## Web board behavior

Sessions are served from `/sessions.json` (written atomically; a heartbeat keeps live sessions from vanishing). The list stays stable: rows are not reordered by timestamp churn, severity changes are debounced, and a session missing from a poll is kept briefly before it is dropped. Ended sessions are hidden from All, Needs attention, Running and Codex; they appear only under the Ended filter (pinned sessions always stay). Browser alerts fire on state transitions only. Real delegate/result/peer-message links are drawn between agents and sessions. Within each agent tree, the main stays first and siblings appear newest-created first, with descendants kept under their parent. Usage cards show each window’s observation time. Readings older than 30 minutes or past their scheduled reset show current usage as unknown, retaining the last observed usage; a passed deadline never implies 100% remaining. Codex uses the latest timestamped usage event across recent rollouts, rather than the most recently modified file. Reset history uses provider observation times and ignores older or repeated observations. Early resets require an observed usage drop of at least 10 percentage points or more than half; clock changes alone do not confirm a reset. Confirmed resets have a badge, dismissible banner and per-window history. Older poll-time histories are discarded when the new observation-based history starts; the Codex card also shows available rate-limit reset credits (read-only fetch every five minutes).

در هر درخت، عامل اصلی اول می‌ماند و فرزندان هر والد از جدیدترین زمان ایجاد مرتب می‌شوند؛ فرزندان تو‌در‌تو زیر والد خود باقی می‌مانند. برای هر پنجرهٔ مصرف، زمان مشاهده نمایش داده می‌شود. پس از ۳۰ دقیقه یا گذشت زمان بازنشانی برنامه‌ریزی‌شده، مصرف فعلی نامشخص است و فقط آخرین مصرف مشاهده‌شده حفظ می‌شود؛ عبور از موعد به معنی باقی‌ماندن ۱۰۰٪ نیست. Codex تازه‌ترین رویداد زمان‌دار مصرف را در لاگ‌های اخیر انتخاب می‌کند، نه فایل با تازه‌ترین زمان تغییر. تاریخچه از زمان واقعی مشاهده استفاده می‌کند و دادهٔ قدیمی یا تکراری را نادیده می‌گیرد. بازنشانی زودهنگام به کاهش مشاهده‌شدهٔ حداقل ۱۰ واحد درصد یا بیش از نصف نیاز دارد؛ تغییر ساعت بازنشانی به‌تنهایی کافی نیست. تاریخچهٔ قدیمی مبتنی بر زمان نظرسنجی با شروع تاریخچهٔ جدید کنار گذاشته می‌شود.

For a friendlier local name, add `127.0.0.1 abd` to your hosts file (on WSL with a Windows browser: `C:\Windows\System32\drivers\etc\hosts`, as administrator) and open `http://abd:7788/`. The server accepts only `localhost`, `127.0.0.1` and `abd` as `Host` values.

## Limits

Health flags are heuristics (repeated calls, repeated failures, inactivity), not proof of failure. Quiet or long-running work may be flagged. Codex parsing depends on rollout formats and scans recent day folders. The fixed port must be available; another server may already own it. Automatic browser opening tries `cmd.exe`; on other systems open the URL manually. Desktop notifications depend on host/OS support. Snapshots and logs can include command text, paths, and summaries; the local server has no authentication and exposes files in its web directory to local clients.

[Installation and development](../README.md) · [راهنمای فارسی](../docs/fa/agent-board.md)
