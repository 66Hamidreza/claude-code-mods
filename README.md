# Claude Code Mods

[![CI](https://github.com/66Hamidreza/claude-code-mods/actions/workflows/ci.yml/badge.svg)](https://github.com/66Hamidreza/claude-code-mods/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/66Hamidreza/claude-code-mods)](https://github.com/66Hamidreza/claude-code-mods/releases)

A public marketplace of Claude Code function-hook plugins. Each mod can be installed independently.

| Mod | Purpose |
| --- | --- |
| [project-status](project-status/README.md) | Task progress, next task, Git state, and configurable sync prompts across projects. |
| [session-chat](session-chat/README.md) | Discover and message other local Claude Code sessions. |
| [agent-board](agent-board/README.md) | Observe agents, T3 delegated tasks and Codex jobs in a terminal pane or local web board, with Claude/Codex usage left. |
| [prompt-router](prompt-router/README.md) | Route prompts by rules and classification; advise on parallel work. |
| [t3-routing](t3-routing/README.md) | Policy (a `CLAUDE.md` snippet, not a plugin) for T3 Code users: triage, per-task model routing through `delegate_task`, and a rare council. |

## T3 Code routing policy

If you run Claude Code inside [T3 Code](https://t3.codes), [t3-routing](t3-routing/README.md) gives the main thread a routing policy instead of a plugin: paste one snippet into your `CLAUDE.md` and the model will

- read the live model catalog at session start (no hardcoded model IDs),
- do small or context-bound work inline and delegate everything else as one coherent `delegate_task` child (at most two at once, no nested delegation),
- pick the model and effort per task from a table, starting cheap and escalating only on a failed check,
- convene a rare, read-only council for architecture, security or irreversible decisions,
- keep pushes, secrets and production infrastructure on the main thread.

It complements `prompt-router`: that mod routes each prompt, this policy routes each task. Start with the [snippet](t3-routing/CLAUDE-snippet.md); decisions and their reasons are recorded in the [routing log](t3-routing/LOG.md).

## Install

In Claude Code's terminal prompt:

```text
/plugin marketplace add 66Hamidreza/claude-code-mods
/plugin install project-status@claude-code-mods
/plugin install session-chat@claude-code-mods
/plugin install agent-board@claude-code-mods
/plugin install prompt-router@claude-code-mods
```

From a shell:

```sh
claude plugin install project-status --marketplace 66Hamidreza/claude-code-mods
```

In the desktop app, open **+ → Plugins → Add marketplace**, enter `66Hamidreza/claude-code-mods`, and add the desired plugins. Labels may vary by app version; the terminal commands are an alternative.

## Requirements

Use a Claude Code build supporting function-hook modules (`hooks/hooks.json`), the `claude-code` engine API, and `claude-code/testing`. The local CLI inspected for this repository reports 2.1.310; a minimum supported version has not been established. Installation alone does not verify runtime API compatibility.

Git is needed for project status and Codex hand-offs. Python 3 supports agent-board's web server, usage endpoint and Codex log scanner. `tools/cx` additionally needs Bash, `flock`, standard Unix utilities, and an installed, authenticated Codex CLI. Router model IDs are fixed in [route.ts](prompt-router/hooks/route.ts); availability depends on your account. Hooks run with your user permissions.

## Development

From the repository root:

```sh
claude --plugin-dir ./project-status
claude plugin validate .
claude plugin validate project-status
claude plugin test project-status
# Repeat validate/test for session-chat, agent-board, and prompt-router.
# Portable pure-logic suites, including Python scanner fixtures (Bun + Python 3):
python3 .github/scripts/test.py
bash -n tools/cx
shellcheck --severity=error tools/cx
```

The portable runner copies sources to a temporary directory and maps `claude-code/testing` imports to `bun:test`. It does not exercise the host UI or hook integration. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and current limitations.

## Codex hand-offs: tools/cx

Expose the wrapper on your PATH, then invoke it from Claude Code's Bash tool (which supplies `CLAUDE_CODE_SESSION_ID`):

```sh
mkdir -p ~/.local/bin
ln -s "$PWD/tools/cx" ~/.local/bin/cx
cx -r "Review the parser without editing files"
cx -c 'python3 .github/scripts/test.py' -t parser,tests
```

For named tasks, write specs in `.collab/$CLAUDE_CODE_SESSION_ID/tasks/<name>.md`; results go in `results/<name>.md` with at most 15 lines (Changed / Files / Assumptions / Blockers / Check result). `-s -t name` resumes a task. `-m` selects an allowed model, `-e` selects effort; `CX_MODELS` overrides the space-separated allowlist. Its default is `gpt-6.1-sol gpt-6-astra gpt-6-sol gpt-6-luna gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna`.

Write runs commit changed files locally after optional checks; review the result before pushing. `-n` is the default, `-r` avoids commits, and `-p` explicitly enables pull/rebase and push and is intended only for Claude after review. Secret-pattern checks are heuristic. Never put secrets in prompts or specs. See [the Persian cx guide](docs/fa/cx.md).

## Credits and contributors

Built with Claude (Anthropic) and OpenAI Codex as AI coding collaborators. The maintainer reviews and owns final decisions.

| Contributor | Role |
| --- | --- |
| [66Hamidreza](https://github.com/66Hamidreza) | Maintainer |
| Claude (Anthropic) | AI coding collaborator |
| OpenAI Codex | AI coding collaborator |

[MIT license](LICENSE) · [Changelog](CHANGELOG.md) · [Security](SECURITY.md) · [Persian guides](docs/fa/index.md)

## فارسی

<div dir="rtl">

بازار عمومی افزونه‌های تابع‌محور Claude Code؛ هر افزونه را می‌توان جداگانه نصب کرد.

| افزونه | کاربرد |
| --- | --- |
| [project-status](docs/fa/project-status.md) | پیشرفت کارها، کار بعدی، وضعیت گیت و ارسال عبارت همگام‌سازی قابل تنظیم |
| [session-chat](docs/fa/session-chat.md) | پیدا کردن و پیام دادن به نشست‌های محلی Claude Code |
| [agent-board](docs/fa/agent-board.md) | نمایش عامل‌ها و کارهای Codex در پنل ترمینال یا داشبورد محلی |
| [prompt-router](docs/fa/prompt-router.md) | انتخاب مدل با قواعد و دسته‌بندی؛ پیشنهاد اجرای موازی |
| [t3-routing](docs/fa/t3-routing.md) | سیاست مسیریابی مدل برای کاربران T3 Code (قطعهٔ `CLAUDE.md`، نه افزونه) |

### سیاست مسیریابی T3 Code

اگر Claude Code را داخل [T3 Code](https://t3.codes) اجرا می‌کنید، [t3-routing](docs/fa/t3-routing.md) یک سیاست مسیریابی است نه افزونه: یک قطعه را در `CLAUDE.md` می‌گذارید و مدل در شروع نشست فهرست زندهٔ مدل‌ها را می‌خواند، کار کوچک را خودش انجام می‌دهد، بقیه را با `delegate_task` به مدل مناسب می‌سپارد (از ردیف ارزان شروع و فقط با شکست بررسی بالا می‌رود)، برای تصمیم‌های معماری و امنیتی یک council کم‌یاب تشکیل می‌دهد و push، رمزها و زیرساخت production را در thread اصلی نگه می‌دارد. مکمل prompt-router است: آن هر پرامپت را مسیریابی می‌کند و این هر کار را.

### نصب

دستورهای نصب بخش انگلیسی را در ترمینال Claude Code اجرا کنید؛ شناسهٔ بازار `66Hamidreza/claude-code-mods` است. برای نصب از پوسته نیز از دستور `claude plugin install` بالا استفاده کنید. در برنامهٔ دسکتاپ، از مسیر +، افزونه‌ها و افزودن بازار، همین شناسه را وارد کنید؛ نام گزینه‌ها ممکن است با نسخهٔ برنامه فرق کند.

### پیش‌نیازها

نسخهٔ Claude Code باید ماژول‌های function-hook، رابط `claude-code` و کیت آزمون `claude-code/testing` را پشتیبانی کند. نسخهٔ محلی بررسی‌شده 2.1.310 است و حداقل نسخهٔ سازگار هنوز تعیین نشده است. نصب موفق به‌تنهایی سازگاری اجرا را تضمین نمی‌کند. وضعیت پروژه و واگذاری به Codex به گیت نیاز دارند؛ داشبورد و خواندن لاگ‌ها به Python 3. ابزار cx به Bash، ابزار flock، ابزارهای معمول یونیکس و Codex نصب‌شده با ورود معتبر نیاز دارد. شناسه‌های مدل در کد ثابت‌اند و دسترسی به حساب شما بستگی دارد. هوک‌ها با مجوزهای کاربر اجرا می‌شوند.

### توسعه

از ریشهٔ مخزن، دستورهای بخش Development را اجرا کنید: بارگذاری با `claude --plugin-dir`، اعتبارسنجی و آزمون هر چهار افزونه. اجرای مستقل آزمون‌های منطق با Bun و Python 3 از طریق `python3 .github/scripts/test.py` انجام می‌شود؛ فایل‌ها در پوشهٔ موقت کپی و کیت آزمون جایگزین می‌شود. این روش رابط کاربری و اتصال واقعی هوک‌ها را نمی‌آزماید. بررسی پوسته با `bash -n tools/cx` و ShellCheck انجام می‌شود. جزئیات و محدودیت‌های فعلی در [راهنمای مشارکت](CONTRIBUTING.md) آمده است.

### واگذاری به Codex

با دستورهای بخش tools/cx، ابزار را در PATH قرار دهید و از Bash در Claude Code فراخوانی کنید تا شناسهٔ نشست در محیط موجود باشد. مشخصات کارها در مسیر `.collab/$CLAUDE_CODE_SESSION_ID/tasks/<name>.md` و نتیجهٔ حداکثر ۱۵خطی در `results/<name>.md` قرار می‌گیرد. گزینهٔ `-s -t name` ادامهٔ کار، `-m` انتخاب مدل و `-e` میزان استدلال است. متغیر `CX_MODELS` فهرست مجاز مدل‌ها را با مقادیر جداشده با فاصله جایگزین می‌کند؛ مقدار پیش‌فرض همان فهرست بخش انگلیسی است.

حالت نوشتن پس از بررسی اختیاری، تغییرات را محلی کامیت می‌کند؛ پیش از پوش بازبینی کنید. `-n` پیش‌فرض است، `-r` حالت فقط‌خواندنی و `-p` فعال‌کنندهٔ صریح pull/rebase و push برای استفادهٔ Claude پس از بازبینی است. تشخیص اطلاعات محرمانه قطعی نیست؛ آن‌ها را وارد مشخصات یا پرامپت نکنید. [راهنمای کامل cx](docs/fa/cx.md).

### سازندگان و مشارکت‌کنندگان

این پروژه با همکاری کدنویسی هوش مصنوعی Claude از Anthropic و OpenAI Codex ساخته شده است. نگه‌دارنده مسئول بازبینی و تصمیم نهایی است.

| مشارکت‌کننده | نقش |
| --- | --- |
| [66Hamidreza](https://github.com/66Hamidreza) | نگه‌دارنده |
| Claude (Anthropic) | همکار کدنویسی هوش مصنوعی |
| OpenAI Codex | همکار کدنویسی هوش مصنوعی |

[مجوز MIT](LICENSE) · [تغییرات](CHANGELOG.md) · [امنیت](SECURITY.md) · [راهنماهای فارسی](docs/fa/index.md)

</div>
