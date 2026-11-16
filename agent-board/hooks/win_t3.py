"""Read-only discovery of T3 Code threads that live on the Windows side, seen from WSL.

The Windows T3 desktop keeps its own statev2.sqlite (readable at /mnt/c/Users/<user>/.t3/...).
Nothing on the Windows side writes agent-board snapshots, so this scanner builds them from that
database. It never raises: a missing or unreadable store yields no sessions.
"""
import json
import math
import shutil
import sqlite3
import os
import tempfile
import threading
import time
from contextlib import closing
from datetime import datetime
from pathlib import Path

def default_root():
    """Windows profile whose T3 database is reachable from WSL: $AGENT_BOARD_WINDOWS_HOME, else the first /mnt/c/Users/*."""
    env = os.environ.get('AGENT_BOARD_WINDOWS_HOME')
    if env:
        return env
    for db in sorted(Path('/mnt/c/Users').glob('*/.t3/userdata/statev2.sqlite')):
        return str(db.parents[2])
    return '/mnt/c/Users/Default'


DEFAULT_ROOT = default_root()
DEFAULT_LABEL = os.environ.get('AGENT_BOARD_WINDOWS_LABEL', 'Windows')
WINDOW = 24 * 3600 * 1000       # only threads active in the last 24h
RUNNING = 2 * 60 * 1000          # turn-item activity this recent means running
FINISHED_NATIVE = 30 * 60 * 1000  # finished provider-native children linger this long
LIVE_RUN = 10 * 60 * 1000        # an in-flight run stays running this long while silent
TERMINAL_REQUEST = ('resolved', 'cancelled', 'canceled', 'expired', 'completed', 'failed', 'interrupted')


def stamp(value):
    try:
        return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)
    except (TypeError, ValueError, AttributeError):
        return 0


def load(text):
    try:
        value = json.loads(text) if text else {}
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def token_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def log_tokens(path, driver):
    """Codex cumulative total; Claude deduplicated billable message usage, as on Linux."""
    total, messages = None, {}
    with open(path, encoding='utf-8', errors='replace') as stream:
        for line in stream:
            if '"usage"' not in line and '"token_count"' not in line:
                continue
            event = load(line)
            if driver == 'codex':
                payload = event.get('payload')
                if not isinstance(payload, dict):
                    continue
                if payload.get('type') != 'token_count':
                    continue
                info = payload.get('info')
                usage = info.get('total_token_usage') if isinstance(info, dict) else None
                value = usage.get('total_tokens') if isinstance(usage, dict) else None
                if token_number(value):
                    total = value
            else:
                msg = event.get('message')
                usage = msg.get('usage') if isinstance(msg, dict) else None
                keys = ('input_tokens', 'output_tokens', 'cache_creation_input_tokens')
                if not isinstance(usage, dict) or not any(k in usage for k in keys):
                    continue
                values = [usage.get(k, 0) for k in keys]
                if msg.get('id') and usage and all(token_number(v) for v in values):
                    messages[msg['id']] = sum(values)
    return total if driver == 'codex' else sum(messages.values()) if messages else None


def effort_of(selection):
    for option in selection.get('options') or []:
        if isinstance(option, dict) and option.get('id') in ('effort', 'reasoningEffort'):
            return str(option.get('value'))
    return None


def child_node(row, activity, approvals, inputs, effort):
    _, subid, child, _, status, started, completed, title, driver, model = row[:10]
    status = ('done' if status == 'completed' else 'failed' if status in (
        'failed', 'cancelled', 'canceled', 'interrupted', 'error') else 'waiting' if status in (
        'waiting', 'pending_approval', 'pending_input') else 'idle' if status == 'idle' else 'running')
    over = status in ('done', 'failed')
    if status == 'running' and approvals + inputs > 0:
        status = 'waiting'
    started_at = stamp(started)
    ended_at = (stamp(completed) or activity or started_at) if over else 0
    at = max(started_at, activity, ended_at)
    node = dict(id='t3-' + subid, parentId='main', kind='codex' if driver == 'codex' else 'agent',
                label=title or model or 'T3 child', type=driver or 't3', model=model or '', status=status,
                tools=0, errors=1 if status == 'failed' else 0, steps=0, turns=0, tokens=None,
                startedAt=started_at, lastEventAt=at, activityAt=at, recent=[], health='ok',
                phase='idle' if over else 'waiting-approval' if approvals else 'waiting-user' if inputs
                else 'thinking' if status == 'running' else 'waiting-children' if status == 'waiting' else 'idle',
                t3=dict(threadId=child or '', childThreadId=child, driver=driver or '', effort=effort, result=''))
    if over:
        node['endedAt'] = ended_at
    elif approvals:
        node['approvalSince'] = at
    return node


