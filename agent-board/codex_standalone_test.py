"""Synthetic T3 projections and rollouts; never reads the user's T3 store."""
import importlib.util
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('standalone', Path(__file__).parent / 'hooks/codex_standalone.py')
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)

NOW = 1800000000
START = '2026-10-25T10:00:00Z'
ACTIVITY = '2026-10-25T10:01:00Z'
END = '2026-10-25T10:02:00Z'


class StandaloneChildrenTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.day = self.home / '.codex/sessions/2026/10/25'
        self.day.mkdir(parents=True)
        self.db = self.home / '.t3/userdata/statev2.sqlite'
        self.db.parent.mkdir(parents=True)
        self.c = sqlite3.connect(self.db)
        self.addCleanup(self.c.close)
        self.c.executescript('''
            create table orchestration_v2_projection_subagents (
                subagent_id text primary key, thread_id text, child_thread_id text,
                provider_thread_id text, origin text, status text,
                started_at text, completed_at text, payload_json text);
            create table orchestration_v2_projection_provider_threads (
                provider_thread_id text, thread_id text, updated_at text, payload_json text);
            create table orchestration_v2_projection_threads (
                thread_id text primary key, title text, payload_json text);
            create table orchestration_v2_projection_turn_items (thread_id text, updated_at text);
            create table projection_threads (
                thread_id text primary key, pending_approval_count integer, pending_user_input_count integer);
        ''')
        self.thread('parent', 'Project main')
        self.provider('parent-provider', 'parent', 'parent-native')
        self.rollout('parent-native')
        self.scanner = scanner.Scanner(self.home)

    def thread(self, tid, title, parent=None, effort=None, relationship='subagent'):
        payload = {'lineage': {'parentThreadId': parent, 'relationshipToParent': relationship},
                   'modelSelection': {'options': []}}
        if effort:
            payload['modelSelection']['options'].append({'id': 'reasoningEffort', 'value': effort})
        self.c.execute('insert into orchestration_v2_projection_threads values (?,?,?)',
                       (tid, title, json.dumps(payload)))

    def provider(self, pid, tid, native):
        self.c.execute('insert into orchestration_v2_projection_provider_threads values (?,?,?,?)',
                       (pid, tid, START, json.dumps({'nativeThreadRef': {'nativeId': native}})))

    def child(self, subid='council', parent='parent', child='council-thread', driver='codex',
              status='running', provider=None, native=None, origin='app_owned', started=START):
        self.c.execute('insert into orchestration_v2_projection_subagents values (?,?,?,?,?,?,?,?,?)',
                       (subid, parent, child, provider, origin, status, started,
                        END if status in ('completed', 'failed') else None,
                        json.dumps({'title': 'Architecture council', 'driver': driver, 'model': 'test-model',
                                    'nativeTaskRef': {'nativeId': native}, 'result': 'Synthetic result'})))

    def rollout(self, native, done=False, age=0):
        path = self.day / ('rollout-' + native + '.jsonl')
        events = [dict(type='session_meta', payload=dict(id=native, originator='T3 Code',
                                                       cwd='/projects/demo', timestamp=START)),
                  dict(type='event_msg', payload=dict(type='task_complete' if done else 'task_started'))]
        path.write_text('\n'.join(json.dumps(e) for e in events) + '\n')
        os.utime(path, (NOW - age, NOW - age))

    def scan(self, now=NOW):
        self.c.commit()
        return self.scanner.scan(now)

    def test_council_is_owned_by_main_without_child_rollout_or_hooks(self):
        self.thread('council-thread', 'Child', parent='parent', effort='high')
        self.child()
        self.c.execute('insert into orchestration_v2_projection_turn_items values (?,?)', ('council-thread', ACTIVITY))
        self.thread('other', 'Other project')
        self.child('unrelated', parent='other', child='other-child')
        self.child('native-task', child=None, origin='provider_native', native='native-task-id')
        self.c.commit()
        before = self.db.read_bytes()
        result = self.scan()
        self.assertEqual(len(result), 1)
        main = result[0]
        self.assertEqual(main['sessionId'], 'codex-parent-native')
        self.assertEqual(main['title'], 'Project main')
        self.assertEqual(main['t3'], dict(threadId='parent', title='Project main', parentThreadId=None))
        self.assertEqual([a['id'] for a in main['agents']], ['main', 't3-council'])
        child = main['agents'][1]
        self.assertEqual((child['parentId'], child['kind'], child['status']), ('main', 'codex', 'running'))
        self.assertEqual(child['t3']['childThreadId'], 'council-thread')
        self.assertEqual(child['t3']['threadId'], 'council-thread')
        self.assertEqual(child['t3']['effort'], 'high')
        self.assertEqual(child['activityAt'], scanner.stamp(ACTIVITY))
        self.assertEqual(main['summary']['running'], 2)
        self.assertEqual(self.db.read_bytes(), before)

    def test_all_child_native_mapping_paths_and_lineage_are_excluded(self):
        self.thread('council-thread', 'Child', parent='parent')
        self.child()
        self.provider('child-provider', 'council-thread', 'child-native')
        self.child('provider-only', child=None, provider='orphan-provider')
        self.provider('orphan-provider', None, 'provider-native')
        self.child('native-only', child=None, native='task-native')
        self.thread('lineage-only', 'Child pending projection', parent='parent')
        self.provider('lineage-provider', 'lineage-only', 'lineage-native')
        for native in ('child-native', 'provider-native', 'task-native', 'lineage-native'):
            self.rollout(native)
        result = self.scan()
        self.assertEqual([s['sessionId'] for s in result], ['codex-parent-native'])
        self.assertEqual(len(result[0]['agents']), 4)

    def test_cross_provider_children_statuses_waits_and_completion(self):
        self.rollout('parent-native', done=True)
        self.thread('council-thread', 'Claude child', parent='parent', effort='high')
        self.child(driver='claudeAgent')
        self.c.execute('insert into projection_threads values (?,?,?)', ('council-thread', 0, 1))
        first = self.scan()[0]
        node = first['agents'][1]
        self.assertEqual((node['kind'], node['status'], node['phase']), ('agent', 'waiting', 'waiting-user'))
        self.assertNotIn('approvalSince', node)
        self.assertFalse(first['isEnded'])
        self.assertEqual(first['summary']['waiting'], 1)
        self.c.execute('update projection_threads set pending_approval_count=1, pending_user_input_count=0')
        node = self.scan()[0]['agents'][1]
        self.assertEqual(node['phase'], 'waiting-approval')
        self.assertEqual(node['approvalSince'], scanner.stamp(START))
        self.c.execute('update orchestration_v2_projection_subagents set status=?, completed_at=?', ('completed', END))
        last = self.scan()[0]
        self.assertTrue(last['isEnded'])
        self.assertEqual(last['agents'][1]['status'], 'done')
        self.assertEqual(last['agents'][1]['endedAt'], scanner.stamp(END))
        self.assertEqual(last['agents'][1]['phase'], 'idle')

    def test_projection_refresh_does_not_reparse_rollouts_or_invent_activity(self):
        self.child(started=None)
        self.scan()
        with patch.object(scanner, 'parse_rollout', side_effect=AssertionError('reparsed')):
            first = self.scan(NOW + 302)[0]
            self.assertEqual(first['agents'][0]['status'], 'idle')
            self.assertEqual(first['agents'][1]['activityAt'], 0)
            self.assertFalse(first['stale'])
            self.assertFalse(first['isEnded'])
            self.c.execute('update orchestration_v2_projection_subagents set status=?', ('failed',))
            last = self.scan(NOW + 303)[0]
            self.assertEqual(last['agents'][1]['status'], 'failed')
            self.assertEqual(last['summary']['failed'], 1)
            self.assertEqual(last['agents'][1]['activityAt'], 0)
            self.assertEqual(last['updatedAt'], first['updatedAt'])

    def test_main_pending_input_keeps_completed_rollout_visible(self):
        self.rollout('parent-native', done=True)
        self.c.execute('insert into projection_threads values (?,?,?)', ('parent', 0, 1))
        snapshot = self.scan()[0]
        self.assertFalse(snapshot['isEnded'])
        self.assertEqual(snapshot['agents'][0]['status'], 'waiting')
        self.assertEqual(snapshot['agents'][0]['phase'], 'waiting-user')
        self.assertNotIn('endedAt', snapshot['agents'][0])

    def test_multiple_native_mains_for_one_app_thread_choose_newest(self):
        self.provider('new-provider', 'parent', 'resumed-native')
        self.rollout('resumed-native', age=-1)
        self.child()
        snapshots = self.scan()
        self.assertEqual([s['sessionId'] for s in snapshots], ['codex-resumed-native'])
        self.assertEqual(len(snapshots[0]['agents']), 2)

    def test_fork_lineage_does_not_turn_an_independent_main_into_a_subagent(self):
        self.thread('fork', 'Independent fork', parent='parent', relationship='fork')
        self.provider('fork-provider', 'fork', 'fork-native')
        self.rollout('fork-native')
        self.assertEqual({s['sessionId'] for s in self.scan()}, {'codex-parent-native', 'codex-fork-native'})

    def test_existing_unavailable_database_fails_closed_then_recovers(self):
        self.child()
        last_good = self.scan()
        self.c.execute('alter table orchestration_v2_projection_threads rename to unavailable')
        self.c.commit()
        self.assertEqual(self.scan(), last_good)
        self.assertEqual(scanner.Scanner(self.home).scan(NOW), [])
        self.c.execute('alter table unavailable rename to orchestration_v2_projection_threads')
        self.c.execute('update orchestration_v2_projection_subagents set status=?', ('failed',))
        self.assertEqual(self.scan()[0]['agents'][1]['status'], 'failed')

    def test_absent_database_still_discovers_standalone_main_without_creating_it(self):
        self.c.close()
        self.db.unlink()
        self.assertEqual(self.scanner.scan(NOW)[0]['sessionId'], 'codex-parent-native')
        self.assertFalse(self.db.exists())

    def test_server_endpoints_deliver_projected_children_without_hook_parent(self):
        server_spec = importlib.util.spec_from_file_location('server', Path(__file__).with_name('server.py'))
        server = importlib.util.module_from_spec(server_spec)
        server_spec.loader.exec_module(server)
        self.child()
        self.c.commit()
        sessions = self.home / 'web/sessions'
        sessions.mkdir(parents=True)
        hook = dict(sessionId='unrelated-hook', updatedAt=NOW * 1000, agents=[dict(id='main')])
        (sessions / 'hook.json').write_text(json.dumps(hook))
        os.utime(sessions / 'hook.json', (NOW, NOW))
        with patch.object(server, 'CODEX_SCANNER', self.scanner), \
                patch.object(server, 'CODEX_CACHE', dict(at=0, body=b'[]')), \
                patch.object(server.time, 'time', return_value=NOW):
            standalone = json.loads(server.codex_sessions_body())
            merged = json.loads(server.sessions_body(sessions.parent, NOW))['sessions']
        self.assertEqual(merged, [hook, standalone[0]])
        self.assertEqual([a['id'] for a in standalone[0]['agents']], ['main', 't3-council'])
        self.assertEqual(standalone[0]['t3']['threadId'], 'parent')


if __name__ == '__main__':
    unittest.main()
