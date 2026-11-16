#!/usr/bin/env python3
"""Agent board web server: static files plus GET /usage.json, bound to 127.0.0.1.

usage.json reports how much of the Claude and Codex limits is left. Claude windows, reset credits and the
billing renewal come from Anthropic's OAuth usage API (one shared, cached GET; the T3 Code rate_limit event logs
are only a fallback). Codex windows come from a cached read-only usage GET (newest rollout as fallback), the subscription end date from the ID token
claims, and its reset credits from one read-only GET to chatgpt.com (cached 5 minutes) using the existing Codex
login. POST /usage/redeem spends one Claude reset credit (loopback, same-origin JSON only). No token or secret is
ever returned or written.
"""
import argparse
import base64
from datetime import datetime, timezone
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
import urllib.error
import urllib.request
import uuid
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
_win_spec = importlib.util.spec_from_file_location('win_t3', MOD_ROOT / 'hooks/win_t3.py')
WIN_T3 = importlib.util.module_from_spec(_win_spec)
_win_spec.loader.exec_module(WIN_T3)
WIN_SCANNER = WIN_T3.WindowsT3Scanner()
REAL_HOME = HOME
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


STALE_AGENT_MS = 30 * 60 * 1000


def sessions_body(directory, now_s=None, windows=False):
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
    # Only the HTTP route scans the Windows-side T3 profile; direct callers (tests) stay hermetic.
    for snapshot in codex + (WIN_SCANNER.scan(int(now_s * 1000)) if windows else []):
        sid = snapshot['sessionId']
        if sid not in sessions or snapshot.get('updatedAt', 0) > sessions[sid].get('updatedAt', 0):
            sessions[sid] = snapshot
    token_map = getattr(CODEX_SCANNER, 'token_map', {})
    for snapshot in sessions.values():
        for agent in snapshot['agents']:
            child = (agent.get('t3') or {}).get('childThreadId') if isinstance(agent, dict) else None
            if child and not agent.get('tokens') and token_map.get(child):
                agent['tokens'] = token_map[child]
    now_ms = int(now_s * 1000)
    for snapshot in sessions.values():
        for agent in snapshot['agents']:
            # A subagent the host never reported finished: running, no tool in flight, silent for
            # 30+ minutes. Show it as done (inferred) instead of keeping the whole session alive.
            if (isinstance(agent, dict) and agent.get('kind') == 'agent' and agent.get('status') == 'running'
                    and agent.get('toolStartedAt') is None and not agent.get('t3')
                    and isinstance(agent.get('activityAt'), (int, float)) and now_ms - agent['activityAt'] > STALE_AGENT_MS):
                agent.update(status='done', phase='idle', health='ok', endedAt=agent['activityAt'], healthNote='finished (inferred: silent)')
    return json.dumps({'serverNow': now_ms, 'sessions': list(sessions.values())}).encode()


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
        stamp = datetime.fromisoformat(text.replace('Z', '+00:00'))
        return int(stamp.replace(tzinfo=timezone.utc).timestamp() * 1000) if stamp.tzinfo is None else int(stamp.timestamp() * 1000)
    except (ValueError, TypeError, AttributeError):
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


def window_label(minutes, fallback):
    """Short card label from the window length: never guess, fall back to the explicit duration text."""
    if minutes == 300:
        return '5-hour'
    if minutes == 10080:
        return 'Weekly'
    if isinstance(minutes, (int, float)) and 28 * 1440 <= minutes <= 31 * 1440:
        return 'Monthly'
    return duration_label(minutes, fallback)


def window(wid, label, used, resets_at, now_s, as_of=None, minutes=None, keep_label=False):
    used = max(0.0, min(100.0, float(used)))
    if isinstance(resets_at, str):
        parsed = iso_ms(resets_at)
        resets_at = parsed / 1000 if parsed is not None else None
    if isinstance(resets_at, (int, float)) and resets_at > 10_000_000_000:
        resets_at /= 1000
    expired = resets_at is not None and resets_at <= now_s
    stale = expired or not finite_number(as_of) or as_of > now_s * 1000 or now_s * 1000 - as_of >= 1800000
    return {'id': wid, 'label': label if keep_label else window_label(minutes, label), 'usedPct': round(used, 1),
            'resetsAt': resets_at, 'stale': stale, 'asOf': as_of, 'windowMinutes': minutes,
            'resetAt': None, 'rolledOver': False, 'resetPending': expired}


