"""Synthetic reset-history checks; no provider logs or real history are modified."""
import importlib.util
import functools
import http.client
import io
import threading
import urllib.error
from unittest import mock
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('board_server', Path(__file__).with_name('server.py'))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class UsageHistoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'history.json'

    def reading(self, pct, reset=2000, at=1000000, wid='five_hour', as_of=None, **account):
        body = {'at': at, 'claude': {'windows': []}, 'codex': {
            'windows': [{'id': wid, 'usedPct': pct, 'resetsAt': reset, 'asOf': at if as_of is None else as_of}], **account}}
        server.record_usage_history(body, self.path)
        return body['codex']['resets']

    def test_early_drop_and_ratio(self):
        self.reading(92)
        event = self.reading(5, at=1010000)[0]
        self.assertEqual(event, {'window': 'five_hour', 'at': 1010000, 'kind': 'early',
                                 'fromPct': 92, 'toPct': 5, 'prevResetsAt': 2000})
        self.assertEqual(self.reading(2, at=1020000)[0]['fromPct'], 5)

    def test_threshold_and_non_reset(self):
        self.reading(50)
        self.assertEqual(self.reading(41, at=1010000), [])
        self.assertEqual(self.reading(31, at=1020000)[0]['kind'], 'early')

    def test_scheduled_and_drop_after_deadline(self):
        self.reading(92, reset=999)
        self.assertEqual(self.reading(5, reset=999, at=1010000), [])
        self.assertEqual(self.reading(5, reset=3000, at=1020000)[0]['kind'], 'scheduled')

    def test_clock_shifts_alone_are_not_resets(self):
        self.reading(30, reset=20000, wid='weekly')
        self.assertEqual(self.reading(30, reset=23600, wid='weekly', at=1010000), [])
        self.assertEqual(self.reading(30, reset=28000, wid='weekly', at=1020000), [])
        self.assertEqual(self.reading(30, reset=20000, wid='weekly', at=1030000), [])
        self.assertEqual(self.reading(1, reset=700000, wid='weekly', at=20000001)[0]['kind'], 'scheduled')

    def test_persistence_dedupe_account_and_bound(self):
        self.reading(92, plan='pro', credits={'balance': '10'})
        self.reading(5, at=1010000, plan='pro', credits={'balance': '10'})
        before = self.path.read_bytes()
        # Rebuilding from disk with a newer poll time preserves the event and avoids a write.
        self.assertEqual(self.reading(5, at=1020000, as_of=1010000, plan='pro', credits={'balance': '10'})[0]['at'], 1010000)
        self.assertEqual(self.path.read_bytes(), before)
        self.reading(5, at=1030000, plan='plus', credits={'balance': '20'})
        history = json.loads(self.path.read_text())
        self.assertEqual(len(history['codex']['windows']['five_hour']), 2)
        self.assertEqual(len(history['codex']['account']), 2)
        self.assertEqual(history['codex']['account'][-1]['credits']['balance'], '20')
        for i in range(220):
            self.reading(i % 100, at=1040000 + i * 1000)
        self.assertEqual(len(json.loads(self.path.read_text())['codex']['windows']['five_hour']), 200)

    def test_last_five_and_absent_windows(self):
        for i in range(8):
            self.reading(92, at=1000000 + i * 2000)
            events = self.reading(5, at=1001000 + i * 2000)
        self.assertEqual(len(events), 5)
        self.assertEqual([e['at'] for e in events], sorted([e['at'] for e in events], reverse=True))
        body = {'at': 1100000, 'claude': {'windows': []}, 'codex': {'windows': []}}
        server.record_usage_history(body, self.path)
        self.assertEqual(body['codex']['resets'], events)
        self.assertEqual(body['claude']['resets'], [])

    def test_corruption_and_unwritable_path(self):
        for text in ('{broken', 'null', '[]', '{"codex":{"windows":{"five_hour":[null,3,{}]}}}'):
            self.path.write_text(text)
            self.assertEqual(self.reading(20), [])
            self.assertEqual(len(json.loads(self.path.read_text())['codex']['windows']['five_hour']), 1)
        body = {'at': 1000000, 'claude': {'windows': []}, 'codex': {'windows': []}}
        server.record_usage_history(body, Path('/proc/agent-board-history-test/history.json'))
        self.assertEqual(body['codex']['resets'], [])

    def test_uses_observation_time_and_rejects_replays(self):
        self.reading(92, at=3000000, as_of=1000000)
        self.reading(92, at=3010000, as_of=1020000)  # Same value, newer observation.
        self.assertEqual(self.reading(5, at=3020000, as_of=1010000), [])
        event = self.reading(5, at=3030000, as_of=1030000)[0]
        self.assertEqual((event['at'], event['kind']), (1030000, 'early'))
        self.assertEqual(self.reading(92, at=3040000, as_of=1000000), [event])

    def test_both_providers_and_windows_use_individual_observation_times(self):
        for pct, at in ((92, 1000000), (5, 1010000)):
            body = {'at': 3000000}
            for provider in ('claude', 'codex'):
                body[provider] = {'asOf': at + 1000, 'windows': [
                    {'id': wid, 'usedPct': pct, 'resetsAt': 2000, 'asOf': at}
                    for wid in ('five_hour', 'weekly')]}
            server.record_usage_history(body, self.path)
        for provider in ('claude', 'codex'):
            self.assertEqual({e['window'] for e in body[provider]['resets']}, {'five_hour', 'weekly'})
            self.assertTrue(all(e['at'] == 1010000 and e['kind'] == 'early' for e in body[provider]['resets']))

    def test_poll_time_history_is_discarded(self):
        self.path.write_text(json.dumps({'codex': {'windows': {'five_hour': [
            {'at': 900000, 'usedPct': 92, 'resetsAt': 2000}]}}}))
        self.assertEqual(self.reading(5), [])
        self.assertEqual(json.loads(self.path.read_text())['version'], 2)


class UsageSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.enterContext(patch.object(server, 'HOME', self.temp.name))
        self.enterContext(patch.object(server, 'codex_reset_credits', return_value=None))

    def test_timestamp_offsets_and_fractional_precision(self):
        utc = server.iso_ms('2026-10-27T10:00:00.123Z')
        self.assertEqual(utc, server.iso_ms('2026-10-27T13:30:00.123+03:30'))
        self.assertEqual(utc, server.iso_ms('2026-10-27T10:00:00.123'))
        self.assertIsNone(server.iso_ms(None))

    def test_expired_or_old_readings_never_confirm_reset(self):
        for as_of, deadline, now in ((990000, 999, 1000), (1000000, 4000, 3000)):
            w = server.window('five_hour', 'Window', 87, deadline, now, as_of)
            self.assertTrue(w['stale'])
            self.assertFalse(w['rolledOver'])
            self.assertIsNone(w['resetAt'])
            self.assertEqual(w['usedPct'], 87)
        self.assertFalse(server.window('five_hour', 'Window', 87, 2000, 1000, 990000)['stale'])

    def test_codex_chooses_newest_observation_not_file_mtime_or_line_order(self):
        day = self.home / '.codex/sessions/2026/10/27'
        day.mkdir(parents=True)
        def event(stamp, pct):
            return {'timestamp': stamp, 'payload': {'rate_limits': {'primary': {
                'window_minutes': 300, 'used_percent': pct, 'resets_at': 2000000000},
                'secondary': {'window_minutes': 10080, 'used_percent': pct + 1, 'resets_at': 2000000000}}}}
        old = day / 'rollout-old.jsonl'
        old.write_text(json.dumps(event('2026-10-27T08:00:00Z', 5)) + '\n')
        latest = day / 'rollout-latest.jsonl'
        latest.write_text('\n'.join(json.dumps(e) for e in [
            event('2026-10-27T10:00:00.123Z', 85), event('2026-10-27T09:00:00Z', 10)]) + '\n')
        os.utime(old, (2000000000, 2000000000))
        os.utime(latest, (1900000000, 1900000000))
        data = server.codex_usage(server.iso_ms('2026-10-27T10:01:00Z') / 1000)
        self.assertEqual([w['usedPct'] for w in data['windows']], [85, 86])
        self.assertEqual(data['asOf'], server.iso_ms('2026-10-27T10:00:00.123Z'))
        latest.write_text(json.dumps(event(None, 0)) + '\n')
        self.assertEqual(server.codex_usage(2000000000)['windows'][0]['usedPct'], 5)
        old.unlink()
        self.assertEqual(server.codex_usage(2000000000)['windows'], [])

    def test_claude_keeps_each_windows_actual_observation_time(self):
        logs = self.home / '.t3/userdata/logs/provider'
        logs.mkdir(parents=True)
        def event(stamp, windows):
            return '[' + stamp + '] ' + json.dumps({'rate_limit_info': {'status': 'allowed', 'unifiedWindows': windows}})
        (logs / 'events.test.log').write_text('\n'.join([
            event('2026-10-27T07:00:00.123Z', {'five_hour': {'utilization': .85, 'resetsAt': 2000000000}}),
            event('2026-10-27T13:30:00.456+03:30', {'seven_day': {'utilization': .25, 'resetsAt': 2000000000}}),
            event('2026-10-27T10:01:00.000Z', {'five_hour': {'resetsAt': 2000000000}})]))
        data = server.claude_usage(server.iso_ms('2026-10-27T10:02:00Z') / 1000)
        first, second = data['windows']
        self.assertEqual((first['usedPct'], second['usedPct']), (85, 25))
        self.assertTrue(first['stale'])
        self.assertFalse(second['stale'])
        self.assertEqual(first['asOf'], server.iso_ms('2026-10-27T07:00:00.123Z'))


