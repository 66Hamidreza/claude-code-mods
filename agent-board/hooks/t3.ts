import type { EngineInterface } from 'claude-code'

import type { AgentNode, NodeStatus, T3Info } from '../types'

// T3 Code keeps its delegated children (delegate_task) in its own SQLite store, not in Claude hooks or Codex rollouts.
// Read-only, one JSON object out: this session's thread, its delegated children, and anything waiting on the person.
export const T3_SCANNER = String.raw`
import json, os, sqlite3, sys
sid = sys.argv[1]
path = os.path.join(os.environ.get("HOME", ""), ".t3", "userdata", "statev2.sqlite")
if not os.path.exists(path):
    print("null"); sys.exit(0)
c = sqlite3.connect("file:" + path + "?mode=ro", uri=True, timeout=2)
def one(sql, *a):
    return c.execute(sql, a).fetchone()
def js(text):
    try:
        return json.loads(text) if text else {}
    except Exception:
        return {}
row = one("select thread_id from orchestration_v2_projection_provider_threads where json_extract(payload_json, '$.nativeThreadRef.nativeId') = ? order by updated_at desc limit 1", sid)
if not row:
    print("null"); sys.exit(0)
tid = row[0]
t = one("select title, payload_json from orchestration_v2_projection_threads where thread_id = ?", tid)
if not t:
    print("null"); sys.exit(0)
payload = js(t[1])
out = {"threadId": tid, "title": t[0], "parentThreadId": (payload.get("lineage") or {}).get("parentThreadId"), "children": [], "pending": 0}
def pending(thread):
    r = one("select pending_approval_count + pending_user_input_count from projection_threads where thread_id = ?", thread)
    return int(r[0] or 0) if r else 0
out["pending"] = pending(tid)
for sub_id, sub_payload in c.execute("select subagent_id, payload_json from orchestration_v2_projection_subagents where thread_id = ? and origin = 'app_owned' order by started_at", (tid,)):
    p = js(sub_payload)
    child = p.get("childThreadId")
    effort = None
    activity = 0
    waiting = 0
    if child:
        ct = one("select payload_json from orchestration_v2_projection_threads where thread_id = ?", child)
        for opt in (js(ct[0]).get("modelSelection") or {}).get("options") or [] if ct else []:
            if opt.get("id") in ("effort", "reasoningEffort"):
                effort = str(opt.get("value"))
        last = one("select max(updated_at) from orchestration_v2_projection_turn_items where thread_id = ?", child)
        activity = last[0] if last and last[0] else None
        waiting = pending(child)
    out["children"].append({
        "id": sub_id, "title": p.get("title") or "", "driver": p.get("driver") or "", "model": p.get("model") or "",
        "effort": effort, "status": p.get("status") or "", "startedAt": p.get("startedAt"), "completedAt": p.get("completedAt"),
        "activityAt": activity, "result": (p.get("result") or "")[:300], "waiting": waiting,
    })
print(json.dumps(out))
`

export type T3Scan = {
  threadId: string
  title: string
  parentThreadId?: string | null
  pending: number
  children: {
    id: string
    title: string
    driver: string
    model: string
    effort?: string | null
    status: string
    startedAt?: string | null
    completedAt?: string | null
    activityAt?: string | null
    result: string
    waiting: number
  }[]
}

export const t3Status = (status: string): NodeStatus =>
  status === 'completed' ? 'done'
    : status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'interrupted' || status === 'error' ? 'failed'
    : 'running'

const time = (value: string | null | undefined, fallback: number) => {
  const parsed = value ? Date.parse(value) : NaN

  return Number.isFinite(parsed) ? parsed : fallback
}

// Children become board nodes. A Codex-driven child is a codex node so advice and colors treat it as Codex.
export const t3Nodes = (scan: T3Scan, now: number): AgentNode[] =>
  scan.children.map(child => {
    const status = t3Status(child.status)
    const startedAt = time(child.startedAt, now)
    const endedAt = status === 'running' ? undefined : time(child.completedAt, now)
    const info: T3Info = { threadId: scan.threadId, driver: child.driver, effort: child.effort ?? undefined, result: child.result || undefined }

    return {
      id: `t3-${child.id}`,
      parentId: 'main',
      kind: child.driver === 'codex' ? 'codex' : 'agent',
      label: child.title || child.model,
      type: child.driver || 't3',
      model: child.model,
      status,
      tools: 0,
      errors: status === 'failed' ? 1 : 0,
      steps: 0,
      turns: 0,
      tokens: 0,
      startedAt,
      endedAt,
      lastEventAt: Math.max(startedAt, time(child.activityAt, startedAt)),
      approvalSince: child.waiting > 0 ? time(child.activityAt, now) : undefined,
      recent: [],
      health: 'ok',
      t3: info,
    }
  })

// "gpt-6.1-sol · high": what routing actually picked, so it can be checked against the policy table.
export const t3Label = (node: AgentNode) => node.t3 ? [node.model, node.t3.effort].filter(Boolean).join(' · ') : ''

export async function scanT3($: EngineInterface, sessionId: string): Promise<T3Scan | undefined> {
  const ran = await $.process.run(['python3', '-I', '-c', T3_SCANNER, sessionId], { timeoutMs: 8000 }).catch(() => undefined)
  if (!ran || ran.exitCode !== 0) return undefined
  try {
    const parsed = JSON.parse(ran.stdout) as T3Scan | null

    return parsed && Array.isArray(parsed.children) ? parsed : undefined
  } catch {
    return undefined
  }
}
