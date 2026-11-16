"""Hermetic quota and Windows ingestion regressions; no credentials or provider calls."""
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from server_test import server

w = server.WIN_T3

class UsageRegressionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def write(self, name, lines):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('\n'.join(json.dumps(x) for x in lines) + '\n{partial')
        return path

    def test_quota_event_timestamp_over_mtime_and_future(self):
        def event(date, pct, reset):
            return {'timestamp': date, 'payload': {'rate_limits': {'primary': {
                'used_percent': pct, 'window_minutes': 300, 'resets_at': reset}}}}
        old = self.write('2026/11/16/rollout-old.jsonl', [event('2026-10-29T00:00:00Z', 99, 1793246400)])
        new = self.write('2026/11/16/rollout-new.jsonl', [event('2026-11-16T00:00:00Z', 16, 1794794400),
            event('2099-01-01T00:00:00Z', 90, 4070908800)])
        os.utime(old, (1800000000, 1800000000))
        os.utime(new, (1794787200, 1794787200))
        windows, _, at = server.codex_log_windows(str(self.root), 1794787300)
        self.assertEqual(at, 1794787200000)
        self.assertEqual(windows[0]['usedPct'], 16)
        self.assertFalse(windows[0]['stale'])
        windows, _, _ = server.codex_log_windows(str(self.root), 1794887300)
        self.assertTrue(windows[0]['stale'])
        self.assertEqual(windows[0]['usedPct'], 16)  # historical, never reset to fabricated zero
        self.assertTrue(server.renewal_info(1793246400000, 1794787300)['stale'])

    def test_identified_provider_logs_and_zero_missing_cache(self):
        scan = w.WindowsT3Scanner(self.root)
        codex = self.write('.codex/sessions/2026/11/16/rollout-abc.jsonl', [
            {'payload': {'type': 'token_count', 'info': {'total_token_usage': {'total_tokens': 42}}}},
            {'payload': {'type': 'token_count', 'info': {'total_token_usage': {'total_tokens': 84}}}}])
        self.assertEqual(scan.usage('codex', 'abc'), 84)
        self.assertIsNone(scan.usage('codex', 'missing'))
        self.assertIsNone(scan.usage('claudeAgent', '../abc'))
        def msg(n):
            return {'message': {'id': 'm1', 'usage': {'input_tokens': 10, 'output_tokens': n, 'cache_creation_input_tokens': 3}}}
        self.write('.claude/projects/project/session/subagents/agent-child.jsonl', [msg(1), msg(7)])
        self.assertEqual(scan.usage('claudeAgent', 'child'), 20)
        self.write('.claude/projects/project/zero.jsonl', [{'message': {'id': 'm0', 'usage': {'input_tokens': 0}}}])
        self.assertEqual(scan.usage('claudeAgent', 'zero'), 0)
        self.write('.claude/projects/project/unknown.jsonl', [
            {'message': {'id': 'm', 'usage': {'other': 9}}}, {'message': []}])
        self.assertIsNone(scan.usage('claudeAgent', 'unknown'))
        self.write('.codex/sessions/2026/11/16/rollout-invalid.jsonl', [
            {'payload': {'type': 'token_count', 'info': []}},
            {'payload': {'type': 'token_count', 'info': {'total_token_usage': {'total_tokens': -1}}}}])
        self.assertIsNone(scan.usage('codex', 'invalid'))
        codex.write_text(json.dumps({'payload': {'type': 'token_count', 'info': {'total_token_usage': {'total_tokens': 0}}}}))
        self.assertEqual(scan.usage('codex', 'abc'), 0)

    def test_database_usage_reaches_children_and_native_log_fallback(self):
        db = self.root / 'state.sqlite'
        with sqlite3.connect(db) as c:
            c.executescript('''
            create table projection_projects(project_id,title,workspace_root,deleted_at);
            create table orchestration_v2_projection_threads(thread_id,title,project_id,updated_at,payload_json,archived_at,deleted_at);
            create table orchestration_v2_projection_turn_items(thread_id,updated_at);
            create table orchestration_v2_projection_runs(thread_id,ordinal,status,requested_at,completed_at);
            create table orchestration_v2_projection_runtime_requests(thread_id,kind,status,resolved_at);
            create table orchestration_v2_projection_provider_threads(thread_id,driver,payload_json,updated_at);
            create table orchestration_v2_projection_subagents(thread_id,subagent_id,child_thread_id,origin,status,started_at,completed_at,payload_json);
            ''')
            for tid in ('parent', 'child', 'zero'):
                payload = {'createdAt': '2026-11-16T00:00:00Z'}
                if tid != 'parent':
                    payload['lineage'] = {'parentThreadId': 'parent', 'relationshipToParent': 'subagent'}
                c.execute('insert into orchestration_v2_projection_threads values (?,?,?,?,?,null,null)',
                    (tid,tid,'p','2026-11-16T00:00:00Z',json.dumps(payload)))
            for tid, count in [('parent',182000), ('child',1234), ('zero',0)]:
                c.execute('insert into orchestration_v2_projection_provider_threads values (?,?,?,?)',
                    (tid,'claudeAgent',json.dumps({'contextUsage':{'usedTokens':count}}),'2026-11-16'))
            for tid in ('child', 'zero', 'native', 'missing'):
                c.execute('insert into orchestration_v2_projection_subagents values (?,?,?,?,?,?,?,?)',
                    ('parent',tid,tid,'provider_native','running','2026-11-16T00:00:00Z',None,
                     json.dumps({'driver':'claudeAgent','nativeTaskRef':{'nativeId':tid}})))
        self.write('.claude/projects/p/s/subagents/agent-native.jsonl', [
            {'message': {'id': 'm', 'usage': {'input_tokens': 77}}}])
        before = db.read_bytes()
        state = w.read_state(db)
        scan = w.WindowsT3Scanner(self.root)
        out = scan._build(state,1794787300000)
        self.assertEqual(len(out),1)
        self.assertEqual([a['tokens'] for a in out[0]['agents']], [182000,1234,0,77,None])
        self.assertEqual(db.read_bytes(),before)

if __name__ == '__main__':
    unittest.main()
