# prompt-router

```text
/plugin install prompt-router --marketplace 66Hamidreza/claude-code-mods
```

Routes human prompts from the composer or Remote Control to a model using English/Persian rules, then a Haiku classifier when no rule matches. Slash commands, metadata, and peer prompts bypass routing. Enabled by default; the on/off preference persists.

## Commands and models

- `/route`: status, counts and recent Codex jobs; `/route on` and `/route off` toggle routing.
- Prefixes: `!haiku` / `!light`, `!sonnet`, `!opus`, `!fable` / `!max`, `!codex`, `!auto`. A prefix must be followed by whitespace and prompt text. `!auto` strips itself and uses normal routing.
- Fixed IDs in `hooks/route.ts`: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`. These are source configuration, not an availability guarantee. No model-ID environment variable is implemented.

```text
!sonnet Fix the parser error
!opus Review the architecture
/route off
```

## Configuration and operation

No custom environment variables. `HOME` locates data under `~/.claude/mods-data/{prompt-router,orchestration,codex-jobs}`. Codex dispatch uses `~/.local/bin/cx` if present, otherwise `cx` on PATH. Install [tools/cx](../tools/cx) and its dependencies; it requires `CLAUDE_CODE_SESSION_ID`. Its model allowlist is configured with `CX_MODELS`.

Continuations can keep the prior decision; mechanical work/tests prefer Codex, hard/security/architecture work prefers Opus, short questions prefer Haiku, and ordinary edits prefer Sonnet. Rules recognize Persian examples such as `ادامه بده`, `تست واحد بنویس`, `معماری` and `درست کن`; this is keyword matching, not general language understanding. After 30 messages, automatic downgrades are suppressed to preserve cache; forced prefixes can override that.

Independent parts (up to six) or work across targets receive orchestration advice. Dependent steps stay single. Single Codex tasks require a Git repository, are queued per repository within the session, and run in the background. The result appends the last 30 output lines to the conversation as untrusted data. Advice is also written for agent-board. Parallel advice is an instruction to the main assistant, not automatic enforcement.

## Limits

Secret-looking prompts stay on the standard Claude tier and are not sent to Codex; this heuristic is not a complete secret detector. The fallback classifier sends prompt text to the configured Claude model. Missing models and API errors can fall back; two consecutive empty replies mark a switched model unavailable. Router IDs and heuristics may need source changes for other accounts. `!codex` still observes secret checks and single-task/repository restrictions. cx commits locally by default: review before pushing.

[Installation and development](../README.md) · [راهنمای فارسی](../docs/fa/prompt-router.md)
