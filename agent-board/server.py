#!/usr/bin/env python3
"""Agent board web server: static files plus GET /usage.json, bound to 127.0.0.1.

usage.json reports how much of the Claude and Codex limits is left, read from local logs only:
Claude from the rate_limit events T3 Code logs, Codex from the newest rollout, plus the Codex
subscription end date from the ID token claims. Codex's available rate-limit reset credits come from one
read-only GET to chatgpt.com (Codex's own backend, cached 5 minutes) using the existing Codex login. No token or
secret is ever returned or written.
"""
import argparse
import base64
import glob
import http.server
import importlib.util
import json
import math
import os
import re
import tempfile
import time
import threading
import urllib.request
from pathlib import Path

HOME = os.path.expanduser('~')
CACHE = {'at': 0.0, 'body': b'{}'}
USAGE_LOCK = threading.Lock()
USAGE_HISTORY = Path(HOME) / '.claude/mods-data/agent-board/usage-history.json'
TAIL = 3_000_000
MOD_ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('codex_standalone', MOD_ROOT / 'hooks/codex_standalone.py')
standalone = importlib.util.module_from_spec(spec)
spec.loader.exec_module(standalone)
CODEX_SCANNER = standalone.Scanner(HOME)
CODEX_LOCK = threading.Lock()
CODEX_CACHE = {'at': 0.0, 'body': b'[]'}


def codex_sessions_body():
    with CODEX_LOCK:
        now = time.time()
        if now - CODEX_CACHE['at'] > 3:
            try:
                CODEX_CACHE.update(at=now, body=json.dumps(CODEX_SCANNER.scan(now)).encode())
            except Exception:
                CODEX_CACHE['at'] = now  # Keep the last successful response on transient read errors.
        return CODEX_CACHE['body']


def sessions_body(directory, now_s=None):
    """One corrupt or expired session file cannot hide the other sessions."""
    now_s = time.time() if now_s is None else now_s
    sessions = {}
    for path in (Path(directory) / 'sessions').glob('*.json'):
        try:
            if path.stat().st_mtime < now_s - 24 * 3600:
                path.unlink(missing_ok=True)
                continue
            snapshot = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(snapshot, dict) or not isinstance(snapshot.get('sessionId'), str) or not isinstance(snapshot.get('agents'), list) or not isinstance(snapshot.get('updatedAt'), (int, float)):
                continue
            sessions[snapshot['sessionId']] = snapshot
        except (OSError, ValueError, TypeError):
            continue
    try:
        codex = json.loads(codex_sessions_body())
    except (OSError, ValueError, TypeError):
        codex = []
    for snapshot in codex:
        sid = snapshot['sessionId']
        if sid not in sessions or snapshot.get('updatedAt', 0) > sessions[sid].get('updatedAt', 0):
            sessions[sid] = snapshot
    return json.dumps({'serverNow': int(now_s * 1000), 'sessions': list(sessions.values())}).encode()


def web_page():
    # web.ts is a plain template literal with escaped backslashes, no interpolation.
    # Serve the installed template directly, including before any Claude session starts.
    source = (MOD_ROOT / 'hooks/web.ts').read_text(encoding='utf-8')
    template = source.split('export const WEB_PAGE = `', 1)[1].rsplit('`', 1)[0]
    return template.replace('\\\\', '\\').encode('utf-8')


def tail_lines(path, size=TAIL):
    with open(path, 'rb') as f:
        f.seek(0, os.SEEK_END)
        end = f.tell()
        f.seek(max(0, end - size))
        data = f.read().decode('utf-8', 'replace')
    return data.splitlines()


def iso_ms(text):
    try:
        return int(time.mktime(time.strptime(text[:19], '%Y-%m-%dT%H:%M:%S'))) * 1000 - time.timezone * 1000
    except ValueError:
        return None


def duration_label(minutes, fallback):
    if not minutes:
        return fallback
    if minutes % (24 * 60) == 0:
        return f'{minutes / (24 * 60):g}-day window'
    if minutes % 60 == 0:
        return f'{minutes / 60:g}-hour window'
    return f'{minutes:g}-minute window'


