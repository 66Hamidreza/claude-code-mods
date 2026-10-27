"""Synthetic reset-history checks; no provider logs or real history are modified."""
import importlib.util
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


if __name__ == '__main__':
    unittest.main()
