# project-status

```text
/plugin install project-status --marketplace 66Hamidreza/claude-code-mods
```

Shows one row per project above the prompt: task progress, first unfinished task and phase, dirty-file count, and commits ahead of the upstream. `/projects` toggles the band; it starts hidden.

## Commands and configuration

- `/projects`: show or hide; showing also refreshes.
- The **sync** button (or the displayed 1–9 hotkey after focusing the band) submits a user prompt. It does not implement a sync workflow itself.
- `CLAUDE_MODS_SYNC_PHRASE`: prompt text, default `sync`. For another project the message is `<phrase> — only project <name> (<dir>)`.
- `CLAUDE_MODS_PROJECTS_DIR`: project parent folder, default `~/projects`.
- `CLAUDE_MODS_PROJECTS_FILE`: optional JSON registry; unset means no registry is read. Paths support leading `~/`.

Example registry (directories are relative to the project parent):

```json
[{"id":"demo","name":"Demo","dir":"demo"}]
```

Example environment before starting Claude:

```sh
export CLAUDE_MODS_PROJECTS_DIR=~/projects
export CLAUDE_MODS_SYNC_PHRASE='Update project status'
```

## How it works and limits

Adds immediate child folders containing `STATUS.md` to registry entries. Reads checkbox items only under the exact `## Tasks` section; `###` headings identify phases. Refreshes at session start, after turns, every 60 seconds, and when shown. The current project appears first. Git queries have a 10-second timeout; unavailable Git/upstream data displays as zero. Discovery is not recursive. Registry entries are trusted input, expected to be an array of `{id,name,dir}` objects. A missing/unreadable registry is ignored. The assistant determines what the submitted phrase does.

```markdown
## Tasks
### Build
- [x] Read requirements
- [ ] Implement parser
```

[Installation and development](../README.md) · [راهنمای فارسی](../docs/fa/project-status.md)