def duration_minutes(data):
    for key, factor in (('window_minutes', 1), ('windowMinutes', 1), ('window_seconds', 1 / 60),
                        ('windowDurationSeconds', 1 / 60), ('durationSeconds', 1 / 60),
                        ('windowDurationMs', 1 / 60_000)):
        value = data.get(key)
        if isinstance(value, (int, float)) and value > 0:
            return value * factor
    return None


def window(wid, label, used, resets_at, now_s, as_of=None, minutes=None):
    used = max(0.0, min(100.0, float(used)))
    if isinstance(resets_at, str):
        parsed = iso_ms(resets_at)
        resets_at = parsed / 1000 if parsed is not None else None
    if isinstance(resets_at, (int, float)) and resets_at > 10_000_000_000:
        resets_at /= 1000
    stale = resets_at is not None and resets_at <= now_s
    return {'id': wid, 'label': duration_label(minutes, label), 'usedPct': round(used, 1),
            'resetsAt': resets_at, 'stale': stale, 'asOf': as_of, 'windowMinutes': minutes,
            'resetAt': int(resets_at * 1000) if stale else None, 'rolledOver': stale}


def claude_usage(now_s):
    labels = {'five_hour': '5-hour window', 'seven_day': 'Weekly'}
    seen, status, as_of = {}, 'unknown', None
    files = sorted(glob.glob(os.path.join(HOME, '.t3/userdata/logs/provider/events.*.log')), key=os.path.getmtime, reverse=True)[:12]
    for path in files:
        try:
            lines = tail_lines(path)
        except OSError:
            continue
        for line in reversed(lines):
            if 'rate_limit_info' not in line:
                continue
            match = re.search(r'"rate_limit_info":(\{.*?\})(?:,"|\}|$)', line)
            stamp = iso_ms(line[1:25]) if line.startswith('[') else None
            info = None
            if match:
                try:
                    info = json.loads(match.group(1))
                except ValueError:
                    info = None
            if info is None:
                # Nested unifiedWindows objects: take everything up to the closing of rate_limit_info.
                start = line.find('"rate_limit_info":') + len('"rate_limit_info":')
                depth = 0
                for i in range(start, len(line)):
                    depth += line[i] == '{'
                    depth -= line[i] == '}'
                    if depth == 0:
                        try:
                            info = json.loads(line[start:i + 1])
                        except ValueError:
                            info = None
                        break
            if not info:
                continue
            for wid, w in (info.get('unifiedWindows') or {}).items():
                if wid in labels and (wid not in seen or (stamp or 0) > seen[wid][0]):
                    seen[wid] = (stamp or 0, w.get('utilization', 0) * 100, w.get('resetsAt'), duration_minutes(w))
            kind = info.get('rateLimitType')
            if info.get('status') == 'rejected' and kind in labels and (kind not in seen or (stamp or 0) > seen[kind][0]):
                seen[kind] = (stamp or 0, 100, info.get('resetsAt'), duration_minutes(info))
            if stamp and (as_of is None or stamp > as_of):
                as_of, status = stamp, info.get('status') or 'unknown'
    plan = None
    try:
        with open(os.path.join(HOME, '.claude/.credentials.json')) as f:
            plan = (json.load(f).get('claudeAiOauth') or {}).get('subscriptionType')
    except (OSError, ValueError):
        pass
    windows = [window(wid, labels[wid], seen[wid][1], seen[wid][2], now_s, seen[wid][0] or None, seen[wid][3]) for wid in ('five_hour', 'seven_day') if wid in seen]
    if any(w['usedPct'] >= 100 and not w['stale'] for w in windows):
        status = 'rejected'
    elif status != 'rejected':
        status = 'allowed' if windows else 'unknown'
    # A Claude subscription end date is not stored locally.
    return {'plan': plan, 'asOf': as_of, 'windows': windows, 'status': status, 'expiresAt': None}


RESET_CREDITS = {'at': 0.0, 'value': None}


