#!/usr/bin/env python3
"""Agent board web server: static files plus GET /usage.json, bound to 127.0.0.1.

usage.json reports how much of the Claude and Codex limits is left, read from local logs only:
Claude from the rate_limit events T3 Code logs, Codex from the newest rollout, plus the Codex
subscription end date from the ID token claims. No token or secret is ever returned or sent anywhere.
"""
import argparse
import base64
import glob
import http.server
import json
import os
import re
import time

HOME = os.path.expanduser('~')
CACHE = {'at': 0.0, 'body': b'{}'}
TAIL = 3_000_000


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


def window(wid, label, used, resets_at, now_s):
    used = max(0.0, min(100.0, float(used)))
    stale = resets_at is not None and resets_at < now_s
    return {'id': wid, 'label': label, 'usedPct': 0.0 if stale else round(used, 1), 'resetsAt': resets_at, 'stale': stale}


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
                    seen[wid] = (stamp or 0, w.get('utilization', 0) * 100, w.get('resetsAt'))
            kind = info.get('rateLimitType')
            if info.get('status') == 'rejected' and kind in labels and (kind not in seen or (stamp or 0) > seen[kind][0]):
                seen[kind] = (stamp or 0, 100, info.get('resetsAt'))
            if stamp and (as_of is None or stamp > as_of):
                as_of, status = stamp, info.get('status') or 'unknown'
    plan = None
    try:
        with open(os.path.join(HOME, '.claude/.credentials.json')) as f:
            plan = (json.load(f).get('claudeAiOauth') or {}).get('subscriptionType')
    except (OSError, ValueError):
        pass
    windows = [window(wid, labels[wid], seen[wid][1], seen[wid][2], now_s) for wid in ('five_hour', 'seven_day') if wid in seen]
    if any(w['usedPct'] >= 100 and not w['stale'] for w in windows):
        status = 'rejected'
    elif status != 'rejected':
        status = 'allowed' if windows else 'unknown'
    # A Claude subscription end date is not stored locally.
    return {'plan': plan, 'asOf': as_of, 'windows': windows, 'status': status, 'expiresAt': None}


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
        minutes = w.get('window_minutes') or 0
        wid, label = ('five_hour', '5-hour window') if minutes <= 600 else ('weekly', 'Weekly')
        windows.append(window(wid, label, w.get('used_percent', 0), w.get('resets_at'), now_s))
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
    return {'plan': (limits or {}).get('plan_type'), 'asOf': as_of, 'windows': windows, 'status': status, 'expiresAt': expires}


def usage_body():
    if time.time() - CACHE['at'] > 10:
        now = time.time()
        body = {'at': int(now * 1000), 'claude': claude_usage(now), 'codex': codex_usage(now)}
        CACHE.update(at=now, body=json.dumps(body).encode())
    return CACHE['body']


class Handler(http.server.SimpleHTTPRequestHandler):
    allowed_hosts = ()

    def do_GET(self):
        # Refuse foreign Host headers so a web page cannot read local data through DNS rebinding.
        if self.headers.get('Host', '').split(':')[0] not in ('localhost', '127.0.0.1'):
            self.send_error(403)
            return
        if self.path.split('?')[0] == '/usage.json':
            try:
                body = usage_body()
            except Exception:
                body = b'{}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
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
    http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()
