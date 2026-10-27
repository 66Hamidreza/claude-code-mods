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
 assert set(byid)=={'codex-main','codex-done','codex-resumed','codex-stale','codex-raw','codex-yesterday','codex-old-day'},set(byid)
 main=byid['codex-main']['agents'][0]
 assert (main['model'],main['detail'],main['tokens'])==('gpt-6.1-sol','run bun test',1234)
 assert byid['codex-main']['name']=='PartoCloud'
 for id,status in [('main','running'),('done','done'),('resumed','running'),('stale','idle')]:
  assert byid['codex-'+id]['agents'][0]['status']==status
 original=m.parse_rollout
 def no_parse(path): raise AssertionError('unchanged file was reparsed')
 m.parse_rollout=no_parse
 assert all(s['isEnded'] == (s['agents'][0]['status']=='done') for s in scanner.scan(now+302)); assert db.read_bytes()==before
 assert next(s for s in scanner.scan(now+302) if s['sessionId']=='codex-main')['stale'] is True
 m.parse_rollout=original
 c=sqlite3.connect(db); c.execute('insert into orchestration_v2_projection_subagents values (?,?,?)',('app-main',None,'{}')); c.commit(); c.close()
 assert 'codex-main' not in {s['sessionId'] for s in scanner.scan(now)}
 write('done',[start,done,start],age=-1)
 assert next(s for s in scanner.scan(now) if s['sessionId']=='codex-done')['agents'][0]['status']=='running'
 db.unlink(); assert scanner.scan(now)
 last_good=scanner.scan(now); db.write_text('not sqlite'); assert scanner.scan(now)==last_good
 print(json.dumps(result))
`

test('standalone scan parses mains, excludes CX/children, applies freshness and caches safely', () => {
  const ran = spawnSync('python3', ['-I', '-c', fixture, `${import.meta.dir}/codex_standalone.py`], { encoding: 'utf8' })
  expect(ran.stderr).toBe('')
  expect(ran.status).toBe(0)
  expect(JSON.parse(ran.stdout).length).toBe(7)
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

test('a standalone Codex root renders once and counts main work', () => {
  const source = (name: string) => {
    const start = WEB_PAGE.indexOf(`function ${name}(`)
    const end = WEB_PAGE.indexOf('\nfunction ', start + 1)
    return WEB_PAGE.slice(start, end < 0 ? undefined : end)
  }
  const order = new Function('agents', source('order') + '; return order(agents);')
  const agent = { id: 'main', kind: 'codex', status: 'running' }
  expect(order([agent])).toEqual([{ a: agent, d: 0, parent: null }])
  const helpers = ['finiteNumber', 'stamp', 'nodes', 'isRunning', 'flagged', 'sessionInfo'].map(source).join('\n')
  const info = new Function('s', 'now', 'var SILENT=90000,issueEpisodes={},acknowledged={};' + helpers + '; return sessionInfo(s, now);')
  const state = info({ sessionId: 'codex-one', standaloneCodex: true, updatedAt: 0, agents: [agent] }, 60000)
  expect(state.ended).toBe(false)
  expect(state.silent).toBe(false)
  expect(state.run).toBe(1)
})

test('merged endpoint survives corrupt files, prunes old snapshots, and preserves legacy routes and stale usage', () => {
  const ran = spawnSync('python3', ['-I', '-c', String.raw`
import functools,http.client,importlib.util,json,os,pathlib,sys,tempfile,threading,time
spec=importlib.util.spec_from_file_location('server',sys.argv[1])
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as home:
 root=pathlib.Path(home); sessions=root/'sessions'; sessions.mkdir(); now=time.time()
 good={'sessionId':'claude-one','agents':[{'id':'main','status':'running'}],'updatedAt':123,'seq':3}
 (sessions/'good.json').write_text(json.dumps(good)); (sessions/'partial.json').write_text('{partial')
 (sessions/'wrong.json').write_text('[]'); (sessions/'old.json').write_text(json.dumps(good))
 os.utime(sessions/'old.json',(now-86401,now-86401))
 codex={'sessionId':'codex-one','agents':[],'updatedAt':456}
 m.codex_sessions_body=lambda:json.dumps([codex]).encode()
 merged=json.loads(m.sessions_body(root,now)); assert merged=={'serverNow':int(now*1000),'sessions':[good,codex]},merged
 assert not (sessions/'old.json').exists()
 stale=m.window('x','test',87,now-1,now,123,90)
 assert stale['usedPct']==87 and stale['stale'] is True and stale['asOf']==123 and stale['label']=='90-minute window',stale
 assert stale['resetAt']==int((now-1)*1000) and stale['rolledOver'] is True,stale
 fresh=m.window('x','test',40,now+1,now)
 assert fresh['stale'] is False and fresh['rolledOver'] is False and fresh['resetAt'] is None
 assert m.duration_label(120,'x')=='2-hour window'; assert m.duration_label(4320,'x')=='3-day window'
 m.HOME=home
 day=root/'.codex/sessions/2026/10/01'; day.mkdir(parents=True)
 (day/'rollout-usage.jsonl').write_text(json.dumps({'timestamp':'2026-10-01T00:00:00Z','payload':{'rate_limits':{
  'primary':{'window_minutes':120,'used_percent':73,'resets_at':now-1},
  'secondary':{'window_minutes':4320,'used_percent':20,'resets_at':now+100}}}})+'\n')
 usage=m.codex_usage(now); first,second=usage['windows']
 assert first['usedPct']==73 and first['stale'] is True and first['asOf']==usage['asOf']
 assert first['rolledOver'] is True and first['resetAt']==int((now-1)*1000),first
 assert (first['label'],second['label'])==('2-hour window','3-day window'),usage
 m.usage_body=lambda:json.dumps({'codex':usage}).encode()
 server=m.http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(m.Handler,directory=home))
 thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
 try:
  for route in ('/sessions.json','/sessions/','/codex-sessions.json','/usage.json'):
   conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3);conn.request('GET',route)
   response=conn.getresponse(); body=response.read(); assert response.status==200,(route,response.status)
   if route=='/sessions.json': assert {s['sessionId'] for s in json.loads(body)['sessions']}=={'claude-one','codex-one'}
   if route=='/sessions/': assert b'good.json' in body
   if route=='/codex-sessions.json': assert json.loads(body)==[codex]
   if route=='/usage.json': assert json.loads(body)['codex']['windows'][0]['usedPct']==73
   conn.close()
 finally:
  server.shutdown(); server.server_close(); thread.join()
