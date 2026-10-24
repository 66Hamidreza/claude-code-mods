<div dir="rtl">

# واگذاری کار با cx

ابزار tools/cx یک پوستهٔ Bash برای اجرای Codex در مخزن گیت جاری است. هر اجرا به یک نشست Claude تعلق دارد. از ابزار Bash در Claude Code استفاده کنید تا CLAUDE_CODE_SESSION_ID موجود باشد. Codex CLI باید نصب شده و ورود آن انجام شده باشد؛ Bash، گیت، Python 3، flock و ابزارهای معمول یونیکس نیز لازم‌اند.

## نصب و استفاده

از ریشهٔ مخزن، مسیر ابزار را در PATH قرار دهید؛ اگر پیوند از قبل موجود است ابتدا آن را بررسی کنید:

</div>

```sh
mkdir -p ~/.local/bin
ln -s "$PWD/tools/cx" ~/.local/bin/cx
cx -r "Review the parser without editing files"
```

<div dir="rtl">

| گزینه | معنا |
| --- | --- |
| `-r` | فقط‌خواندنی؛ بدون کامیت |
| `-n` | فقط کامیت محلی؛ پیش‌فرض |
| `-c "command"` | بررسی پس از اجرای موفق و پیش از کامیت |
| `-t a,b` | اجرای چند مشخصات کار در یک فراخوانی |
| `-s -t a` | ادامهٔ رشتهٔ قبلی؛ دقیقاً یک کار |
| `-m model` | انتخاب مدل از فهرست مجاز |
| `-e effort` | یکی از low، medium، high، xhigh، max |
| `-p` | pull/rebase و push پس از کامیت؛ ویژهٔ Claude پس از بازبینی |

CX_MODELS فهرست مجاز را با مقادیر جداشده با فاصله جایگزین می‌کند. پیش‌فرض:

</div>

```text
gpt-6.1-sol gpt-6-astra gpt-6-sol gpt-6-luna gpt-5.6-sol gpt-5.6-terra gpt-5.6-luna
```

<div dir="rtl">

این فهرست فقط اعتبارسنجی نام است و دسترسی واقعی به مدل‌ها را تضمین نمی‌کند.

## قرارداد .collab

مسیر پایه `.collab/$CLAUDE_CODE_SESSION_ID` است. برای هر کار در tasks یک فایل Markdown بسازید. نام کار فقط حرف و عدد لاتین، زیرخط و خط تیره می‌پذیرد. مشخصات باید مستقل، روشن و شامل هدف، فایل‌های مجاز، محدودیت‌ها و فرمان بررسی باشد:

</div>

```sh
mkdir -p ".collab/$CLAUDE_CODE_SESSION_ID/tasks"
cat > ".collab/$CLAUDE_CODE_SESSION_ID/tasks/parser.md" <<'SPEC'
# Goal
Add parser tests.
# Owns
project-status/hooks/parse.test.ts
# Constraints
Do not run git. Do not include secrets.
# Acceptance
Run the parser tests and report the command and result.
SPEC
cx -c 'python3 .github/scripts/test.py' -t parser
```

<div dir="rtl">

فرمان بالا کل مجموعهٔ آزمون‌ها را اجرا می‌کند و هر شکست موجود نیز جلوی کامیت را می‌گیرد. برای کار واقعی، فرمان بررسی متناسب با محدوده انتخاب کنید.

نتیجه در results/parser.md با حداکثر ۱۵ خط و عنوان‌های Changed / Files / Assumptions / Blockers / Check result نوشته می‌شود. رشته در threads/parser.id و مشخصات اجرا در runs/<run>/manifest.json ثبت می‌شود. نشانگر CX_RUN_V1 مالک، اجرا و نام کارها را برای ابزارهای دیگر مشخص می‌کند. در حالت فقط‌خواندنی، پاسخ نهایی جای نوشتن نتیجه را می‌گیرد و wrapper خروجی را ذخیره می‌کند؛ برای چند کار نام فایل خروجی ترکیب نام‌ها است.

## روش کار و محدودیت‌ها

اجرای نوشتنی با قفل مخزن هماهنگ می‌شود. wrapper وضعیت فایل‌های کثیف را پیش و پس از کار مقایسه می‌کند تا فایل‌های تغییرکردهٔ همان اجرا را محلی کامیت کند؛ این جداسازی در سطح فایل است، نه تکه‌های تغییر. شکست Codex یا فرمان بررسی جلوی کامیت را می‌گیرد و تغییرات جزئی ممکن است در پوشهٔ کاری بمانند.

بررسی نام فایل و الگوهای اعتبارنامه صرفاً ابتکاری است. اطلاعات محرمانه، فایل محیط، کلید و دامپ را در پرامپت یا مشخصات نگذارید. پوشهٔ .collab از ردیابی کنار گذاشته می‌شود. خروجی، کامیت و آزمون‌ها را بازبینی کنید؛ -p فقط پس از بازبینی و با اختیار روشن استفاده شود. اجرای فقط‌خواندنی قفل نوشتن را نمی‌گیرد و نوشتن فایل‌های ثبت اجرای خود wrapper همچنان ممکن است.

[بازگشت](index.md) · [مشارکت](contributing.md)

</div>