NOW = 1_800_000_000.0  # fixed clock; all fixtures are synthetic


def iso(offset_s):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(NOW + offset_s, timezone.utc).isoformat()


def grant(gid, **over):
    base = {'id': gid, 'label': 'Label ' + gid, 'resets_total': 1, 'resets_left': 1, 'starts_at': iso(-3600),
            'ends_at': iso(5 * 86400), 'clears': ['five_hour'], 'paused': False, 'usable_now': True, 'type': None,
            'gives_back_weekly': False}
    base.update(over)
    return base


def usage_payload(grants=(), eligible=True, **over):
    data = {'five_hour': {'utilization': 28.0, 'resets_at': iso(3600)}, 'seven_day': {'utilization': 91.0, 'resets_at': iso(86400)},
            'cedar_ember': {'eligible': eligible, 'grants': list(grants), 'cooldown_until': None},
            'limits': [{'kind': 'session', 'percent': 28, 'severity': 'normal', 'resets_at': iso(3600), 'scope': None},
                       {'kind': 'weekly_all', 'percent': 91, 'severity': 'critical', 'resets_at': iso(86400), 'scope': None},
                       {'kind': 'weekly_scoped', 'percent': 12, 'severity': 'normal', 'resets_at': iso(90000),
                        'scope': {'model': {'id': None, 'display_name': 'Fable'}, 'surface': None}}]}
    data.update(over)
    return data


