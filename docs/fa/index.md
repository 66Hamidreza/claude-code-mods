<div dir="rtl">

# راهنمای فارسی Claude Code Mods

این مخزن یک بازار عمومی از چهار افزونهٔ تابع‌محور Claude Code است. هر افزونه را مستقل نصب کنید.

| افزونه | کاربرد |
| --- | --- |
| [project-status](project-status.md) | پیشرفت پروژه‌ها از STATUS.md و وضعیت گیت |
| [session-chat](session-chat.md) | پیام‌رسانی میان نشست‌های محلی |
| [agent-board](agent-board.md) | مشاهدهٔ عامل‌ها و کارهای Codex در ترمینال و مرورگر |
| [prompt-router](prompt-router.md) | انتخاب مدل و پیشنهاد اجرای موازی |

## نصب

در ورودی ترمینال Claude Code اجرا کنید:

</div>

```text
/plugin marketplace add 66Hamidreza/claude-code-mods
/plugin install project-status@claude-code-mods
/plugin install session-chat@claude-code-mods
/plugin install agent-board@claude-code-mods
/plugin install prompt-router@claude-code-mods
```

<div dir="rtl">

از پوسته نیز می‌توانید یک افزونه را مستقیم نصب کنید:

</div>

```sh
claude plugin install project-status --marketplace 66Hamidreza/claude-code-mods
```

<div dir="rtl">

در برنامهٔ دسکتاپ از + کنار ورودی، بخش افزونه‌ها و افزودن بازار استفاده کنید و شناسهٔ بالا را بدهید. نام گزینه‌ها به نسخهٔ برنامه بستگی دارد؛ روش ترمینال نیز در دسترس است.

## پیش‌نیازها

Claude Code باید ماژول‌های function-hook در hooks/hooks.json، رابط claude-code و کیت claude-code/testing را پشتیبانی کند. نسخهٔ محلی بررسی‌شده 2.1.310 است؛ حداقل نسخهٔ سازگار مشخص نشده است. نصب موفق، سازگاری اجرای هوک‌ها را تضمین نمی‌کند.

گیت برای وضعیت پروژه و واگذاری به Codex لازم است. Python 3 برای سرور محلی داشبورد و خواندن لاگ Codex به کار می‌رود. [ابزار cx](cx.md) به Bash، flock، ابزارهای معمول یونیکس و Codex CLI با ورود معتبر نیاز دارد. آزمون مستقل منطق به Bun و Python 3 نیاز دارد. شناسه‌های مدل در کد ثابت‌اند و دسترسی به آن‌ها به حساب شما بستگی دارد.

هوک‌ها با مجوزهای کاربر اجرا می‌شوند. پیش از نصب، کد و [راهنمای امنیت](../../SECURITY.md) را بررسی کنید.

[پرسش‌های رایج](faq.md) · [مشارکت](contributing.md) · [صفحهٔ اصلی](../../README.md)

</div>
