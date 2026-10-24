# Security policy

Security fixes target the latest code and latest published release. Older releases have no separate maintenance commitment. No response-time guarantee is established.

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/66Hamidreza/claude-code-mods/security/advisories/new). If the form is unavailable, do not publish exploit details in an issue; wait for the maintainer to enable private reporting. Provide affected versions, impact, minimal reproduction, and redacted logs. Never include live credentials or private user data.

Mods run hooks with the user's permissions. They can read/write local files, spawn processes, send session messages, change model selection, and submit prompts. Review source and host compatibility before enabling them. Secret filters in prompt-router and cx are heuristics, not isolation or a complete data-loss prevention system. The assistant decides what a submitted sync phrase does.

Local registries, board snapshots, and Codex rollouts may contain paths, prompts, commands, or summaries. The board binds to 127.0.0.1 but its static server has no authentication. Keep local data private and avoid exposing the server. cx write runs can commit files; `-p` explicitly enables pull/rebase and push. Review generated changes and untrusted output before use.

<div dir="rtl">

هوک‌ها با مجوز کاربر اجرا می‌شوند و به فایل‌ها و اجرای فرایند دسترسی دارند. فیلترهای اطلاعات محرمانه قطعی نیستند. آسیب‌پذیری را از مسیر گزارش خصوصی GitHub بالا ارسال کنید؛ کلید، دادهٔ واقعی یا جزئیات سوءاستفاده را در issue عمومی نگذارید. پشتیبانی امنیتی روی آخرین کد و آخرین انتشار متمرکز است.

</div>