`, `${import.meta.dir}/../server.py`], { encoding: 'utf8' })
  expect(ran.stderr).toBe('')
  expect(ran.status).toBe(0)
})


function webHelpers(names: string[]) {
  return names.map(name => {
    const start = WEB_PAGE.indexOf(`function ${name}(`)
    const next = WEB_PAGE.slice(start + 1).search(/\n(?:async )?function /)
    return WEB_PAGE.slice(start, next < 0 ? WEB_PAGE.indexOf('</script>', start) : start + 1 + next)
  }).join('\n')
}

test('session retention requires ten absent complete polls and a non-running snapshot older than 30m', () => {
  const run = new Function(webHelpers(['finiteNumber', 'stamp', 'nodes', 'isRunning', 'normalizedSnapshot', 'retainSnapshots', 'updateDedupe', 'dedupedSessions']) + `
    var now=10000000, serverNow=()=>now, pinned={}, lastGood=new Map(), confirmedMissing=new Map(), dedupeState=new Map(), sortState=new Map(), collectLinks=()=>{}, all=[];
    var old={sessionId:'old',updatedAt:now-1800001,agents:[],isEnded:true};
    retainSnapshots([old],true);
    for(var i=0;i<15;i++)retainSnapshots([old],true);
    if(!lastGood.has('old'))throw Error('An indexed session must remain');
    for(var i=0;i<9;i++)retainSnapshots([],true);
    if(!lastGood.has('old'))throw Error('Removed before ten polls');
    retainSnapshots([],false); if(confirmedMissing.get('old')!==9)throw Error('Partial poll advanced absence');
    retainSnapshots([],true); if(lastGood.has('old'))throw Error('Did not retire after ten polls');
    var recent={sessionId:'recent',updatedAt:now,agents:[]};
    var running={sessionId:'run',updatedAt:0,agents:[{id:'main',status:'running'}]};
    retainSnapshots([recent,running],true);
    for(var i=0;i<12;i++)retainSnapshots([],true);
    if(!lastGood.has('recent')||!lastGood.has('run'))throw Error('Lost recent or running session');
    now+=1800001;retainSnapshots([],true);
    if(lastGood.has('recent')||!lastGood.has('run'))throw Error('Age and running gates incorrect');
    return true;
  `)
  expect(run()).toBe(true)
})

test('T3 child dedupe requires five consecutive matching or missing polls', () => {
  const run = new Function(webHelpers(['nodes', 'updateDedupe', 'dedupedSessions']) + `
    var lastGood=new Map(),dedupeState=new Map(),pinned={};
    var child={sessionId:'child',t3:{threadId:'c',parentThreadId:'p'},agents:[]};
    var parent={sessionId:'parent',t3:{threadId:'p'},agents:[{id:'c'}]};
    lastGood.set('child',child);lastGood.set('parent',parent);
    var pair=[parent,child], absent=[{...parent,agents:[]},child];
    function visible(){return dedupedSessions(pair).includes(child)}
    for(var i=0;i<4;i++)updateDedupe(pair,true);
    if(!visible())throw Error('Child hidden before fifth match');
    updateDedupe(pair,false);if(!visible())throw Error('Partial poll advanced dedupe');
    updateDedupe(pair,true);if(visible())throw Error('Child not hidden at fifth match');
    for(var i=0;i<4;i++)updateDedupe(absent,true);
    if(visible())throw Error('Child unhidden before fifth absence');
    updateDedupe(pair,true);updateDedupe(absent,true);
    if(visible())throw Error('Missing streak did not reset');
    for(var i=0;i<4;i++)updateDedupe(absent,true);
    if(!visible())throw Error('Child not unhidden at fifth absence');
    return true;
  `)
  expect(run()).toBe(true)
})

test('All excludes old ended sessions while preserving recent, waiting, running and pinned sessions', () => {
  const run = new Function(webHelpers(['activeSession', 'filterMatch']) + `
    var pinned={pinned:true},old={run:0,ended:true,issues:[],age:1800001,codex:[]};
    if(filterMatch({sessionId:'old'},old,'all'))throw Error('Old ended session in All');
    if(!filterMatch({sessionId:'old'},old,'ended'))throw Error('Missing Ended count');
    for(var info of [{...old,age:5},{...old,ended:false},{...old,run:1}])
      if(!filterMatch({sessionId:'x'},info,'all'))throw Error('Active session excluded');
    if(!filterMatch({sessionId:'pinned'},old,'all'))throw Error('Pinned session excluded');
    return true;
  `)
  expect(run()).toBe(true)
})

test('session order ignores activity timestamp churn and debounces severity changes by five seconds', () => {
  const run = new Function(webHelpers(['finiteNumber', 'stamp', 'sessionName', 'orderedSessions']) + `
    var pinned={},sortState=new Map(),stableOrder=[],sortMode=null,infos=new Map([['a',{sev:2}],['b',{sev:2}]]);
    var a={sessionId:'a',updatedAt:100},b={sessionId:'b',updatedAt:50};
    function order(now){return orderedSessions([a,b],now,'sev').map(s=>s.sessionId).join('')}
    if(order(0)!=='ab')throw Error('Initial order');
    b.updatedAt=200;if(order(1000)!=='ab')throw Error('Timestamp reordered rows');
    infos.get('b').sev=3;if(order(2000)!=='ab'||order(6999)!=='ab')throw Error('Severity moved too soon');
    if(order(7000)!=='ba')throw Error('Severity did not move after debounce');
    infos.get('a').sev=3;order(8000);infos.get('a').sev=2;order(9000);
    if(order(14000)!=='ba')throw Error('Transient severity changed order');
    return true;
  `)
  expect(run()).toBe(true)
})

test('rollovers persist per-window epochs and notify once through the opt-in queue', () => {
  const run = new Function(webHelpers(['finiteNumber', 'validDate', 'windowReset', 'windowLabel', 'clock24', 'datedClock', 'observeResets']) + `
    var resetSeen={},resetLastSeen={},resetDismissed={},usageOpenedAt=0,resetNotices=new Map(),resetTitlePending=false,pendingAlerts=new Map(),alertMode='desktop',store={set:()=>{}},usageData={codex:{windows:[{id:'five_hour',usedPct:55,resetsAt:10}]}};
    observeResets(9000);if(resetNotices.size)throw Error('Future reset announced');
    observeResets(10000);if(resetNotices.size!==1||pendingAlerts.size!==1)throw Error('Rollover not announced');
    if(!resetTitlePending||!resetNotices.get('codex|five_hour').text.includes('Codex 5-hour window reset ✓'))throw Error('Notice details');
    pendingAlerts.clear();resetNotices.clear();observeResets(11000);
    if(pendingAlerts.size||resetNotices.size)throw Error('Reset repeated after dismissal/reload');
    resetSeen={'codex|five_hour':{epoch:20000,announced:10000}};
    usageData.codex.windows[0].resetsAt=40;observeResets(30000);
    if(resetNotices.get('codex|five_hour').epoch!==20000)throw Error('Reset since last visit missed');
    pendingAlerts.clear();alertMode='off';usageData.codex.windows[0].resetsAt=25;observeResets(30000);
    if(pendingAlerts.size)throw Error('Notification sent while Off');
    return true;
  `)
  expect(run()).toBe(true)
})
