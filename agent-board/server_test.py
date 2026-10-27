"""Synthetic reset-history checks; no provider logs or real history are modified."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('board_server', Path(__file__).with_name('server.py'))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class UsageHistoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'history.json'

    def reading(self, pct, reset=2000, at=1000000, wid='five_hour', **account):
        body = {'at': at, 'claude': {'windows': []}, 'codex': {
            'windows': [{'id': wid, 'usedPct': pct, 'resetsAt': reset}], **account}}
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

    def test_weekly_shifts_and_scheduled_precedence(self):
        self.reading(30, reset=20000, wid='weekly')
        self.assertEqual(self.reading(30, reset=23600, wid='weekly', at=1010000), [])
        self.assertEqual(self.reading(30, reset=28000, wid='weekly', at=1020000)[0]['kind'], 'early')
        self.assertEqual(self.reading(30, reset=20000, wid='weekly', at=1030000)[0]['kind'], 'early')
        self.assertEqual(self.reading(1, reset=700000, wid='weekly', at=20000001)[0]['kind'], 'scheduled')

    def test_persistence_dedupe_account_and_bound(self):
        self.reading(92, plan='pro', credits={'balance': '10'})
        self.reading(5, at=1010000, plan='pro', credits={'balance': '10'})
        before = self.path.read_bytes()
        # Rebuilding from disk with a newer poll time preserves the event and avoids a write.
        self.assertEqual(self.reading(5, at=1020000, plan='pro', credits={'balance': '10'})[0]['at'], 1010000)
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


if __name__ == '__main__':
    unittest.main()
