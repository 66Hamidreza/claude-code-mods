"""Read-only discovery of OpenCode sessions from its local SQLite store, without hooks."""
import json
import os
import sqlite3
import time
from contextlib import closing
from pathlib import Path

RECENT_MS = 24 * 3600 * 1000
ACTIVE_MS = 10 * 60 * 1000


def parse_model(raw):
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        return str((data or {}).get('id') or '') if isinstance(data, dict) else str(raw or '')
    except ValueError:
        return str(raw or '')


def node(row, main, now_ms):
    created = row['time_created'] or 0
    updated = row['time_updated'] or created
    busy, idle = row['time_busy'] or 0, row['time_idle'] or 0
    working = busy > idle and now_ms - updated < ACTIVE_MS
    failed = row['idle_outcome'] in ('failed', 'error') and not working
    status = 'running' if working else 'failed' if failed else 'idle' if main else 'done'
    tokens = sum(row[k] or 0 for k in ('tokens_input', 'tokens_output', 'tokens_reasoning', 'tokens_cache_write'))
    agent = dict(id='main' if main else 'oc-' + row['id'], kind='agent', type='opencode',
                 label=(row['title'] or 'OpenCode') if not main else (Path(row['directory'] or '').name or 'OpenCode') + ' · OpenCode',
                 model=parse_model(row['model']), status=status, tools=0, errors=1 if failed else 0, steps=0, turns=0,
                 tokens=tokens, startedAt=created, lastEventAt=updated, activityAt=updated, recent=[],
                 health='ok', phase='thinking' if working else 'idle')
    if not main:
        agent['parentId'] = 'main'
    if status in ('done', 'failed'):
        agent['endedAt'] = updated
    return agent


class Scanner:
    def __init__(self, home):
        self.db = Path(home) / '.local/share/opencode/opencode.db'
        self.last_good = []
        self.seq = 0

    def scan(self, now=None):
        now_ms = int((time.time() if now is None else now) * 1000)
        if not self.db.exists():
            return []
        try:
            with closing(sqlite3.connect('file:%s?mode=ro' % self.db, uri=True, timeout=2)) as db:
                db.row_factory = sqlite3.Row
                rows = db.execute('select * from session_v2 where time_archived is null and time_updated > ? order by time_updated desc',
                                  (now_ms - RECENT_MS,)).fetchall()
        except (sqlite3.Error, OSError):
            return self.last_good  # Keep the last good answer while the DB is locked or mid-migration.
        self.seq += 1
        mains, kids = {}, {}
        ids = {r['id'] for r in rows}
        for row in rows:
            parent = row['parent_id']
            if parent and parent in ids:
                kids.setdefault(parent, []).append(row)
            else:
                mains[row['id']] = row
        out = []
        for sid, row in mains.items():
            agents = [node(row, True, now_ms)] + [node(k, False, now_ms) for k in kids.get(sid, [])]
            running = sum(a['status'] == 'running' for a in agents)
            at = max(a['activityAt'] for a in agents)
            name = Path(row['directory'] or '').name or 'OpenCode'
            out.append(dict(sessionId='opencode-' + sid, name=name, title=(row['title'] or name) + ' · OpenCode',
                            cwd=row['directory'] or '', updatedAt=at, seq=self.seq, isEnded=False,
                            standaloneOpencode=True, stale=not running,
                            summary=dict(running=running, waiting=0, failed=sum(a['status'] == 'failed' for a in agents),
                                         flagged=0, lastActivityAt=at),
                            agents=agents, activity=[], events=[]))
        self.last_good = out
        return out