class ClaudeWindowsTest(unittest.TestCase):
    def test_windows_labels_scoped_and_stale(self):
        asof = int(NOW * 1000)
        windows = server.claude_windows(usage_payload(), NOW, asof)
        self.assertEqual([(w['id'], w['label'], w['usedPct'], w['windowMinutes']) for w in windows],
                         [('five_hour', '5-hour', 28.0, 300), ('seven_day', 'Weekly', 91.0, 10080),
                          ('weekly_fable', 'Weekly \u00b7 Fable', 12.0, 10080)])
        self.assertEqual(windows[0]['resetsAt'], NOW + 3600)
        self.assertEqual(windows[1]['severity'], 'critical')
        self.assertFalse(any(w['stale'] for w in windows))
        self.assertTrue(all(w['stale'] for w in server.claude_windows(usage_payload(), NOW, asof - 3_600_000)))

    def test_legacy_fields_without_limits_and_missing_data(self):
        windows = server.claude_windows(usage_payload(limits=None), NOW, int(NOW * 1000))
        self.assertEqual([w['id'] for w in windows], ['five_hour', 'seven_day'])
        self.assertEqual(server.claude_windows({}, NOW, 1), [])
        self.assertEqual(server.claude_windows({'limits': [{'kind': 'weekly_scoped', 'percent': 'x'}]}, NOW, 1), [])

    def test_duplicate_scoped_names_stay_unique(self):
        scoped = {'kind': 'weekly_scoped', 'percent': 5, 'resets_at': iso(1), 'scope': {'model': {'display_name': 'Fable'}}}
        windows = server.claude_windows({'limits': [scoped, dict(scoped)]}, NOW, int(NOW * 1000))
        self.assertEqual(len({w['id'] for w in windows}), 2)

    def test_window_labels_by_length(self):
        self.assertEqual([server.window_label(m, 'x') for m in (300, 10080, 43200, 44640, 120)],
                         ['5-hour', 'Weekly', 'Monthly', 'Monthly', '2-hour window'])
        self.assertEqual(server.window('w', 'Primary window', 5, NOW + 5, NOW, NOW * 1000, 300)['label'], '5-hour')

    def test_usage_prefers_api_and_falls_back_to_logs(self):
        with mock.patch.object(server, 'claude_oauth_usage', return_value=(usage_payload(), int(NOW * 1000))), \
                mock.patch.object(server, 'claude_renewal', return_value=None), mock.patch.object(server, 'claude_plan', return_value='pro'):
            body = server.claude_usage(NOW)
        self.assertEqual((body['source'], body['status'], len(body['windows'])), ('api', 'allowed', 3))
        self.assertNotIn('Bearer', json.dumps(body))
        log = ([server.window('five_hour', '5-hour', 10, NOW + 100, NOW, int(NOW * 1000), 300)], 'allowed', int(NOW * 1000))
        with mock.patch.object(server, 'claude_oauth_usage', return_value=(None, None)), mock.patch.object(server, 'claude_renewal', return_value=None), \
                mock.patch.object(server, 'claude_plan', return_value=None), mock.patch.object(server, 'claude_usage_from_logs', return_value=log):
            self.assertEqual(server.claude_usage(NOW)['source'], 'logs')
        old = int((NOW - 7200) * 1000)  # a two-hour-old API answer loses to the logs
        with mock.patch.object(server, 'claude_oauth_usage', return_value=(usage_payload(), old)), mock.patch.object(server, 'claude_renewal', return_value=None), \
                mock.patch.object(server, 'claude_plan', return_value=None), mock.patch.object(server, 'claude_usage_from_logs', return_value=log):
            self.assertEqual(server.claude_usage(NOW)['source'], 'logs')


class ResetCreditsTest(unittest.TestCase):
    def test_kind_mapping(self):
        kind = server.claude_grant_kind
        self.assertEqual(kind(grant('a', gives_back_weekly=True, type='full')), 'fable')
        for t in ('session', 'weekly', 'full'):
            self.assertEqual(kind(grant('a', type=t, clears=['seven_day'])), t)
        self.assertEqual(kind(grant('a', clears=['five_hour'])), 'session')
        self.assertEqual(kind(grant('a', clears=['seven_day', 'seven_day_overage_included'])), 'weekly')
        self.assertEqual(kind(grant('a', clears=['five_hour', 'seven_day'])), 'full')
        self.assertEqual(kind(grant('a', clears=[])), 'full')

    def test_items_filter_sort_and_flags(self):
        grants = [grant('later', type='weekly', ends_at=iso(9 * 86400), resets_left=2), grant('soon', gives_back_weekly=True),
                  grant('paused', paused=True), grant('spent', resets_left=0), grant('expired', ends_at=iso(-5)),
                  grant('future', starts_at=iso(100)), grant('blocked', usable_now=False, ends_at=iso(7 * 86400))]
        credits = server.claude_credits_from(usage_payload(grants), NOW)
        self.assertEqual([c['id'] for c in credits['items']], ['soon', 'blocked', 'later'])
        self.assertEqual(credits['available'], 4)
        soon = credits['items'][0]
        self.assertEqual((soon['title'], soon['kind'], soon['count'], soon['canUse'], soon['description']), ('Fable reset', 'fable', 1, True, 'Label soon'))
        self.assertEqual(soon['expiresAt'], int((NOW + 5 * 86400) * 1000))
        self.assertFalse(credits['items'][1]['canUse'])
        self.assertEqual(credits['items'][2]['count'], 2)
        self.assertIsNone(server.claude_credits_from(usage_payload(grants, eligible=False), NOW))
        self.assertIsNone(server.claude_credits_from({}, NOW))

    def test_cooldown_blocks_use(self):
        data = usage_payload([grant('a')])
        data['cedar_ember']['cooldown_until'] = iso(600)
        self.assertFalse(server.claude_credits_from(data, NOW)['items'][0]['canUse'])