def codex_reset_credits(now_s):
    """Available Codex limit-reset credits; keeps the last good value when the request fails."""
    if now_s - RESET_CREDITS['at'] < 300:
        return RESET_CREDITS['value']
    RESET_CREDITS['at'] = now_s
    try:
        with open(os.path.join(HOME, '.codex/auth.json')) as f:
            tokens = json.load(f).get('tokens') or {}
        req = urllib.request.Request('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits', headers={
            'Authorization': 'Bearer ' + tokens['access_token'], 'chatgpt-account-id': tokens.get('account_id', ''),
            'User-Agent': 'codex_cli_rs'})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read().decode())
        items = [{'title': c.get('title') or 'Reset', 'expiresAt': iso_ms(c.get('expires_at') or '')}
                 for c in data.get('credits') or [] if c.get('status') == 'available']
        items.sort(key=lambda c: c['expiresAt'] or 0)
        RESET_CREDITS['value'] = {'available': len(items), 'items': items}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return RESET_CREDITS['value']


def codex_usage(now_s):
    root = os.path.join(HOME, '.codex/sessions')
    files = sorted(glob.glob(os.path.join(root, '*/*/*/rollout-*.jsonl')), key=os.path.getmtime, reverse=True)[:15]
    limits, as_of = None, None
    for path in files:
        try:
            lines = tail_lines(path, 1_500_000)
        except OSError:
            continue
        for line in reversed(lines):
            if '"rate_limits"' not in line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            found = (event.get('payload') or {}).get('rate_limits')
            if found and found.get('primary'):
                limits, as_of = found, iso_ms(event.get('timestamp', '')) or int(os.path.getmtime(path) * 1000)
                break
        if limits:
            break
    windows = []
    for key in ('primary', 'secondary'):
        w = (limits or {}).get(key)
        if not w:
            continue
        minutes = duration_minutes(w)
        wid = 'five_hour' if minutes == 300 else 'weekly' if minutes == 10080 else key
        windows.append(window(wid, key.capitalize() + ' window', w.get('used_percent', 0), w.get('resets_at'), now_s, as_of, minutes))
    expires = None
    try:
        with open(os.path.join(HOME, '.codex/auth.json')) as f:
            token = (json.load(f).get('tokens') or {}).get('id_token', '')
        claims = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '=='))
        until = (claims.get('https://api.openai.com/auth') or {}).get('chatgpt_subscription_active_until')
        expires = iso_ms(until) if until else None
    except (OSError, ValueError, IndexError):
        pass
    reached = (limits or {}).get('rate_limit_reached_type')
    status = 'limited' if reached or any(w['usedPct'] >= 100 and not w['stale'] for w in windows) else 'allowed' if windows else 'unknown'
    return {'plan': (limits or {}).get('plan_type'), 'credits': (limits or {}).get('credits'),
            'asOf': as_of, 'windows': windows, 'status': status, 'expiresAt': expires,
            'resetCredits': codex_reset_credits(now_s)}


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def clean_readings(value):
    if not isinstance(value, list):
        return []
    return [r for r in value if isinstance(r, dict) and finite_number(r.get('at'))
            and finite_number(r.get('usedPct'))
            and (r.get('resetsAt') is None or finite_number(r['resetsAt']))][-200:]


def detect_resets(wid, readings):
    """Derive events from adjacent observations; reset epochs use seconds, event times ms."""
    events = []
    for previous, current in zip(readings, readings[1:]):
        old, new = previous.get('resetsAt'), current.get('resetsAt')
        before, after = previous['usedPct'], current['usedPct']
        if old is None:
            continue
        scheduled = new is not None and new > old and old * 1000 <= current['at']
        dropped = before - after >= 10 or after < before / 2
        weekly_shift = (wid in ('weekly', 'seven_day') or current.get('windowMinutes') == 10080) and new is not None and abs(new - old) > 3600
        if scheduled or (old * 1000 > current['at'] and dropped) or weekly_shift:
            events.append({'window': wid, 'at': current['at'], 'kind': 'scheduled' if scheduled else 'early',
                           'fromPct': before, 'toPct': after, 'prevResetsAt': old})
    return events


