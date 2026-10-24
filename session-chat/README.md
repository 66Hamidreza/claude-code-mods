# session-chat

```text
/plugin install session-chat --marketplace 66Hamidreza/claude-code-mods
```

Discovers other Claude Code sessions on the same machine and adds a compact inbox above the prompt. Sessions must load this mod and share the same home directory.

## Commands

| Command | Action |
| --- | --- |
| `/who` | Refresh and list peers. |
| `/msg <target> <text>` | Message an exact name, session-ID prefix, or unique name prefix. |
| `/all <text>` | Broadcast to discovered peers. |
| `/chat` | Toggle the band and reset the unread count. |
| `/chat name <name>` | Rename this session; spaces become hyphens. |

The model receives `mcp__session-chat__peers`, `mcp__session-chat__broadcast`, and a coordination note; messages can also use the host's SendMessage tool.

```text
/chat name parser
/who
/msg worker Please avoid editing parse.ts while I finish.
```

## Configuration and operation

There are no custom environment variables. `HOME` locates `~/.claude/mods-data/session-chat/peers`. The default name is the working folder plus the first four session-ID characters; an explicitly saved name is reused for that session. Heartbeats run every 10 seconds; records older than 45 seconds are excluded. Messages carry a `[chat:<sender>]` tag. The mod retains up to 100 messages and renders the latest three; session end marks its record inactive.

## Limits

This is local discovery, not a network chat server. Delivery depends on the host session API and active peers; the displayed list may lag. Peer files contain working directories and session IDs. Names should be short and contain no spaces or `]` so tags can round-trip. A command-name collision is reported without preventing registration of other commands.

[Installation and development](../README.md) · [راهنمای فارسی](../docs/fa/session-chat.md)
