"""Read-only discovery of T3 Code main Codex threads, independent of Claude hooks."""
import json
import re
import sqlite3
import time
from contextlib import closing
from datetime import datetime
from pathlib import Path

RECENT = 2 * 60 * 60
ACTIVE = 5 * 60


def stamp(value):
    try:
        return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)
    except (TypeError, ValueError, AttributeError):
        return 0


def short(value, limit=160):
    return ' '.join(str(value or '').split())[:limit]


def message(content):
    if isinstance(content, str):
        return content
    return '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))


def parse_rollout(path):
    info = dict(threadId='', cwd='', model='', originator='', marked=False,
                startedAt=0, complete=False, lastAction='', tokens=0, commands=0)
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            head = line[:160]
            # Most bytes are response items. Only user messages can own CX markers.
            if ('"response_item"' in head and not re.search(r'"role"\s*:\s*"user"', line)) or '"world_state"' in head or '"token_usage_record"' in head:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue  # A writer can leave a partial last line.
            if not isinstance(event, dict):
                continue
            p = event.get('payload') or {}
            if not isinstance(p, dict):
                continue
            kind = event.get('type')
            if kind == 'session_meta':
                info.update(threadId=p.get('id') or p.get('session_id') or '',
                            cwd=p.get('cwd') or '', originator=p.get('originator') or '',
                            startedAt=stamp(p.get('timestamp') or event.get('timestamp')))
                if info['originator'] != 'T3 Code':
                    return None
            elif kind == 'turn_context':
                info['model'] = p.get('model') or info['model']
            text = None
            if kind == 'response_item' and p.get('role') == 'user':
                text = message(p.get('content') or [])
            elif kind == 'event_msg':
                t = p.get('type')
                if t == 'thread_settings_applied':
                    info['model'] = (p.get('thread_settings') or {}).get('model') or info['model']
                elif t == 'user_message':
                    text = message(p.get('content') or p.get('message') or '')
                elif t == 'task_started':
                    info['complete'] = False
                    info['lastAction'] = 'working'
                elif t in ('task_complete', 'turn_aborted'):
                    info['complete'] = True
                    info['lastAction'] = short(p.get('last_agent_message') or t)
                elif t == 'token_count':
                    info['tokens'] = ((p.get('info') or {}).get('total_token_usage') or {}).get('total_tokens', info['tokens'])
                elif t == 'item_completed':
                    item = p.get('item') or {}
                    it = item.get('type')
                    if it in ('UserMessage', 'user_message') or item.get('role') == 'user':
                        text = message(item.get('content') or [])
                    elif it == 'CommandExecution':
                        cmd = item.get('command') or []
                        if isinstance(cmd, list):
                            cmd = cmd[-1] if cmd else ''
                        info['commands'] += 1
                        info['lastAction'] = 'run ' + short(cmd)
                    elif it == 'FileChange':
                        info['lastAction'] = 'edit ' + short(', '.join(item.get('changes') or {}))
                    elif it == 'AgentMessage':
                        info['lastAction'] = 'says ' + short(message(item.get('content') or []))
            if text is not None and re.match(r'^CX_RUN_V1\s+owner=\S+\s+run=\S+\s+task=', text):
                info['marked'] = True
    return info if info['originator'] == 'T3 Code' and info['threadId'] and not info['marked'] else None


def child_native_ids(db):
    if not db.exists():
        return set()
    # Connections and queries never mutate T3 state. Include completed children too.
    with closing(sqlite3.connect(db.resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as c:
        subs = list(c.execute('''select child_thread_id, provider_thread_id,
            json_extract(payload_json, '$.nativeTaskRef.nativeId')
            from orchestration_v2_projection_subagents'''))
        child_threads = {r[0] for r in subs if r[0]}
        providers = {r[1] for r in subs if r[1]}
        native = {r[2] for r in subs if r[2]}
        for provider, thread, nid in c.execute('''select provider_thread_id, thread_id,
                json_extract(payload_json, '$.nativeThreadRef.nativeId')
                from orchestration_v2_projection_provider_threads'''):
            if thread in child_threads or provider in providers:
                if nid:
                    native.add(nid)
        return native


class Scanner:
    def __init__(self, home):
        self.home = Path(home)
        self.cache = {}
        self.last_good = []
        self.seq = 0

    def scan(self, now=None):
        now = time.time() if now is None else now
        root = self.home / '.codex/sessions'
        days = (p for p in root.glob('*/*/*') if p.is_dir())
        paths = {}
        for day in days:
            for path in day.glob('rollout-*.jsonl'):
                try:
                    stat = path.stat()
                    if stat.st_mtime < now - RECENT:
                        continue
                    key = (stat.st_mtime_ns, stat.st_size)
                    cached = self.cache.get(path)
                    info = cached[1] if cached and cached[0] == key else parse_rollout(path)
                    paths[path] = (key, info, stat.st_mtime)
                except (OSError, ValueError, TypeError):
                    continue
        self.cache = {p: (v[0], v[1]) for p, v in paths.items()}
        try:
            children = child_native_ids(self.home / '.t3/userdata/statev2.sqlite')
        except sqlite3.Error:
            # Do not mislabel children as main threads while the T3 store is unavailable.
            return self.last_good
        self.seq += 1
        out = {}
        for _, info, mtime in paths.values():
            if not info or info['threadId'] in children:
                continue
            sid = 'codex-' + info['threadId']
            at = int(mtime * 1000)
            done = info['complete']
            stale = not done and now - mtime > ACTIVE
            name = Path(info['cwd']).name or 'Codex'
            agent = dict(id='main', kind='codex', label=name + ' · Codex', type='codex',
                         model=info['model'] or 'codex', status='done' if done else 'idle' if stale else 'running',
                         detail=info['lastAction'] or 'working', tools=info['commands'], errors=0,
                         steps=0, turns=0, tokens=info['tokens'], startedAt=info['startedAt'] or at,
                         lastEventAt=at, activityAt=at, phase='idle' if done or stale else 'thinking',
                         recent=[], health='idle' if stale else 'ok')
            if done:
                agent['endedAt'] = at
            snapshot = dict(sessionId=sid, name=name, title=name + ' · Codex', cwd=info['cwd'],
                            updatedAt=at, seq=self.seq,
                            isEnded=done, standaloneCodex=True, stale=stale,
                            summary=dict(running=0 if done or stale else 1, waiting=0, failed=0, flagged=0, lastActivityAt=at),
                            agents=[agent], activity=[], events=[])
            if sid not in out or at > out[sid]['updatedAt']:
                out[sid] = snapshot
        self.last_good = list(out.values())
        return self.last_good