CLAUDE_VERSION = {'value': None}
CLAUDE_API = {'at': 0.0, 'ok_at': 0.0, 'data': None}
CLAUDE_API_LOCK = threading.Lock()
CLAUDE_API_TTL = 60
CLAUDE_API_FRESH = 1800  # a cached API answer older than this is no better than the T3 logs
USAGE_URL = 'https://api.anthropic.com/api/oauth/usage?cedar_ember=1&skip_spend=1'
RESET_URL = 'https://api.anthropic.com/api/organizations/%s/reset_rate_limits'


def claude_cli_version():
    """The usage API only reports reset credits to a recent CLI User-Agent, so send the installed version."""
    if CLAUDE_VERSION['value'] is None:
        import subprocess
        try:
            out = subprocess.run([os.path.join(HOME, '.local/bin/claude'), '--version'], capture_output=True, text=True, timeout=10).stdout
            CLAUDE_VERSION['value'] = re.match(r'\d+\.\d+\.\d+', out.strip()).group(0)
        except (OSError, AttributeError, subprocess.SubprocessError):
            CLAUDE_VERSION['value'] = '2.1.322'
    return CLAUDE_VERSION['value']


def claude_headers():
    """Request headers for Anthropic's OAuth endpoints. The token only lives inside this request."""
    with open(os.path.join(HOME, '.claude/.credentials.json')) as f:
        token = (json.load(f).get('claudeAiOauth') or {})['accessToken']
    return {'Authorization': 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20',
            'User-Agent': 'claude-cli/%s (external, cli)' % claude_cli_version()}


def claude_oauth_usage(now_s, force=False):
    """One shared read-only GET feeding Claude windows and reset credits: cached >=60s, last good kept on failure.

    Returns (data, fetched_at_ms); data is None until the first success."""
    with CLAUDE_API_LOCK:
        if force or now_s - CLAUDE_API['at'] >= CLAUDE_API_TTL:
            CLAUDE_API['at'] = now_s
            try:
                req = urllib.request.Request(USAGE_URL, headers=claude_headers())
                with urllib.request.urlopen(req, timeout=8) as r:
                    data = json.loads(r.read().decode())
                if not isinstance(data, dict):
                    raise ValueError('unexpected usage payload')
                CLAUDE_API.update(data=data, ok_at=now_s)
            except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError):
                pass
        return CLAUDE_API['data'], (int(CLAUDE_API['ok_at'] * 1000) if CLAUDE_API['data'] is not None else None)


def claude_invalidate():
    """Drop cached usage so the next read refetches (after a redeem)."""
    CLAUDE_API['at'] = 0.0
    CACHE['at'] = 0.0


def claude_windows(data, now_s, as_of):
    """Windows from the OAuth usage payload: session, weekly and one per weekly_scoped limit (e.g. Weekly · Fable)."""
    limits = [l for l in data.get('limits') or [] if isinstance(l, dict)]

    def pick(kind, legacy):
        for item in limits:
            if item.get('kind') == kind and finite_number(item.get('percent')):
                return item['percent'], item.get('resets_at'), item.get('severity')
        old = data.get(legacy)
        if isinstance(old, dict) and finite_number(old.get('utilization')):
            return old['utilization'], old.get('resets_at'), None
        return None

    out = []
    for wid, label, minutes, kind, legacy in (('five_hour', '5-hour', 300, 'session', 'five_hour'),
                                               ('seven_day', 'Weekly', 10080, 'weekly_all', 'seven_day')):
        found = pick(kind, legacy)
        if found:
            w = window(wid, label, found[0], found[1], now_s, as_of, minutes, keep_label=True)
            w['severity'] = found[2]
            out.append(w)
    used = {w['id'] for w in out}
    for index, item in enumerate(limits):
        if item.get('kind') != 'weekly_scoped' or not finite_number(item.get('percent')):
            continue
        model = ((item.get('scope') or {}).get('model') or {}) if isinstance(item.get('scope'), dict) else {}
        name = str(model.get('display_name') or model.get('id') or '').strip()
        slug = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_') or 'scoped%d' % index
        wid = 'weekly_' + slug
        while wid in used:
            wid += '_'
        used.add(wid)
        w = window(wid, 'Weekly \u00b7 ' + name if name else 'Weekly (scoped)', item['percent'], item.get('resets_at'), now_s, as_of, 10080, keep_label=True)
        w['severity'] = item.get('severity')
        out.append(w)
    return out