def read_state(db):
    """One consistent read of the projection. Never reads prompts or turn-item payloads."""
    with closing(sqlite3.connect(Path(db).resolve().as_uri() + '?mode=ro', uri=True, timeout=2)) as c:
        c.execute('begin')
        projects = {pid: (title, root) for pid, title, root in c.execute(
            'select project_id, title, workspace_root from projection_projects where deleted_at is null')}
        threads = {}
        for tid, title, pid, updated, payload in c.execute('''select thread_id, title, project_id, updated_at,
                payload_json from orchestration_v2_projection_threads
                where archived_at is null and deleted_at is null'''):
            p = load(payload)
            if p.get('archivedAt') or p.get('deletedAt'):
                continue
            lineage = p.get('lineage') or {}
            selection = p.get('modelSelection') or {}
            threads[tid] = dict(threadId=tid, title=title or p.get('title') or '', projectId=pid,
                                createdAt=stamp(p.get('createdAt')), updatedAt=stamp(updated), cwd=p.get('worktreePath') or '',
                                model=selection.get('model') or '', effort=effort_of(selection),
                                driver=p.get('providerInstanceId') or '',
                                parent=lineage.get('parentThreadId'),
                                isChild=bool(lineage.get('parentThreadId')
                                             and lineage.get('relationshipToParent') == 'subagent'),
                                settled=p.get('settledOverride') == 'settled', tokens=None, nativeId=None)
        activity = {tid: stamp(at) for tid, at in c.execute('''select thread_id, max(updated_at)
            from orchestration_v2_projection_turn_items group by thread_id''')}
        runs = {}
        for tid, ordinal, status, requested, completed in c.execute('''select thread_id, ordinal, status,
                requested_at, completed_at from orchestration_v2_projection_runs'''):
            if tid not in runs or int(ordinal or 0) >= runs[tid][0]:
                runs[tid] = (int(ordinal or 0), status, max(stamp(requested), stamp(completed)))
        pending = {}
        for tid, kind, status, resolved in c.execute('''select thread_id, kind, status, resolved_at
                from orchestration_v2_projection_runtime_requests'''):
            if resolved or status in TERMINAL_REQUEST:
                continue
            a, i = pending.get(tid, (0, 0))
            pending[tid] = (a, i + 1) if kind == 'user_input' else (a + 1, i)
        for tid, driver, payload in c.execute('''select thread_id, driver, payload_json
                from orchestration_v2_projection_provider_threads order by updated_at'''):
            t = threads.get(tid)
            if t:
                t['driver'] = driver or t['driver']
                usage = load(payload).get('contextUsage')
                value = usage.get('usedTokens') if isinstance(usage, dict) else None
                if token_number(value):
                    t['tokens'] = value
                t['nativeId'] = (load(payload).get('nativeThreadRef') or {}).get('nativeId')
        subagents = {}
        for row in c.execute('''select thread_id, subagent_id, child_thread_id, origin, status, started_at,
                completed_at, json_extract(payload_json, '$.title'), json_extract(payload_json, '$.driver'),
                json_extract(payload_json, '$.model'), json_extract(payload_json, '$.nativeTaskRef.nativeId')
                from orchestration_v2_projection_subagents'''):
            if row[3] in ('app_owned', 'provider_native') and row[2]:
                subagents.setdefault(row[0], []).append(row)
    return dict(projects=projects, threads=threads, activity=activity, runs=runs, pending=pending,
                subagents=subagents)


