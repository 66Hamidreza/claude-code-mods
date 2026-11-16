"""Codex quota stays available without rollout activity; no real provider calls."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from server_test import server


class CodexUsageApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / '.codex').mkdir()
        (root / '.codex/auth.json').write_text(json.dumps({'tokens': {'access_token': 'test-only'}}))
        self.patch = patch.object(server, 'HOME', str(root))
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.cache = patch.dict(server.CODEX_USAGE_API, {'at': None, 'as_of': None, 'limits': None})
        self.cache.start()
        self.addCleanup(self.cache.stop)

    def response(self, pct=37):
        return io.BytesIO(json.dumps({'plan_type': 'team', 'rate_limit': {
            'primary_window': {'used_percent': pct, 'limit_window_seconds': 18000, 'reset_at': 20000},
            'secondary_window': {'used_percent': 11, 'limit_window_seconds': 604800, 'reset_at': 700000}}}).encode())

    def test_usage_without_any_rollout_and_one_minute_cache(self):
        with patch.object(server.urllib.request, 'urlopen', side_effect=lambda *a, **kw: self.response()) as request:
            data = server.codex_usage(10000)
            self.assertEqual(data['source'], 'api')
            self.assertEqual([w['usedPct'] for w in data['windows']], [37, 11])
            self.assertEqual([w['label'] for w in data['windows']], ['5-hour', 'Weekly'])
            self.assertTrue(all(not w['stale'] for w in data['windows']))
            self.assertEqual(data['status'], 'allowed')
            server.codex_usage(10030)
            self.assertEqual(request.call_count, 1)
            server.codex_usage(10061)
            self.assertEqual(request.call_count, 2)

    def test_failure_retains_age_and_does_not_invent_zero(self):
        with patch.object(server.urllib.request, 'urlopen', return_value=self.response()):
            server.codex_api_limits(10000)
        with patch.object(server.urllib.request, 'urlopen', side_effect=OSError('offline')):
            data = server.codex_usage(11900)
            self.assertEqual(data['asOf'], 10000000)
            self.assertEqual(data['windows'][0]['usedPct'], 37)
            self.assertTrue(data['windows'][0]['stale'])
            self.assertEqual(data['status'], 'unknown')

    def test_failure_falls_back_to_logs(self):
        limits = {'primary': {'used_percent': 24, 'window_minutes': 300, 'resets_at': 20000}}
        with patch.object(server.urllib.request, 'urlopen', side_effect=OSError('offline')), \
             patch.object(server, 'codex_log_windows', return_value=(server.codex_windows(limits, 10000000, 10000), limits, 10000000)):
            data = server.codex_usage(10000)
            self.assertEqual(data['source'], 'logs')
            self.assertEqual(data['windows'][0]['usedPct'], 24)

    def test_malformed_response_keeps_last_good_and_newer_log_wins(self):
        with patch.object(server.urllib.request, 'urlopen', return_value=self.response()):
            server.codex_api_limits(10000)
        with patch.object(server.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"rate_limit": {}}')):
            limits, at = server.codex_api_limits(10061)
        self.assertEqual(at, 10000000)
        self.assertEqual(limits['primary']['used_percent'], 37)
        newer = {'primary': {'used_percent': 42, 'window_minutes': 300, 'resets_at': 20000}}
        with patch.object(server, 'codex_log_windows', return_value=(server.codex_windows(newer, 10070000, 10070), newer, 10070000)):
            self.assertEqual(server.codex_usage(10070)['windows'][0]['usedPct'], 42)

if __name__ == '__main__':
    unittest.main()
