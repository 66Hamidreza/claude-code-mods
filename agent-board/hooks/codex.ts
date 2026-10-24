import type { EngineInterface } from 'claude-code'

import type { CodexInfo } from '../types'
import { CODEX_MARKER } from './board'

// Reads Codex rollout logs (one JSON event per line) and prints one summary per file.
// Response items (reasoning, raw tool calls) are skipped unparsed: they are most of the bytes.
export const SCANNER = String.raw`
import json, re, sys
out = []
for path in sys.argv[1:]:
    info = {"rollout": path, "threadId": "", "owner": "", "run": "", "cwd": "", "prompt": "", "tasks": [], "startedAt": 0, "commands": 0,
            "recentCommands": [], "files": [], "tokens": 0, "isComplete": False, "lastAction": None,
            "lastMessage": None, "summary": None, "originator": ""}
    files = []
    owner_conflict = False
    def user_message(content):
        global owner_conflict
        text = content if isinstance(content, str) else "\n".join(c.get("text", "") for c in content if isinstance(c, dict))
        marker = re.match(r"${CODEX_MARKER.source}", text)
        if marker:
            owner, run, tasks = marker.groups()
            if info["owner"] and info["owner"] != owner:
                owner_conflict = True
                return
            if not info["owner"]:
                info["prompt"] = text[:300]
            info["owner"], info["run"] = owner, run
            info["tasks"] = [] if tasks == "-" else tasks.split(",")
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for n, line in enumerate(f):
                head = line[:120]
                if n > 0 and (('"response_item"' in head and not re.search(r'"role"\s*:\s*"user"', line)) or '"world_state"' in head or '"turn_context"' in head or '"token_usage_record"' in head):
                    continue
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                p = o.get("payload") or {}
                kind = o.get("type")
                if kind == "session_meta":
                    info["threadId"] = p.get("id", "")
                    info["cwd"] = p.get("cwd", "")
                    info["originator"] = p.get("originator", "")
                    continue
                if kind == "response_item" and p.get("role") == "user":
                    user_message(p.get("content") or [])
                    continue
                if kind != "event_msg":
                    continue
                t = p.get("type")
                if t == "user_message":
                    user_message(p.get("content") or p.get("message") or "")
                elif t == "task_started":
                    info["isComplete"] = False
                    if not info["startedAt"]:
                        info["startedAt"] = int(p.get("started_at", 0)) * 1000
                elif t == "task_complete":
                    info["isComplete"] = True
                    info["summary"] = (p.get("last_agent_message") or "")[:400]
                elif t == "token_count":
                    usage = ((p.get("info") or {}).get("total_token_usage") or {})
                    info["tokens"] = usage.get("total_tokens", info["tokens"])
                elif t == "item_completed":
                    item = p.get("item") or {}
                    it = item.get("type")
                    if it in ("UserMessage", "user_message") or item.get("role") == "user":
                        user_message(item.get("content") or [])
                    elif it == "CommandExecution":
                        parsed = [c.get("cmd", "") for c in item.get("parsed_cmd") or [] if isinstance(c, dict)]
                        cmd = " && ".join(x for x in parsed if x) or " ".join((item.get("command") or [])[-1:])
                        cmd = " ".join(cmd.split())[:120]
                        info["commands"] += 1
                        info["recentCommands"] = (info["recentCommands"] + [cmd])[-8:]
                        info["lastAction"] = "run " + cmd
                    elif it == "FileChange":
                        for changed in (item.get("changes") or {}):
                            if changed not in files:
                                files.append(changed)
                            info["lastAction"] = "edit " + "/".join(changed.split("/")[-2:])
                    elif it == "AgentMessage":
                        text = " ".join(c.get("text", "") for c in item.get("content", []) if isinstance(c, dict))
                        info["lastMessage"] = " ".join(text.split())[:300]
                        info["lastAction"] = "says " + info["lastMessage"][:100]
    except OSError:
        continue
    info["files"] = files[-40:]
    if info["owner"] and info["run"] and not owner_conflict:
        out.append(info)
print(json.dumps(out))
`

type Scanned = Omit<CodexInfo, 'activityAt'> & { originator: string }

type Cached = { mtimeMs: number; size: number; info?: CodexInfo }

const cache = new Map<string, Cached>()

async function sortedDirs($: EngineInterface, path: string) {
  return (await $.fs.list(path).catch(() => []))
    .filter(entry => entry.kind === 'dir')
    .map(entry => `${path}/${entry.name}`)
    .sort()
}

// The newest two day folders of ~/.codex/sessions/YYYY/MM/DD.
async function dayDirs($: EngineInterface, root: string) {
  const years = (await sortedDirs($, root)).slice(-2)
  const months = (await Promise.all(years.map(year => sortedDirs($, year)))).flat().slice(-2)
  const days = (await Promise.all(months.map(month => sortedDirs($, month)))).flat()

  return days.slice(-2)
}

// Every Codex exec run whose log moved since `since`, read again only when its file changed.
export async function scanCodex($: EngineInterface, since: number): Promise<CodexInfo[]> {
  const root = `${(await $.env.get('HOME')) ?? ''}/.codex/sessions`
  const files = (
    await Promise.all(
      (await dayDirs($, root)).map(async dir =>
        (await $.fs.list(dir).catch(() => []))
          .filter(entry => entry.kind === 'file' && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl'))
          .map(entry => ({ path: `${dir}/${entry.name}`, mtimeMs: entry.mtimeMs, size: entry.size })),
      ),
    )
  )
    .flat()
    .filter(file => file.mtimeMs >= since)

  const changed = files.filter(file => {
    const known = cache.get(file.path)

    return !known || known.mtimeMs !== file.mtimeMs || known.size !== file.size
  })
  if (changed.length > 0) {
    const ran = await $.process
      .run(['python3', '-c', SCANNER, ...changed.map(file => file.path)], { timeoutMs: 20_000 })
      .catch(() => undefined)
    const scanned: Scanned[] = ran?.exitCode === 0 ? JSON.parse(ran.stdout) : []
    for (const file of changed) {
      const found = scanned.find(one => one.rollout === file.path)
      // Interactive Codex sessions are the person's own; the board follows exec runs.
      const info = found && found.originator !== 'codex_tui' ? { ...found, activityAt: file.mtimeMs } : undefined
      if (info) delete (info as Partial<Scanned>).originator
      cache.set(file.path, { mtimeMs: file.mtimeMs, size: file.size, info })
    }
  }

  return files.flatMap(file => cache.get(file.path)?.info ?? [])
}
