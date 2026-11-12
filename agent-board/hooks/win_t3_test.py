import importlib.util
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('win_t3', Path(__file__).with_name('win_t3.py'))
win_t3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(win_t3)

NOW = 1_800_000_000_000


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')


SCHEMA = '''
create table projection_projects(project_id text, title text, workspace_root text, deleted_at text);
create table orchestration_v2_projection_threads(thread_id text, title text, updated_at text, archived_at text,
    deleted_at text, project_id text, payload_json text);
create table orchestration_v2_projection_turn_items(thread_id text, updated_at text);
create table orchestration_v2_projection_runs(thread_id text, ordinal int, status text, requested_at text, completed_at text);
create table orchestration_v2_projection_runtime_requests(thread_id text, kind text, status text, resolved_at text);
create table orchestration_v2_projection_provider_threads(thread_id text, driver text, updated_at text, payload_json text);
create table orchestration_v2_projection_subagents(thread_id text, subagent_id text, child_thread_id text, origin text,
    status text, started_at text, completed_at text, payload_json text);
'''


def make_root(root, threads):
    """threads: dicts with id, title, ago (ms since last activity), and optional flags."""
    db = Path(root) / '.t3/userdata/statev2.sqlite'
    db.parent.mkdir(parents=True)
    c = sqlite3.connect(db)
    c.executescript(SCHEMA)
    c.execute("insert into projection_projects values('p0','No project','C:\\scratch',null)")
    c.execute("insert into projection_projects values('p1','Demo','C:\\Demo',null)")
    for t in threads:
        at = NOW - t.get('ago', 0)
        payload = dict(title=t['title'], worktreePath=t.get('cwd', 'C:\\scratch\\x'), createdAt=iso(at - 1000),
                       providerInstanceId='claudeAgent',
                       modelSelection=dict(model='claude-sonnet-5-5', options=[dict(id='effort', value='medium')]),
                       lineage=dict(parentThreadId=t.get('parent'), relationshipToParent='subagent' if t.get('parent') else None),
                       settledOverride='settled' if t.get('settled') else None)
        c.execute('insert into orchestration_v2_projection_threads values(?,?,?,?,?,?,?)',
                  (t['id'], t['title'], iso(at), iso(at) if t.get('archived') else None, None,
                   t.get('project', 'p0'), json.dumps(payload)))
        c.execute('insert into orchestration_v2_projection_turn_items values(?,?)', (t['id'], iso(at)))
        c.execute("insert into orchestration_v2_projection_runs values(?,1,?,?,null)",
                  (t['id'], t.get('run', 'completed'), iso(at)))
        c.execute("insert into orchestration_v2_projection_provider_threads values(?,?,?,?)",
                  (t['id'], 'claudeAgent', iso(at), json.dumps(dict(contextUsage=dict(usedTokens=1234)))))
        if t.get('request'):
            c.execute('insert into orchestration_v2_projection_runtime_requests values(?,?,?,null)',
                      (t['id'], t['request'], 'pending'))
    c.commit()
    c.close()


class WindowsT3Test(unittest.TestCase):
    def scan(self, threads, now=NOW):
        root = tempfile.mkdtemp()
        make_root(root, threads)
        scanner = win_t3.WindowsT3Scanner(root, 'Test Box (Windows)')
        self.addCleanup(scanner.close)
        return {s['t3']['threadId']: s for s in scanner.scan(now)}

    def test_no_project_thread_included_with_shape(self):
        s = self.scan([dict(id='a', title='خرید', ago=300_000)])['a']
        self.assertEqual(s['sessionId'], 'win-t3-a')
        self.assertEqual((s['name'], s['title'], s['cwd']), ('No project', 'خرید', 'C:\\scratch\\x'))
        self.assertEqual(s['environment'], 'Test Box (Windows)')
        main = s['agents'][0]
        self.assertEqual((main['id'], main['kind'], main['model'], main['tokens']), ('main', 'main', 'claude-sonnet-5-5', 1234))
        self.assertEqual(main['t3'], dict(threadId='a', driver='claudeAgent', effort='medium'))
        for key in ('updatedAt', 'seq', 'isEnded', 'stale', 'summary', 'activity', 'events'):
            self.assertIn(key, s)

    def test_named_project(self):
        s = self.scan([dict(id='a', title='T', project='p1', cwd='', ago=1000)])['a']
        self.assertEqual((s['name'], s['cwd']), ('Demo', 'C:\\Demo'))

    def test_archived_and_old_excluded(self):
        got = self.scan([dict(id='a', title='x', archived=True), dict(id='b', title='y', ago=25 * 3600 * 1000),
                         dict(id='c', title='z', ago=1000)])
        self.assertEqual(set(got), {'c'})

    def test_waiting_running_idle_done(self):
        got = self.scan([
            dict(id='w', title='w', ago=600_000, request='user_input'),
            dict(id='ap', title='ap', ago=600_000, request='approval'),
            dict(id='r1', title='r1', ago=30_000),
            dict(id='r2', title='r2', ago=5 * 60_000, run='running'),
            dict(id='i', title='i', ago=600_000),
            dict(id='d', title='d', ago=600_000, settled=True),
        ])
        status = {k: v['agents'][0]['status'] for k, v in got.items()}
        self.assertEqual(status, dict(w='waiting', ap='waiting', r1='running', r2='running', i='idle', d='done'))
        self.assertEqual(got['w']['agents'][0]['phase'], 'waiting-user')
        self.assertEqual(got['ap']['agents'][0]['phase'], 'waiting-approval')
        self.assertTrue(got['d']['isEnded'])
        self.assertTrue(got['i']['stale'])
        self.assertEqual(got['w']['summary']['waiting'], 1)

    def test_child_thread_excluded(self):
        got = self.scan([dict(id='p', title='parent', ago=1000), dict(id='k', title='kid', parent='p', ago=1000)])
        self.assertEqual(set(got), {'p'})

    def test_app_owned_child_node_under_parent(self):
        root = tempfile.mkdtemp()
        make_root(root, [dict(id='p', title='parent', ago=1000), dict(id='k', title='kid', parent='p', ago=1000)])
        c = sqlite3.connect(Path(root) / '.t3/userdata/statev2.sqlite')
        c.execute("insert into orchestration_v2_projection_subagents values('p','s1','k','app_owned','running',?,null,?)",
                  (iso(NOW - 5000), json.dumps(dict(title='Kid', driver='codex', model='gpt-6'))))
        c.commit()
        c.close()
        scanner = win_t3.WindowsT3Scanner(root)
        self.addCleanup(scanner.close)
        got = scanner.scan(NOW)
        self.assertEqual([s['t3']['threadId'] for s in got], ['p'])
        kid = got[0]['agents'][1]
        self.assertEqual((kid['id'], kid['parentId'], kid['kind'], kid['status']), ('t3-s1', 'main', 'codex', 'running'))

    def test_missing_db_returns_empty(self):
        scanner = win_t3.WindowsT3Scanner(tempfile.mkdtemp())
        self.assertEqual(scanner.scan(NOW), [])

    def test_corrupt_db_returns_empty(self):
        root = Path(tempfile.mkdtemp())
        db = root / '.t3/userdata/statev2.sqlite'
        db.parent.mkdir(parents=True)
        db.write_bytes(b'not a database' * 100)
        scanner = win_t3.WindowsT3Scanner(root)
        self.addCleanup(scanner.close)
        self.assertEqual(scanner.scan(NOW), [])


if __name__ == '__main__':
    unittest.main()