def claude_usage_from_logs(now_s):
    labels = {'five_hour': '5-hour', 'seven_day': 'Weekly'}
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
            match = re.search(r'"rate_limit_info"\s*:\s*', line)
            stamp = iso_ms(line[1:line.find(']')]) if line.startswith('[') and ']' in line else None
            info = None
            if match:
                try:
                    info, _ = json.JSONDecoder().raw_decode(line[match.end():])
                except ValueError:
                    info = None
            if not isinstance(info, dict):
                continue
            for wid, w in (info.get('unifiedWindows') or {}).items():
                if wid in labels and isinstance(w, dict) and finite_number(w.get('utilization')) and (wid not in seen or (stamp or 0) > seen[wid][0]):
                    seen[wid] = (stamp or 0, w.get('utilization', 0) * 100, w.get('resetsAt'), duration_minutes(w))
            kind = info.get('rateLimitType')
            if info.get('status') == 'rejected' and kind in labels and (kind not in seen or (stamp or 0) > seen[kind][0]):
                seen[kind] = (stamp or 0, 100, info.get('resetsAt'), duration_minutes(info))
            if stamp and (as_of is None or stamp > as_of):
                as_of, status = stamp, info.get('status') or 'unknown'
    windows = [window(wid, labels[wid], seen[wid][1], seen[wid][2], now_s, seen[wid][0] or None, seen[wid][3]) for wid in ('five_hour', 'seven_day') if wid in seen]
    return windows, status, as_of


def claude_plan():
    try:
        with open(os.path.join(HOME, '.claude/.credentials.json')) as f:
            return (json.load(f).get('claudeAiOauth') or {}).get('subscriptionType')
    except (OSError, ValueError):
        return None


def renewal_info(at_ms, now_s):
    """Billing renewal as {at, daysLeft, label}; at is epoch ms. None when the date is unknown."""
    if not finite_number(at_ms):
        return None
    remaining = at_ms / 1000 - now_s
    days = max(0, math.ceil(remaining / 86400))
    day = datetime.fromtimestamp(at_ms / 1000, timezone.utc).strftime('%Y-%m-%d')
    label = 'Renewal unknown · last reported %s' % day if remaining <= 0 else 'Renews %s \u00b7 %d day%s left' % (day, days, '' if days == 1 else 's')
    return {'at': int(at_ms), 'daysLeft': days, 'label': label, 'stale': remaining <= 0}


def claude_usage(now_s):
    data, fetched = claude_oauth_usage(now_s)
    plan = claude_plan()
    expires = claude_renewal(now_s)
    if data is not None and fetched is not None and now_s - fetched / 1000 < CLAUDE_API_FRESH:
        windows = claude_windows(data, now_s, fetched)
        status, as_of = 'allowed' if windows else 'unknown', fetched
        source = 'api'
    else:
        windows, status, as_of = claude_usage_from_logs(now_s)
        source = 'logs'
    if any(w['usedPct'] >= 100 and not w['stale'] for w in windows):
        status = 'rejected'
    elif status != 'rejected':
        status = 'allowed' if windows else 'unknown'
    if not any(not w['stale'] for w in windows):
        status = 'unknown'
    return {'plan': plan, 'asOf': as_of, 'windows': windows, 'status': status, 'source': source, 'expiresAt': expires,
            'renewal': renewal_info(expires, now_s), 'resetCredits': claude_reset_credits(now_s)}


