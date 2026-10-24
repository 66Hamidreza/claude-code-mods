# Contributing

Keep changes focused and explain the observed problem and resulting behavior. Read applicable AGENTS.md instructions and task ownership before editing. Use synthetic examples; remove credentials, personal paths, and private project data from issues, fixtures, and logs.

Update English and Persian documentation together when behavior changes. Test logic changes with meaningful cases and manually exercise affected hooks in a compatible Claude Code host.

From the repository root:

```sh
python3 .github/scripts/test.py
bash -n tools/cx
shellcheck --severity=error tools/cx
claude plugin validate .
for mod in project-status session-chat agent-board prompt-router; do
  claude plugin validate "$mod"
  claude plugin test "$mod"
done
```

The portable test command needs Bun (CI pins 1.3.14) and Python 3. It copies the four mods to a temporary directory and replaces only test-kit imports with `bun:test`; the repository is unchanged. It also runs embedded Python scanner fixtures. This tests pure logic, not the host UI, permissions, event wiring, or delivery. Native suites import `claude-code/testing`; the inspected Claude Code 2.1.310 test runner exits without a file report in this environment. Report that separately from assertion failures.

Current baseline: two assertions fail in the portable run—session-chat refers to an old peer-name prefix (`wall` instead of its renamed fixture), and prompt-router expects Haiku for an `explain` sentence that its short-question rule does not recognize. CI deliberately reports these failures and releases remain blocked until resolved. Do not skip or weaken checks to make CI green.

CI additionally checks manifest JSON and release-note extraction. ShellCheck is run at error severity; run its default severity locally for broader suggestions when available. No root npm package is needed. For manual development, use `claude --plugin-dir ./<mod>`.

A pull request should state the problem, implementation, exact validation results, and material limitations. Review every delegated change before relying on it. Respect repository-specific Git restrictions; `cx` defaults to local commits and pushing requires maintainer review. Tag releases as `v<version>` only after adding that exact version to CHANGELOG.md; release automation rejects absent or empty entries and requires all suites to pass.

Report vulnerabilities through [private GitHub advisories](https://github.com/66Hamidreza/claude-code-mods/security/advisories/new). Follow the [Code of Conduct](CODE_OF_CONDUCT.md).

<div dir="rtl">

تغییر را محدود و قابل بررسی نگه دارید، مستندات فارسی و انگلیسی را هماهنگ کنید و فرمان‌ها و نتیجهٔ واقعی آزمون‌ها را گزارش دهید. اطلاعات محرمانه را حذف کنید و آسیب‌پذیری را خصوصی گزارش دهید. [راهنمای کامل مشارکت فارسی](docs/fa/contributing.md).

</div>
