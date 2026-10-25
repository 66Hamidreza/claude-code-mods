import { expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { WEB_PAGE } from './web'

const fixture = String.raw`
import importlib.util,json,os,pathlib,sqlite3,sys,tempfile
spec=importlib.util.spec_from_file_location('scanner',sys.argv[1])
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
def event(t,**p): return {'type':'event_msg','payload':dict(type=t,**p)}
with tempfile.TemporaryDirectory() as home:
 root=pathlib.Path(home); day=root/'.codex/sessions/2026/10/25'; day.mkdir(parents=True)
 now=1800000000
 def write(id,events=(),age=0,origin='T3 Code',folder=day):
  p=folder/('rollout-'+id+'.jsonl')
  meta={'type':'session_meta','payload':{'id':id,'originator':origin,'cwd':'/projects/PartoCloud','timestamp':'2026-10-25T10:00:00Z'}}
  p.write_text('\n'.join(json.dumps(e) for e in [meta,*events])+'\n'); os.utime(p,(now-age,now-age)); return p
 start=event('task_started'); done=event('task_complete',last_agent_message='all done')
 write('main',[{'type':'turn_context','payload':{'model':'gpt-6.1-sol'}},start,
  event('item_completed',item={'type':'CommandExecution','command':['bash','-lc','bun test']}),
  event('token_count',info={'total_token_usage':{'total_tokens':1234}})])
 write('done',[start,done]); write('resumed',[start,done,start]); write('stale',[start],age=301)
 write('old',[start],age=7201); write('tui',[start],origin='codex_tui'); write('other',[start],origin='codex_exec')
 marker='CX_RUN_V1 owner=claude run=exec task=-\nwork'
 write('marked',[event('user_message',message=marker)])
 write('response-marker',[{'type':'response_item','payload':{'role':'user','content':[{'text':marker}]}}])
 write('item-marker',[event('item_completed',item={'type':'UserMessage','content':[{'text':marker}]})])
 raw=write('raw',[start])
 with raw.open('a') as f:
  f.write('{"type":"response_item","payload":{"role":"assistant","huge":"'+'x'*100000+'"}}\n{partial\n')
 os.utime(raw,(now,now))
 oldday=root/'.codex/sessions/2026/10/23'; oldday.mkdir()
 yesterday=root/'.codex/sessions/2026/10/24'; yesterday.mkdir()
 write('old-day',[start],folder=oldday); write('yesterday',[start],folder=yesterday)
 for id in ('child','provider-child','native-child'): write(id,[start])
 db=root/'.t3/userdata/statev2.sqlite'; db.parent.mkdir(parents=True)
 c=sqlite3.connect(db)
 c.executescript('''create table orchestration_v2_projection_subagents(child_thread_id text,provider_thread_id text,payload_json text);
 create table orchestration_v2_projection_provider_threads(provider_thread_id text,thread_id text,payload_json text);''')
 c.executemany('insert into orchestration_v2_projection_subagents values (?,?,?)',[
  ('app-child',None,'{}'),(None,'provider-2','{}'),(None,None,json.dumps({'nativeTaskRef':{'nativeId':'native-child'}}))])
 c.executemany('insert into orchestration_v2_projection_provider_threads values (?,?,?)',[
  ('p1','app-child',json.dumps({'nativeThreadRef':{'nativeId':'child'}})),
  ('provider-2',None,json.dumps({'nativeThreadRef':{'nativeId':'provider-child'}})),
  ('main-provider','app-main',json.dumps({'nativeThreadRef':{'nativeId':'main'}}))])
 c.commit(); c.close(); before=db.read_bytes()
 scanner=m.Scanner(root); result=scanner.scan(now); byid={s['sessionId']:s for s in result}
 assert set(byid)=={'codex-main','codex-done','codex-resumed','codex-stale','codex-raw','codex-yesterday'},set(byid)
 main=byid['codex-main']['agents'][0]
 assert (main['model'],main['detail'],main['tokens'])==('gpt-6.1-sol','run bun test',1234)
 assert byid['codex-main']['name']=='PartoCloud'
 for id,status in [('main','running'),('done','done'),('resumed','running'),('stale','done')]:
  assert byid['codex-'+id]['agents'][0]['status']==status
 original=m.parse_rollout
 def no_parse(path): raise AssertionError('unchanged file was reparsed')
 m.parse_rollout=no_parse
 assert all(s['isEnded'] for s in scanner.scan(now+302)); assert db.read_bytes()==before
 m.parse_rollout=original
 c=sqlite3.connect(db); c.execute('insert into orchestration_v2_projection_subagents values (?,?,?)',('app-main',None,'{}')); c.commit(); c.close()
 assert 'codex-main' not in {s['sessionId'] for s in scanner.scan(now)}
 write('done',[start,done,start],age=-1)
 assert next(s for s in scanner.scan(now) if s['sessionId']=='codex-done')['agents'][0]['status']=='running'
 db.unlink(); assert scanner.scan(now)
 db.write_text('not sqlite'); assert scanner.scan(now)==[]
 print(json.dumps(result))
`

test('standalone scan parses mains, excludes CX/children, applies freshness and caches safely', () => {
  const ran = spawnSync('python3', ['-I', '-c', fixture, `${import.meta.dir}/codex_standalone.py`], { encoding: 'utf8' })
  expect(ran.stderr).toBe('')
  expect(ran.status).toBe(0)
  expect(JSON.parse(ran.stdout).length).toBe(6)
})

test('server serves the same web template before a Claude session starts', () => {
  const ran = spawnSync('python3', ['-I', '-c', String.raw`
import importlib.util,sys
spec=importlib.util.spec_from_file_location('server',sys.argv[1])
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.stdout.buffer.write(m.web_page())
`, `${import.meta.dir}/../server.py`], { encoding: 'utf8' })
  expect(ran.stderr).toBe('')
  expect(ran.status).toBe(0)
  expect(ran.stdout).toBe(WEB_PAGE)
})

test('a Codex root renders once and keeps its mtime status without a Claude heartbeat', () => {
  const order = new Function('agents', WEB_PAGE.slice(WEB_PAGE.indexOf('function order('), WEB_PAGE.indexOf('function edgeState(')) + '; return order(agents);')
  const agent = { id: 'main', kind: 'codex', status: 'running' }
  expect(order([agent])).toEqual([{ a: agent, d: 0, parent: null }])
  const info = new Function('s', 'now', 'SILENT', 'flagged', WEB_PAGE.slice(WEB_PAGE.indexOf('function sessionInfo('), WEB_PAGE.indexOf('function rowHtml(')) + '; return sessionInfo(s, now);')
  const state = info({ standaloneCodex: true, updatedAt: 0, agents: [agent] }, 60000, 20000, () => false)
  expect(state.ended).toBe(false)
  expect(state.silent).toBe(false)
  expect(state.run).toBe(0)
})
