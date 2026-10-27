# t3-routing

A routing policy for people who run Claude Code inside [T3 Code](https://t3.codes): the main thread stays cheap, and real work goes to the right model through `delegate_task`. It is a policy, not a plugin: you paste it into your `CLAUDE.md`, and the model follows it.

[prompt-router](../prompt-router/README.md) routes each prompt to a model by rules. t3-routing instead decides, per task, whether to work inline, delegate to one child, or convene a council, using the model list T3 reports. They can be used together.

## Install

1. Open `~/.claude/CLAUDE.md` (or a project `CLAUDE.md`).
2. Append the contents of [CLAUDE-snippet.md](CLAUDE-snippet.md).
3. Edit the routing table: replace the tier names with the models `orchestrator_capabilities` lists for your account, and fill in your excluded models.

It only takes effect where T3 tools (`delegate_task`, `orchestrator_capabilities`) exist.

## How it works

- **Session start:** read the live model catalog first; never hardcode IDs.
- **Triage:** small or context-bound work stays inline; otherwise one delegated child, at most two at once, no nested delegation.
- **Routing table:** start with the cheap tier and escalate only on a failed check or real ambiguity.
- **Council:** rare, read-only, one round, for architecture, security, irreversible changes or a root cause still unknown after one failed fix.
- **Rules:** pushes happen only from the main thread after review and tests; secrets and prod infrastructure are never delegated.

## Improving it

Changes and the evidence behind them are recorded in [LOG.md](LOG.md). To change the policy, edit `CLAUDE-snippet.md`, add a dated LOG entry with the reason (what failed or cost too much), and note it in `CHANGELOG.md`.

Persian guide: [docs/fa/t3-routing.md](../docs/fa/t3-routing.md)