class RenewalTest(unittest.TestCase):
    def test_days_left_and_label(self):
        at = int((NOW + 3 * 86400 - 60) * 1000)
        info = server.renewal_info(at, NOW)
        self.assertEqual((info['at'], info['daysLeft']), (at, 3))
        self.assertIn('3 days left', info['label'])
        self.assertEqual(server.renewal_info(int((NOW + 10) * 1000), NOW)['daysLeft'], 1)
        self.assertIn('1 day left', server.renewal_info(int((NOW + 10) * 1000), NOW)['label'])
        ended = server.renewal_info(int((NOW - 5) * 1000), NOW)
        self.assertEqual(ended['daysLeft'], 0)
        self.assertTrue(ended['stale'])
        self.assertTrue(ended['label'].startswith('Renewal unknown'))
        self.assertIsNone(server.renewal_info(None, NOW))
        self.assertIsNone(server.renewal_info(float('nan'), NOW))


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class RedeemTest(unittest.TestCase):
    """Every network call is mocked: a test must never spend a real credit."""

    def setUp(self):
        self.calls = []
        server.CACHE['at'] = 123.0
        patches = [mock.patch.object(server, 'claude_oauth_usage', return_value=(usage_payload([grant('ok-1'), grant('wait', usable_now=False)]), int(NOW * 1000))),
                   mock.patch.object(server, 'claude_headers', return_value={'Authorization': 'Bearer test'}),
                   mock.patch.object(server, 'claude_org_uuid', return_value='11111111-2222-3333-4444-555555555555')]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def redeem(self, grant_id, reply=None, error=None):
        def fake(req, timeout=None):
            self.calls.append((req.full_url, req.get_method(), json.loads(req.data.decode()), timeout))
            if error:
                raise error
            return FakeResponse(json.dumps(reply or {}).encode())
        with mock.patch.object(server.urllib.request, 'urlopen', fake):
            return server.redeem_claude(grant_id, NOW)

    def test_rejects_bad_or_unknown_ids_without_network(self):
        for bad in (None, 5, '', 'UPPER', 'a b', 'x' * 41, '../etc', 'a;b'):
            self.assertEqual(self.redeem(bad)[0], 400, bad)
        self.assertEqual(self.redeem('missing-grant')[0], 409)
        self.assertEqual(self.redeem('wait')[0], 409)  # known but not usable
        self.assertEqual(self.calls, [])

    def test_success_request_shape_and_cache_invalidation(self):
        status, body = self.redeem('ok-1', {'result': 'reset'})
        self.assertEqual((status, body['ok'], body['outcome']), (200, True, 'reset'))
        url, method, payload, timeout = self.calls[0]
        self.assertEqual((url, method, timeout), ('https://api.anthropic.com/api/organizations/11111111-2222-3333-4444-555555555555/reset_rate_limits', 'POST', 25))
        self.assertEqual((payload['program'], payload['grant_id']), ('cedar_ember', 'ok-1'))
        self.assertRegex(payload['request_id'], r'^[0-9a-f]{32}$')
        self.assertEqual(server.CACHE['at'], 0.0)
        self.assertNotIn('Bearer', json.dumps(body))

    def test_result_mapping(self):
        for result in ('not_limited', 'already_used', 'ineligible', 'cooldown', 'unavailable', 'surprise'):
            status, body = self.redeem('ok-1', {'result': result})
            self.assertEqual((status, body['ok']), (200, False))
            self.assertEqual(body['outcome'], result if result != 'surprise' else 'unavailable')

    def test_http_and_network_errors(self):
        def http_error(code):
            return urllib.error.HTTPError('u', code, 'x', {}, io.BytesIO(b'{}'))
        self.assertEqual(self.redeem('ok-1', error=http_error(429))[1]['outcome'], 'rate_limited')
        self.assertEqual(self.redeem('ok-1', error=http_error(401))[0], 401)
        self.assertEqual(self.redeem('ok-1', error=http_error(403))[1]['outcome'], 'auth')
        self.assertEqual(self.redeem('ok-1', error=http_error(500))[0], 502)
        self.assertEqual(self.redeem('ok-1', error=TimeoutError())[0], 502)

    def test_needs_fresh_credit_list_and_org(self):
        with mock.patch.object(server, 'claude_oauth_usage', return_value=(None, None)):
            self.assertEqual(self.redeem('ok-1')[0], 502)
        with mock.patch.object(server, 'claude_oauth_usage', return_value=(usage_payload([grant('ok-1')]), int((NOW - 600) * 1000))):
            self.assertEqual(self.redeem('ok-1')[0], 502)
        with mock.patch.object(server, 'claude_org_uuid', return_value=None):
            self.assertEqual(self.redeem('ok-1')[0], 500)
        self.assertEqual(self.calls, [])