class WindowsT3Scanner:
    def __init__(self, root=DEFAULT_ROOT, label=DEFAULT_LABEL):
        self.root = Path(root)
        self.usage_cache = {}
        self.db = Path(root) / '.t3/userdata/statev2.sqlite'
        self.label = label
        self.tmp = None
        self.key = None
        self.state = None
        self.seq = 0
        self.lock = threading.Lock()
        self.loaded_at = 0.0
        self.refresh_s = 20.0

    def usage(self, driver, native_id):
        """Only read the provider log identified by this agent; absence is not zero."""
        if not isinstance(native_id, str) or not native_id or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in native_id):
            return None
        if driver == 'codex':
            paths = (self.root / '.codex/sessions').glob('*/*/*/rollout-*' + native_id + '.jsonl')
        else:
            paths = list((self.root / '.claude/projects').glob('*/' + native_id + '.jsonl'))
            paths += list((self.root / '.claude/projects').glob('*/*/subagents/agent-' + native_id + '.jsonl'))
        for path in paths:
            try:
                st = path.stat()
                key = (st.st_mtime_ns, st.st_size)
                hit = self.usage_cache.get(path)
                if hit is None or hit[0] != key:
                    hit = (key, log_tokens(path, driver))
                    self.usage_cache[path] = hit
                if hit[1] is not None:
                    return hit[1]
            except OSError:
                continue
        return None

    def _fingerprint(self):
        out = []
        for suffix in ('', '-wal', '-shm'):
            try:
                st = Path(str(self.db) + suffix).stat()
                out.append((st.st_mtime_ns, st.st_size))
            except OSError:
                out.append(None)
        return tuple(out)

    def _copy_and_read(self):
        if self.tmp is None:
            self.tmp = tempfile.mkdtemp(prefix='win-t3-')
        target = Path(self.tmp) / 'statev2.sqlite'
        for suffix in ('', '-wal', '-shm'):
            part = Path(str(target) + suffix)
            try:
                shutil.copyfile(str(self.db) + suffix, part)
            except OSError:
                part.unlink(missing_ok=True)  # a stale copy of -wal/-shm would corrupt the snapshot
                if suffix == '':
                    raise
        return read_state(target)

    def _refresh(self):
        # Copying the live DB over /mnt/c takes ~10s; one refresher at a time, never on a request thread.
        if not self.lock.acquire(blocking=False):
            return
        try:
            key = self._fingerprint()
            if key == self.key and self.state is not None:
                return
            for attempt in range(2):  # the copy can race a writer checkpointing the WAL
                try:
                    self.state = self._copy_and_read()
                    self.key = key
                    return
                except (sqlite3.Error, OSError, ValueError, TypeError, AttributeError):
                    time.sleep(0.05)
        finally:
            self.loaded_at = time.time()
            self.lock.release()

    def _load(self):
        # Serve the last snapshot immediately; refresh in the background at most every refresh_s.
        if self.state is None and self.loaded_at == 0.0:
            self._refresh()  # first call only (blocking) so tests and cold start get data
        elif time.time() - self.loaded_at >= self.refresh_s and not self.lock.locked():
            threading.Thread(target=self._refresh, daemon=True).start()
        return self.state

    def close(self):
        if self.tmp:
            shutil.rmtree(self.tmp, ignore_errors=True)
            self.tmp = None

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def scan(self, now_ms=None):
        try:
            if not self.db.exists():
                return []
            state = self._load()
            return self._build(state, int(time.time() * 1000) if now_ms is None else int(now_ms)) if state else []
        except Exception:
            return []

    def _build(self, state, now):
        out = []
        self.seq += 1
        for tid, t in state['threads'].items():
            if t['isChild']:
                continue
            _, run_status, run_at = state['runs'].get(tid, (0, None, 0))
            at = max(t['updatedAt'], state['activity'].get(tid, 0), run_at)
            if not at or now - at > WINDOW:
                continue
            approvals, inputs = state['pending'].get(tid, (0, 0))
            last = max(state['activity'].get(tid, 0), run_at if run_status == 'running' else 0)
            in_flight = run_status == 'running' and now - last <= LIVE_RUN
            if approvals or inputs:
                status, phase = 'waiting', 'waiting-approval' if approvals else 'waiting-user'
            elif in_flight or now - state['activity'].get(tid, 0) <= RUNNING:
                status, phase = 'running', 'thinking'
            elif t['settled']:
                status, phase = 'done', 'idle'
            else:
                status, phase = 'idle', 'idle'
            project, root = state['projects'].get(t['projectId'], ('No project', ''))
            cwd = t['cwd'] or root
            main = dict(id='main', kind='main', label=t['title'] or project, type='main', model=t['model'],
                        status=status, detail='', tools=0, errors=0, steps=0, turns=0, tokens=t['tokens'] if t['tokens'] is not None else self.usage(t['driver'], t.get('nativeId')),
                        startedAt=t['createdAt'] or at, lastEventAt=at, activityAt=at, phase=phase, recent=[],
                        health='idle' if status == 'idle' else 'ok',
                        t3=dict(threadId=tid, driver=t['driver'], effort=t['effort']))
            if status == 'done':
                main['endedAt'] = at
            elif approvals:
                main['approvalSince'] = at
            agents = [main]
            for row in state['subagents'].get(tid, []):
                child = row[2]
                if row[3] == 'provider_native' and row[4] in ('completed', 'failed', 'cancelled', 'canceled', 'interrupted') \
                        and now - (stamp(row[6]) or stamp(row[5])) > FINISHED_NATIVE:
                    continue  # native Task children pile up; show only recently finished ones
                node = child_node(row, state['activity'].get(child, 0),
                                  *state['pending'].get(child, (0, 0)),
                                  (state['threads'].get(child) or {}).get('effort'))
                ct = state['threads'].get(child) or {}
                node['tokens'] = ct.get('tokens')
                if node['tokens'] is None:
                    node['tokens'] = self.usage(row[8], ct.get('nativeId') or (row[10] if len(row) > 10 else None))
                agents.append(node)
            live = any(a['status'] in ('running', 'waiting') for a in agents)
            updated = max(a['activityAt'] for a in agents)
            out.append(dict(
                sessionId='win-t3-' + tid, name=project, title=t['title'] or project, cwd=cwd,
                updatedAt=updated, seq=self.seq, isEnded=status == 'done' and not live, stale=status == 'idle' and not live,
                environment=self.label, host=self.label,
                t3=dict(threadId=tid, title=t['title'], parentThreadId=None, driver=t['driver'], effort=t['effort']),
                summary=dict(running=sum(a['status'] == 'running' for a in agents),
                             waiting=sum(a['status'] == 'waiting' for a in agents),
                             failed=sum(a['status'] == 'failed' for a in agents), flagged=0,
                             lastActivityAt=updated),
                agents=agents, activity=[], events=[]))
        return out