def claude_grant_kind(grant):
    """fable | session | weekly | full, from the grant's own flags before its clear list."""
    if grant.get('gives_back_weekly'):
        return 'fable'
    if grant.get('type') in ('session', 'weekly', 'full'):
        return grant['type']
    clears = [c for c in grant.get('clears') or [] if isinstance(c, str)]
    if clears and all(c == 'five_hour' for c in clears):
        return 'session'
    if clears and all(c != 'five_hour' for c in clears):
        return 'weekly'
    return 'full'


CLAUDE_KIND_TITLES = {'fable': 'Fable reset', 'session': '5-hour reset', 'weekly': 'Weekly reset', 'full': 'Full reset'}


def claude_credits_from(data, now_s):
    block = data.get('cedar_ember') if isinstance(data, dict) else None
    if not isinstance(block, dict) or not block.get('eligible'):
        return None
    cooldown = iso_ms(block.get('cooldown_until') or '') if block.get('cooldown_until') else None
    items = []
    for g in block.get('grants') or []:
        if not isinstance(g, dict) or not isinstance(g.get('id'), str):
            continue
        ends = iso_ms(g.get('ends_at') or '') if g.get('ends_at') else None
        starts = iso_ms(g.get('starts_at') or '') if g.get('starts_at') else None
        left = g.get('resets_left')
        if g.get('paused') or not finite_number(left) or left < 1 or (ends is not None and ends <= now_s * 1000) \
                or (starts is not None and starts > now_s * 1000):
            continue
        kind = claude_grant_kind(g)
        items.append({'id': g['id'], 'kind': kind, 'title': CLAUDE_KIND_TITLES[kind], 'description': str(g.get('label') or ''),
                      'expiresAt': ends, 'count': int(left),
                      'canUse': bool(g.get('usable_now')) and not (cooldown and cooldown > now_s * 1000)})
    items.sort(key=lambda c: c['expiresAt'] or 1 << 62)
    return {'available': sum(c['count'] for c in items), 'items': items, 'cooldownUntil': cooldown}


def claude_reset_credits(now_s):
    """Claude limit-reset grants from the shared usage payload (last good kept on failure, expiry applied at read time)."""
    data, _ = claude_oauth_usage(now_s)
    return claude_credits_from(data, now_s) if data is not None else None


RENEWAL = {'at': 0.0, 'value': None}