class RedeemRouteTest(unittest.TestCase):
    """The HTTP guard in front of redeem; redeem_claude itself is stubbed."""

    def setUp(self):
        self.seen = []
        patch = mock.patch.object(server, 'redeem_claude', lambda gid, now=None: (self.seen.append(gid) or (200, {'ok': True, 'outcome': 'reset', 'message': 'ok'})))
        patch.start()
        self.addCleanup(patch.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.httpd = server.http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(server.Handler, directory=self.temp.name))
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.host = '127.0.0.1:%d' % self.httpd.server_port

    def post(self, body='{"provider":"claude","grantId":"ok-1"}', headers=None, path='/usage/redeem'):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_port, timeout=3)
        merged = {'Content-Type': 'application/json', 'Host': self.host}
        merged.update(headers or {})
        conn.request('POST', path, body=body, headers={k: v for k, v in merged.items() if v is not None})
        response = conn.getresponse()
        return response.status, response.read()

    def test_happy_path(self):
        status, body = self.post(headers={'Origin': 'http://' + self.host})
        self.assertEqual((status, json.loads(body)['outcome']), (200, 'reset'))
        self.assertEqual(self.post()[0], 200)  # no Origin header (curl-style) is allowed
        self.assertEqual(self.seen, ['ok-1', 'ok-1'])

    def test_csrf_and_shape_guards(self):
        self.assertEqual(self.post(headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.post(headers={'Origin': 'http://evil.example'})[0], 403)
        self.assertEqual(self.post(headers={'Origin': 'null'})[0], 403)
        self.assertEqual(self.post(headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)
        self.assertEqual(self.post(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.post(headers={'Content-Type': None})[0], 415)
        self.assertEqual(self.post(body='not json')[0], 400)
        self.assertEqual(self.post(body='[]')[0], 400)
        self.assertEqual(self.post(body='{"provider":"other"}')[0], 400)
        self.assertEqual(self.post(body='x' * 5000)[0], 400)
        self.assertEqual(self.post(path='/other')[0], 404)
        status, body = self.post(body='{"provider":"codex","grantId":"a"}')
        self.assertEqual(status, 501)
        self.assertEqual(self.seen, [])


if __name__ == '__main__':
    unittest.main()