def record_usage_history(body, path=None):
    """Keep a bounded, change-only history. A corrupt/unwritable file cannot hide usage."""
    path = Path(path) if path is not None else USAGE_HISTORY
    try:
        history = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        history = {}
    if not isinstance(history, dict):
        history = {}
    changed = False
    for provider in ('claude', 'codex'):
        data = body[provider]
        saved = history.get(provider)
        if not isinstance(saved, dict):
            saved = history[provider] = {}
        windows = saved.get('windows')
        if not isinstance(windows, dict):
            windows = saved['windows'] = {}
        events = []
        for w in data.get('windows', []):
            wid = w.get('id')
            if not isinstance(wid, str) or not finite_number(w.get('usedPct')):
                continue
            readings = clean_readings(windows.get(wid))
            values = {key: w.get(key) for key in ('usedPct', 'resetsAt', 'windowMinutes')}
            if values['resetsAt'] is not None and not finite_number(values['resetsAt']):
                continue
            if not readings or any(readings[-1].get(k) != v for k, v in values.items()):
                readings.append(dict(values, at=body['at']))
                changed = True
            windows[wid] = readings[-200:]
        # Include windows absent from this reading, so transient missing data keeps its history.
        for wid, readings in windows.items():
            events.extend(detect_resets(wid, clean_readings(readings)))
        data['resets'] = sorted(events, key=lambda e: e['at'], reverse=True)[:5]
        account = {k: data[k] for k in ('plan', 'credits') if data.get(k) is not None}
        if account:
            readings = saved.get('account')
            readings = [r for r in readings if isinstance(r, dict)] if isinstance(readings, list) else []
            if not readings or {k: v for k, v in readings[-1].items() if k != 'at'} != account:
                readings.append(dict(account, at=body['at']))
                changed = True
            saved['account'] = readings[-200:]
    if changed:
        temp_path = None
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
                temp_path = f.name
                json.dump(history, f, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, path)
        except (OSError, ValueError, TypeError):
            pass
        finally:
            if temp_path is not None:
                Path(temp_path).unlink(missing_ok=True)


def usage_body():
    with USAGE_LOCK:
        if time.time() - CACHE['at'] > 10:
            now = time.time()
            body = {'at': int(now * 1000), 'claude': claude_usage(now), 'codex': codex_usage(now)}
            record_usage_history(body)
            CACHE.update(at=now, body=json.dumps(body).encode())
        return CACHE['body']


def sample_usage_forever():
    # History continues to accumulate with no browser connected.
    while True:
        try:
            usage_body()
        except Exception:
            pass  # Retry transient log-read errors on the next sample.
        time.sleep(15)


class Handler(http.server.SimpleHTTPRequestHandler):
    allowed_hosts = ()

    def do_GET(self):
        # Refuse foreign Host headers so a web page cannot read local data through DNS rebinding.
        if self.headers.get('Host', '').split(':')[0] not in ('localhost', '127.0.0.1', 'abd'):
            self.send_error(403)
            return
        route = self.path.split('?')[0]
        if route in ('/usage.json', '/codex-sessions.json', '/sessions.json', '/', '/index.html'):
            try:
                body = (web_page() if route in ('/', '/index.html') else codex_sessions_body() if route == '/codex-sessions.json'
                        else sessions_body(self.directory) if route == '/sessions.json' else usage_body())
            except Exception:
                body = (json.dumps({'serverNow': int(time.time() * 1000), 'sessions': []}).encode() if route == '/sessions.json'
                        else b'[]' if route == '/codex-sessions.json' else b'{}')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8' if route in ('/', '/index.html') else 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=7788)
    parser.add_argument('--directory', default=os.path.join(HOME, '.claude/mods-data/agent-board/web'))
    args = parser.parse_args()
    os.makedirs(os.path.join(args.directory, 'sessions'), exist_ok=True)
    handler = lambda *a, **k: Handler(*a, directory=args.directory, **k)
    threading.Thread(target=sample_usage_forever, daemon=True).start()
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()