def next_anniversary(start_ms, now_s):
    """Next monthly anniversary (same day-of-month, clamped) of start_ms after now_s, in ms."""
    start = datetime.fromtimestamp(start_ms / 1000, timezone.utc)
    now = datetime.fromtimestamp(now_s, timezone.utc)
    year, month = now.year, now.month
    for _ in range(3):
        last = [31, 29 if year % 4 == 0 and (year % 100 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
        due = start.replace(year=year, month=month, day=min(start.day, last))
        if due > now:
            return int(due.timestamp() * 1000)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return None


def claude_renewal(now_s):
    """Next Claude billing date from the account's subscription start (read-only GET to Anthropic, cached 1 hour)."""
    if now_s - RENEWAL['at'] < 3600 and RENEWAL['value'] and RENEWAL['value']['next'] > now_s * 1000:
        return RENEWAL['value']['next']
    if now_s - RENEWAL['at'] < 300:
        return None
    RENEWAL['at'] = now_s
    try:
        with open(os.path.join(HOME, '.claude/.credentials.json')) as f:
            token = (json.load(f).get('claudeAiOauth') or {})['accessToken']
        req = urllib.request.Request('https://api.anthropic.com/api/oauth/profile', headers={
            'Authorization': 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'claude-code/2.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            org = json.loads(r.read().decode()).get('organization') or {}
        start = iso_ms(org.get('subscription_created_at') or '')
        nxt = next_anniversary(start, now_s) if start and org.get('subscription_status') == 'active' else None
        RENEWAL['value'] = {'next': nxt} if nxt else None
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return RENEWAL['value']['next'] if RENEWAL['value'] else None


# --- redeem (spends a real credit: only ever reached through POST /usage/redeem) ---
GRANT_ID = re.compile(r'[a-z0-9_-]{1,40}')
ORG_ID = re.compile(r'[0-9a-fA-F-]{8,64}')
REDEEM_LOCK = threading.Lock()
REDEEM_OUTCOMES = {
    'reset': (200, True, 'Reset applied. Your limits were refilled.'),
    'not_limited': (200, False, 'Nothing to reset yet: you are not at a limit. The credit was not used.'),
    'already_used': (200, False, 'This credit was already used.'),
    'ineligible': (200, False, 'This account is not eligible for this reset.'),
    'cooldown': (200, False, 'A reset was used recently. Try again after the cooldown.'),
    'unavailable': (200, False, 'Resets are unavailable right now. Try again later.'),
}


def claude_org_uuid():
    try:
        with open(os.path.join(HOME, '.claude.json')) as f:
            org = (json.load(f).get('oauthAccount') or {}).get('organizationUuid')
    except (OSError, ValueError, AttributeError):
        return None
    return org if isinstance(org, str) and ORG_ID.fullmatch(org) else None


def redeem_claude(grant_id, now_s=None):
    """Spend one Claude reset credit. Returns (http_status, body). Validates against the live usable grants first."""
    now_s = time.time() if now_s is None else now_s
    if not isinstance(grant_id, str) or not GRANT_ID.fullmatch(grant_id):
        return 400, {'ok': False, 'outcome': 'invalid', 'message': 'Invalid reset id.'}
    with REDEEM_LOCK:
        data, fetched = claude_oauth_usage(now_s, force=True)
        if data is None or fetched is None or now_s - fetched / 1000 > 120:
            return 502, {'ok': False, 'outcome': 'unavailable', 'message': 'Could not confirm your credits with Anthropic. Try again.'}
        credits = claude_credits_from(data, now_s)
        grant = next((c for c in (credits or {}).get('items', []) if c['id'] == grant_id), None)
        if grant is None or not grant['canUse']:
            return 409, {'ok': False, 'outcome': 'not_usable', 'message': 'That reset is not usable right now.'}
        org = claude_org_uuid()
        if org is None:
            return 500, {'ok': False, 'outcome': 'error', 'message': 'Claude organization id not found. Sign in to Claude Code again.'}
        try:
            payload = json.dumps({'program': 'cedar_ember', 'grant_id': grant_id, 'request_id': uuid.uuid4().hex}).encode()
            req = urllib.request.Request(RESET_URL % org, data=payload, method='POST',
                                         headers=dict(claude_headers(), **{'Content-Type': 'application/json'}))
            with urllib.request.urlopen(req, timeout=25) as r:
                result = json.loads(r.read().decode()).get('result')
        except urllib.error.HTTPError as error:
            claude_invalidate()
            if error.code == 429:
                return 429, {'ok': False, 'outcome': 'rate_limited', 'message': 'Anthropic is rate limiting this request. Wait a minute and try again.'}
            if error.code in (401, 403):
                return 401, {'ok': False, 'outcome': 'auth', 'message': 'Anthropic rejected the login. Open Claude Code to sign in again.'}
            return 502, {'ok': False, 'outcome': 'error', 'message': 'Anthropic returned HTTP %d. Check your usage before retrying.' % error.code}
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            claude_invalidate()
            return 502, {'ok': False, 'outcome': 'error', 'message': 'The request failed or timed out. Check your usage before retrying.'}
        claude_invalidate()
        outcome = result if result in REDEEM_OUTCOMES else 'unavailable'
        status, ok, message = REDEEM_OUTCOMES[outcome]
        return status, {'ok': ok, 'outcome': outcome, 'message': message}


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
        items = [{'id': str(c.get('id') or c.get('credit_id') or ''), 'kind': None, 'title': c.get('title') or 'Reset',
                  'description': str(c.get('description') or ''), 'expiresAt': iso_ms(c.get('expires_at') or ''),
                  'count': 1, 'canUse': False}
                 for c in data.get('credits') or [] if isinstance(c, dict) and c.get('status') == 'available']
        items.sort(key=lambda c: c['expiresAt'] or 1 << 62)
        RESET_CREDITS['value'] = {'available': len(items), 'items': items}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return RESET_CREDITS['value']


CODEX_USAGE_API = {'at': None, 'as_of': None, 'limits': None}


def codex_api_limits(now_s):
    """Read quota without requiring an active rollout; failures preserve observation age."""
    if CODEX_USAGE_API['at'] is not None and 0 <= now_s - CODEX_USAGE_API['at'] < 60:
        return CODEX_USAGE_API['limits'], CODEX_USAGE_API['as_of']
    CODEX_USAGE_API['at'] = now_s
    try:
        with open(os.path.join(HOME, '.codex/auth.json')) as f:
            tokens = json.load(f).get('tokens') or {}
        req = urllib.request.Request('https://chatgpt.com/backend-api/wham/usage', headers={
            'Authorization': 'Bearer ' + tokens['access_token'],
            'chatgpt-account-id': tokens.get('account_id', ''), 'User-Agent': 'codex_cli_rs'})
        with urllib.request.urlopen(req, timeout=8) as response:
            data = json.load(response)
        rate = data.get('rate_limit') or {}
        limits = {'plan_type': data.get('plan_type'), 'credits': data.get('credits'),
                  'rate_limit_reached_type': 'usage' if rate.get('limit_reached') else None}
        for key, api_key in (('primary', 'primary_window'), ('secondary', 'secondary_window')):
            item = rate.get(api_key)
            if not isinstance(item, dict) or not finite_number(item.get('used_percent')):
                continue
            if not finite_number(item.get('reset_at')) or not finite_number(item.get('limit_window_seconds')):
                continue
            if item['limit_window_seconds'] <= 0:
                continue
            limits[key] = {'used_percent': item['used_percent'], 'resets_at': item['reset_at'],
                           'window_minutes': item['limit_window_seconds'] / 60}
        if any(key in limits for key in ('primary', 'secondary')):
            CODEX_USAGE_API.update(limits=limits, as_of=int(now_s * 1000))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        pass
    return CODEX_USAGE_API['limits'], CODEX_USAGE_API['as_of']


CODEX_WINDOW_KEYS = ('primary', 'secondary', 'individual_limit')
CODEX_KEY_LABELS = {'primary': 'Primary window', 'secondary': 'Secondary window', 'individual_limit': 'Individual limit'}


def codex_log_windows(root, now_s):
    """Newest valid observation wins, independently of file modification order."""
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
            stamp = iso_ms(event.get('timestamp', ''))
            if isinstance(found, dict) and any(isinstance(found.get(k), dict) for k in CODEX_WINDOW_KEYS) and stamp is not None and stamp <= now_s * 1000 and (as_of is None or stamp > as_of):
                limits, as_of = found, stamp
    return codex_windows(limits, as_of, now_s), limits, as_of


def codex_windows(limits, as_of, now_s):
    windows, used_ids = [], set()
    for key in CODEX_WINDOW_KEYS:
        w = (limits or {}).get(key)
        if not isinstance(w, dict) or not finite_number(w.get('used_percent')):
            continue
        minutes = duration_minutes(w)
        wid = 'five_hour' if minutes == 300 else 'weekly' if minutes == 10080 else 'monthly' if window_label(minutes, '') == 'Monthly' else key
        while wid in used_ids:
            wid += '_'
        used_ids.add(wid)
        fallback = CODEX_KEY_LABELS.get(key, key.replace('_', ' ').capitalize()) if minutes is None else key.capitalize() + ' window'
        windows.append(window(wid, fallback, w.get('used_percent', 0), w.get('resets_at'), now_s, as_of, minutes))
    return windows


def codex_usage(now_s):
    windows, limits, as_of = codex_log_windows(os.path.join(HOME, '.codex/sessions'), now_s)
    source = 'logs'
    api_limits, api_at = codex_api_limits(now_s)
    if api_limits and api_at <= now_s * 1000 and (as_of is None or api_at >= as_of):
        limits, as_of, source = api_limits, api_at, 'api'
        windows = codex_windows(limits, as_of, now_s)
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
    if not any(not w['stale'] for w in windows):
        status = 'unknown'
    return {'source': source, 'plan': (limits or {}).get('plan_type'), 'credits': (limits or {}).get('credits'),
            'asOf': as_of, 'windows': windows, 'status': status, 'expiresAt': expires,
            'renewal': renewal_info(expires, now_s), 'resetCredits': codex_reset_credits(now_s)}


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
        if old is None or current['at'] <= previous['at']:
            continue
        scheduled = new is not None and new > old and old * 1000 <= current['at']
        dropped = before - after >= 10 or after < before / 2
        if scheduled or (old * 1000 > current['at'] and dropped):
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
    # Poll-time histories cannot establish when a provider observation happened.
    changed = not isinstance(history, dict) or history.get('version') != 2
    if changed:
        history = {'version': 2}
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
            observed_at = w.get('asOf', data.get('asOf'))
            if not finite_number(observed_at) or observed_at > body['at']:
                continue
            if readings:
                last_seen = readings[-1].get('lastSeenAt')
                if observed_at <= (last_seen if finite_number(last_seen) else readings[-1]['at']):
                    continue
            values = {key: w.get(key) for key in ('usedPct', 'resetsAt', 'windowMinutes')}
            if values['resetsAt'] is not None and not finite_number(values['resetsAt']):
                continue
            if not readings or any(readings[-1].get(k) != v for k, v in values.items()):
                readings.append(dict(values, at=observed_at))
                changed = True
            elif readings[-1].get('lastSeenAt') != observed_at:
                readings[-1]['lastSeenAt'] = observed_at
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

    def host_ok(self):
        return self.headers.get('Host', '').split(':')[0] in ('localhost', '127.0.0.1', 'abd')

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        # Spends a real credit, so the CSRF guards come before anything is read or sent upstream.
        if self.path.split('?')[0] != '/usage/redeem':
            self.send_error(404)
            return
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        if not self.host_ok() or (origin is not None and origin.split('://', 1)[-1] != host) \
                or self.headers.get('Sec-Fetch-Site', 'same-origin') not in ('same-origin', 'none'):
            self.send_error(403)
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
            self.send_json(415, {'ok': False, 'outcome': 'invalid', 'message': 'JSON body required.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 2048:
                raise ValueError('size')
            request = json.loads(self.rfile.read(size).decode())
            if not isinstance(request, dict):
                raise ValueError('shape')
        except (ValueError, UnicodeDecodeError):
            self.send_json(400, {'ok': False, 'outcome': 'invalid', 'message': 'Invalid request.'})
            return
        if request.get('provider') == 'codex':
            self.send_json(501, {'ok': False, 'outcome': 'unsupported', 'message': 'Redeem in Codex.'})
            return
        if request.get('provider') != 'claude':
            self.send_json(400, {'ok': False, 'outcome': 'invalid', 'message': 'Unknown provider.'})
            return
        status, body = redeem_claude(request.get('grantId'))
        self.send_json(status, body)

    def do_GET(self):
        # Refuse foreign Host headers so a web page cannot read local data through DNS rebinding.
        if not self.host_ok():
            self.send_error(403)
            return
        route = self.path.split('?')[0]
        if route in ('/usage.json', '/codex-sessions.json', '/sessions.json', '/', '/index.html'):
            try:
                body = (web_page() if route in ('/', '/index.html') else codex_sessions_body() if route == '/codex-sessions.json'
                        else sessions_body(self.directory, windows=HOME == REAL_HOME) if route == '/sessions.json' else usage_body())
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
