import { compareAdvice } from './board'

// The browser board: a static page that polls each session's snapshot under sessions/.
export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Board</title>
<style>
:root {
  --bg: #f4f3ef; --panel: #ffffff; --sunk: #eceae4; --ink: #1c1b19; --muted: #6b6860; --line: #e0ddd5;
  --run: #1f8a5b; --wait: #b7791f; --done: #8a877f; --fail: #c2412d;
  --run-bg: #e3f3ea; --wait-bg: #f8eed9; --fail-bg: #f8e3df;
  --opus: #3b4cff; --sonnet: #00b8ad; --haiku: #ff7a14; --cx: #ff1fa8; --none: #8a877f;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #111210; --panel: #1a1b19; --sunk: #232421; --ink: #ecebe6; --muted: #9a978f; --line: #2c2d2a;
    --run: #4cc38a; --wait: #e0a43c; --done: #77756e; --fail: #ef6a54;
    --run-bg: #17301f; --wait-bg: #33280f; --fail-bg: #351914;
    --opus: #6e7dff; --sonnet: #19f0e0; --haiku: #ff9a3d; --cx: #ff3ec0; --none: #77756e; color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #111210; --panel: #1a1b19; --sunk: #232421; --ink: #ecebe6; --muted: #9a978f; --line: #2c2d2a;
  --run: #4cc38a; --wait: #e0a43c; --done: #77756e; --fail: #ef6a54;
  --run-bg: #17301f; --wait-bg: #33280f; --fail-bg: #351914;
  --opus: #6e7dff; --sonnet: #19f0e0; --haiku: #ff9a3d; --cx: #ff3ec0; --none: #77756e; color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 20px 16px 48px; display: grid; gap: 18px; }
h1 { font-size: 18px; margin: 0; font-weight: 650; letter-spacing: -.01em; }
h2 { font-size: 11px; margin: 0 0 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.note { color: var(--muted); font-size: 12px; margin: 0; }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.live i { width: 7px; height: 7px; border-radius: 50%; background: var(--run); animation: beat 1.6s ease-in-out infinite; }
.live.stale i { background: var(--done); animation: none; }
.filters { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.f, .alerts { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.f b { font-weight: 500; font-variant-numeric: tabular-nums; color: var(--muted); }
.f[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.f[aria-pressed="true"] b { color: inherit; opacity: .7; }
.search, .sel { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); }
.search { width: 200px; max-width: 100%; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--run); outline-offset: 2px; }
.attn { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
.a { all: unset; box-sizing: border-box; cursor: pointer; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: grid; gap: 3px; min-width: 0; }
.a:focus-visible { outline: 2px solid var(--run); outline-offset: 2px; }
.a.fail { background: var(--fail-bg); border-color: color-mix(in srgb, var(--fail) 35%, var(--line)); }
.a.wait { background: var(--wait-bg); border-color: color-mix(in srgb, var(--wait) 35%, var(--line)); }
.a .k { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.a.fail .k { color: var(--fail); } .a.wait .k { color: var(--wait); }
.a .who { font-weight: 500; overflow-wrap: anywhere; }
.a .why { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; font-size: 12px; color: var(--muted); }
.legend .g { display: inline-flex; align-items: center; gap: 6px; }
.sw { display: inline-block; width: 16px; height: 10px; border-radius: 3px; background: color-mix(in srgb, var(--fam) var(--mix, 100%), var(--panel)); }
.sw.sq { width: 10px; border-radius: 2px; }
.sess { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.sess[hidden] { display: none; }
.sess.ended { opacity: .72; }
.sess-head { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; padding: 14px 16px 8px; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; align-items: start; }
.sess-head .title { font-size: 16px; font-weight: 620; letter-spacing: -.01em; overflow-wrap: anywhere; }
.sess-head .cwd { grid-column: 1; font: 12px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; grid-row: 1 / span 2; grid-column: 2; }
.chip { font-size: 12px; padding: 2px 9px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.chip.run { color: var(--run); background: var(--run-bg); border-color: transparent; }
.chip.wait { color: var(--wait); background: var(--wait-bg); border-color: transparent; }
.chip.live-on { color: var(--run); background: var(--run-bg); border-color: transparent; display: inline-flex; align-items: center; gap: 6px; }
.chip.live-on::before, .chip.live-idle::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.chip.live-on::before { animation: beat 1.2s ease-in-out infinite; }
.chip.live-idle { color: var(--wait); background: var(--wait-bg); border-color: transparent; display: inline-flex; align-items: center; gap: 6px; }
.alerts.off { color: var(--fail); }
.chip.fail { color: var(--fail); background: var(--fail-bg); border-color: transparent; }
.chev { transition: transform .15s ease; display: inline-block; margin-right: 6px; color: var(--muted); }
.sess.closed .chev { transform: rotate(-90deg); }
.sess.closed .inner { display: none; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 0 16px 8px; font-size: 12px; color: var(--muted); }
.tools .id { font: 11px var(--mono); }
.mini { font: inherit; font-size: 12px; padding: 2px 9px; border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer; }
.mini:hover { background: var(--sunk); }
.mini[aria-pressed="true"] { border-color: var(--wait); color: var(--wait); }
.mini:disabled { opacity: .5; cursor: default; }
.pulse { padding: 0 16px 12px; display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
.sp { position: relative; height: 36px; }
.sp svg { width: 100%; height: 36px; display: block; }
.sp i { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--run); right: 0; transform: translate(0, -50%); }
.stat { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; justify-content: flex-end; }
.stat b { color: var(--ink); font-weight: 500; }
.body { display: grid; grid-template-columns: minmax(0, 1fr) 280px; border-top: 1px solid var(--line); }
.tree { padding: 6px 0; min-width: 0; position: relative; }
svg.edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.e { fill: none; stroke-width: 2; stroke-linecap: round; }
.e.off { stroke: var(--line); stroke-dasharray: 2 4; }
.e.on { stroke-dasharray: 5 4; animation: flow .7s linear infinite; filter: drop-shadow(0 0 2px color-mix(in srgb, currentColor 60%, transparent)); }
.e.hold { stroke-dasharray: none; }
.e.fade { opacity: .45; stroke-dasharray: none; }
.row { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 2px 12px; padding: 8px 16px 8px calc(20px + var(--d, 0) * 30px); position: relative; --mix: 100%; --fam: var(--none); }
.row::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: color-mix(in srgb, var(--fam) var(--mix), var(--panel)); box-shadow: 0 0 6px color-mix(in srgb, var(--fam) calc(var(--mix) * .45), transparent); }
.row + .row { border-top: 1px solid color-mix(in srgb, var(--line) 55%, transparent); }
.row:hover { background: var(--sunk); }
.row.flash { background: color-mix(in srgb, var(--fam) 16%, transparent); }
.t1 { --mix: 100%; } .t2 { --mix: 66%; } .t3 { --mix: 40%; }
.opus { --fam: var(--opus); } .sonnet { --fam: var(--sonnet); } .haiku { --fam: var(--haiku); } .codex { --fam: var(--cx); }
.codex::after { background: repeating-linear-gradient(180deg, var(--cx) 0 5px, transparent 5px 8px) !important; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--done); margin-top: 6px; position: relative; }
.running .dot { background: var(--run); box-shadow: 0 0 5px var(--run); }
.running .dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid var(--run); animation: ring 1.6s ease-out infinite; }
.waiting .dot, .idle .dot { background: var(--wait); } .failed .dot { background: var(--fail); }
.codex .dot { border-radius: 2px; }
.name { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; min-width: 0; }
.name b { font-weight: 500; overflow-wrap: anywhere; }
.badge { font: 600 10.5px var(--mono); padding: 1px 6px; border-radius: 4px; letter-spacing: .02em; color: var(--fam); background: color-mix(in srgb, var(--fam) 14%, var(--panel)); border: 1px solid color-mix(in srgb, var(--fam) calc(var(--mix) * .7), transparent); box-shadow: 0 0 6px -2px color-mix(in srgb, var(--fam) calc(var(--mix) * .35), transparent); }
.doing { grid-column: 2; font: 12.5px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.running .doing { color: var(--ink); }
.flag { grid-column: 2; font-size: 12.5px; font-weight: 500; color: var(--fail); overflow-wrap: anywhere; }
.flag.wait { color: var(--wait); }
.nums { grid-row: 1 / span 3; grid-column: 3; text-align: right; font: 12px var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; display: grid; gap: 2px; align-content: start; }
.nums .t { color: var(--ink); }
.bar-tok { height: 3px; width: 64px; background: var(--sunk); border-radius: 2px; overflow: hidden; justify-self: end; margin-top: 2px; }
.bar-tok i { display: block; height: 100%; background: color-mix(in srgb, var(--fam) var(--mix), var(--panel)); }
.over { grid-column: 2; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
.done-row .name b, .done-row .doing { opacity: .7; }
.feedcol { border-left: 1px solid var(--line); padding: 12px 16px; background: color-mix(in srgb, var(--sunk) 35%, transparent); min-width: 0; }
.feed { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.feed li { display: grid; grid-template-columns: 38px 1fr; gap: 8px; font-size: 12.5px; color: var(--muted); }
.feed time { font: 11px var(--mono); padding-top: 1px; }
.feed .done { color: var(--run); } .feed .warn { color: var(--wait); } .feed .fail { color: var(--fail); }
.feed span { overflow-wrap: anywhere; }
.jump { all: unset; cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.jump:hover { text-decoration: underline; }
.jump:focus-visible { outline: 2px solid var(--run); outline-offset: 2px; }
.acts { display: grid; gap: 6px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); justify-items: start; }
.nomatch, .empty { padding: 36px 16px; text-align: center; color: var(--muted); background: var(--panel); border: 1px dashed var(--line); border-radius: 12px; }
@keyframes beat { 50% { opacity: .35; } }
@keyframes flow { to { stroke-dashoffset: -9; } }
@keyframes ring { from { transform: scale(1); opacity: .9; } to { transform: scale(2.6); opacity: 0; } }
@media (max-width: 760px) {
  .body { grid-template-columns: minmax(0, 1fr); }
  .feedcol { border-left: 0; border-top: 1px solid var(--line); }
  .filters { margin-left: 0; }
  .sess-head { grid-template-columns: 1fr; }
  .chips { grid-row: auto; grid-column: 1; justify-content: flex-start; }
  .pulse { grid-template-columns: 1fr; }
  .stat { justify-content: flex-start; }
  .row { grid-template-columns: 14px minmax(0, 1fr); padding-left: calc(18px + var(--d, 0) * 22px); }
  .nums { grid-row: auto; grid-column: 2; display: flex; gap: 10px; text-align: left; }
  .bar-tok { display: none; }
}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <h1>Agent board</h1>
    <span class="live" id="live" role="status"><i></i><span id="status">connecting</span></span>
    <button class="alerts" id="alerts">Enable alerts</button>
    <input class="search" id="q" type="search" placeholder="Search title, folder, status" aria-label="Search sessions">
    <select class="sel" id="sort" aria-label="Sort sessions"><option value="sev">Needs attention first</option><option value="recent">Most recent</option><option value="name">Title</option></select>
    <div class="filters" id="filters" role="group" aria-label="Filter sessions"></div>
  </div>
  <section id="attnbox" aria-label="Needs attention" hidden><h2 id="attnh"></h2><div class="attn" id="attn"></div></section>
  <div class="legend" id="legend" aria-label="Legend"></div>
  <div id="board"><div class="empty">Waiting for sessions with the agent-board mod…</div></div>
  <div class="nomatch" id="nomatch" hidden>No sessions match. Clear the search or pick All.</div>
</div>
<script>
var compareAdvice = ${compareAdvice.toString()};
var SILENT = 20000, LIVE = 300000;
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var clip = function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
var dur = function (ms) { var s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + 's'; var m = Math.floor(s / 60); return m < 60 ? m + 'm ' + String(s % 60).padStart(2, '0') + 's' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
var tok = function (n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n || 0); };
var store = {
  get: function (k, d) { try { var v = localStorage.getItem('ab.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('ab.' + k, JSON.stringify(v)); } catch (e) {} }
};
var pinned = store.get('pinned', {}), folded = store.get('closed', {}), clearedNodes = {}, clearedAt = store.get('clearedAt', {});
var filter = 'all', all = [];

// Model family + version from whatever string the session reports ("claude-opus-4-1-2025…", "opus", "claude-3-5-sonnet").
function parseModel(raw) {
  var m = String(raw || '').toLowerCase(), fam = null, i;
  var names = ['opus', 'sonnet', 'haiku'];
  for (i = 0; i < names.length; i++) if (m.indexOf(names[i]) > -1) fam = names[i];
  if (!fam) return { fam: null, ver: 0, label: '' };
  var a = m.match(new RegExp(fam + '[-_ ]?(\\\\d{1,2})(?:[-._](\\\\d{1,2})(?!\\\\d))?')), b = m.match(new RegExp('(\\\\d{1,2})(?:[-._](\\\\d{1,2}))?[-_ ]' + fam));
  var hit = a || b, major = hit ? +hit[1] : 0, minor = hit && hit[2] ? +hit[2] : 0;
  return { fam: fam, ver: hit ? major * 100 + minor : 0, label: fam[0].toUpperCase() + fam.slice(1) + (hit ? ' ' + major + (hit[2] ? '.' + minor : '') : '') };
}
function modelClass(a, best) {
  var eff = a.t3 && a.t3.effort ? ' · ' + a.t3.effort : '';
  if (a.kind === 'codex') return { cls: 'codex t' + (a.status === 'done' || a.status === 'failed' ? 3 : 1), label: a.t3 ? clip(a.model, 22) + eff : 'Codex' };
  var p = parseModel(a.model);
  if (!p.fam) return { cls: 't1', label: a.model ? clip(a.model, 18) : '' };
  var top = best[p.fam] || p.ver, tier = !p.ver ? 2 : p.ver === top ? 1 : Math.floor(p.ver / 100) === Math.floor(top / 100) ? 2 : 3;
  return { cls: p.fam + ' t' + tier, label: p.label + eff };
}
function bestVersions(sessions) {
  var best = {};
  sessions.forEach(function (s) { (s.agents || []).forEach(function (a) { var p = parseModel(a.model); if (p.fam && p.ver > (best[p.fam] || 0)) best[p.fam] = p.ver; }); });
  return best;
}
function order(agents) {
  var ids = new Set(agents.map(function (a) { return a.id; })), kids = new Map(), out = [];
  agents.forEach(function (a) { if (a.kind !== 'main') { var p = ids.has(a.parentId) ? a.parentId : 'main'; kids.set(p, (kids.get(p) || []).concat([a])); } });
  var walk = function (a, d, parent) { out.push({ a: a, d: d, parent: parent }); (kids.get(a.id) || []).forEach(function (k) { walk(k, d + 1, a.id); }); };
  var main = agents.find(function (a) { return a.kind === 'main'; }); if (main) walk(main, 0, null);
  return out;
}
function edgeState(a) {
  if (a.status === 'done' || a.status === 'failed') return 'done';
  if (a.status !== 'running') return 'idle';
  if (a.kind === 'codex' && a.codex && (a.codex.lastMessage || a.codex.isComplete)) return 'recv';
  return 'send';
}
function stateChip(s, info) {
  if (info.silent || info.ended) return '';
  var main = info.agents.find(function (a) { return a.kind === 'main'; });
  return main && main.status === 'running' ? '<span class="chip live-on">working</span>' : '<span class="chip live-idle">idle, waiting for you</span>';
}
function flagged(a) { return a.health && a.health !== 'ok' && a.health !== 'idle'; }
function sessionInfo(s, now) {
  var agents = s.agents || [], stale = now - s.updatedAt > SILENT, working = agents.some(function (a) { return a.status === 'running'; });
  var ended = !!s.isEnded || now - s.updatedAt > 15000, silent = !s.isEnded && stale && working;
  var run = agents.filter(function (a) { return a.kind !== 'main' && a.status === 'running'; }).length;
  var fail = agents.filter(function (a) { return a.status === 'failed'; }).length;
  var warn = agents.filter(flagged);
  var codex = agents.filter(function (a) { return a.kind === 'codex'; });
  var sev = warn.length || fail || silent ? 3 : run || agents.some(function (a) { return a.status === 'running'; }) ? 2 : ended ? 0 : 1;
  return { agents: agents, ended: ended, silent: silent, run: run, fail: fail, warn: warn, codex: codex, sev: sev };
}

function rowHtml(r, best, now, ended) {
  var a = r.a, mc = modelClass(a, best), end = a.endedAt || now, over = a.status === 'done' || a.status === 'failed';
  var doing = a.tool ? a.tool + (a.detail ? ' · ' + a.detail : '') : a.t3 ? (over ? (a.t3.result || a.status) : 'working') : a.kind === 'codex' ? (a.detail || 'starting') : a.status;
  var fl = flagged(a), st = a.status;
  var third = a.codex && over && a.codex.summary ? a.codex.summary : a.codex ? a.codex.files.length + ' files' + (a.codex.tasks.length ? ' · ' + a.codex.tasks.join(', ') : '') : '';
  var line = over ? [a.t3 ? '' : a.tools + (a.kind === 'codex' ? ' cmds' : ' tools'), a.errors ? a.errors + ' err' : '', a.tokens ? tok(a.tokens) : '', dur(end - a.startedAt)].filter(Boolean).join(' · ') : doing;
  var pct = Math.max(2, Math.min(100, Math.round((a.tokens || 0) / (a.kind === 'codex' ? 1200000 : 300000) * 100)));
  return '<div class="row ' + mc.cls + ' ' + esc(st) + (over ? ' done-row' : '') + '" style="--d:' + r.d + '" data-id="' + esc(a.id) + '"' + (r.parent ? ' data-p="' + esc(r.parent) + '" data-edge="' + edgeState(a) + '"' : '') + ' title="' + esc(a.label + '\\n' + (a.healthNote || '') + (a.codex && a.codex.summary ? '\\n' + a.codex.summary : '')) + '">' +
    '<i class="dot"></i><span class="name"><b>' + esc(clip(a.label, 70)) + '</b>' + (mc.label ? '<span class="badge">' + esc(mc.label) + '</span>' : '') + '</span>' +
    '<span class="doing">' + esc(clip(line, 140)) + '</span>' +
    (fl ? '<span class="flag' + (a.health === 'approval' ? ' wait' : '') + '">' + esc(clip(a.healthNote || a.health, 120)) + '</span>' : third && !over ? '<span class="over">' + esc(clip(third, 120)) + '</span>' : over && third ? '<span class="over">' + esc(clip(third, 120)) + '</span>' : '') +
    '<span class="nums"><span class="t">' + dur(end - a.startedAt) + '</span>' + (a.tokens ? '<span>' + tok(a.tokens) + '</span><span class="bar-tok"><i style="width:' + pct + '%"></i></span>' : '') + '</span></div>';
}
function spark(values) {
  var v = values.length ? values : [0], top = Math.max(1, Math.max.apply(null, v)), n = v.length;
  var pt = function (y, i) { return (n === 1 ? 0 : (i / (n - 1)) * 300).toFixed(1) + ',' + (32 - (y / top) * 26).toFixed(1); };
  var pts = v.map(pt), last = v[n - 1], topPct = ((32 - (last / top) * 26) / 36 * 100).toFixed(1);
  return '<div class="sp"><svg viewBox="0 0 300 36" preserveAspectRatio="none" role="img" aria-label="Running agents over the last ' + n + ' seconds"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--run)" stop-opacity=".32"/><stop offset="1" stop-color="var(--run)" stop-opacity="0"/></linearGradient></defs><line x1="0" y1="35" x2="300" y2="35" stroke="var(--line)"/><path d="M0,35 L' + pts.join(' L') + ' L300,35 Z" fill="url(#sg)"/><polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--run)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg><i style="top:' + topPct + '%"></i></div>';
}
function eventsFor(s) {
  var cut = clearedAt[s.sessionId] || 0;
  return (s.events || []).filter(function (e) { return e.at > cut; }).slice(-8).reverse();
}
function adviceChip(s, now) {
  var a = s.advice;
  if (!a || now - a.at > 21600000 || a.at > now) return '';
  var c = compareAdvice(a, s.agents || []);
  var title = a.reason + '\\n' + a.parts.map(function (p) { return p.title + ': ' + p.executor + ' · ' + p.model + (p.effort ? ' · ' + p.effort : ''); }).join('\\n');
  var mode = a.mode === 'parallel' ? 'parallel ×' + a.parts.length + ' (' + c.advisedParallel + ' claude · <span style="color:var(--cx)">' + c.advisedCodex + ' codex</span>)' : 'single';
  var cls = c.verdict === 'under' || c.verdict === 'over' ? 'wait' : 'run';
  return '<span class="chip ' + cls + '" dir="ltr" style="unicode-bidi:isolate;max-width:100%;overflow:hidden;text-overflow:ellipsis" title="' + esc(title) + '">advice: ' + mode + ' → ran ' + c.actualAgents + ' agents · <span style="color:var(--cx)">' + c.actualCodex + ' codex</span> [' + esc(c.verdict) + ']</span>';
}
function parts(s, info, best, now) {
  var gone = clearedNodes[s.sessionId] || {}, agents = info.agents;
  var rows = order(agents).filter(function (r) { return !gone[r.a.id]; });
  var begin = Math.min.apply(null, agents.map(function (a) { return a.startedAt || now; }).concat([now]));
  var claude = 0, cx = 0, calls = 0;
  agents.forEach(function (a) { if (a.kind === 'codex') cx += a.tokens || 0; else claude += a.tokens || 0; calls += a.tools || 0; });
  var title = s.title || s.name, nAgents = Math.max(0, agents.length - 1);
  var head = '<span class="title"><span class="chev">▾</span>' + esc(title) + '</span><span class="cwd">' + esc(s.cwd) + '</span><span class="chips">' + stateChip(s, info) + adviceChip(s, now) +
    (info.run ? '<span class="chip run">' + info.run + ' running</span>' : '') +
    (info.warn.length ? '<span class="chip fail">' + info.warn.length + ' need a look</span>' : '') +
    (info.fail ? '<span class="chip fail">' + info.fail + ' failed</span>' : '') +
    '<span class="chip">' + nAgents + (nAgents === 1 ? ' agent' : ' agents') + '</span>' +
    (info.codex.length ? '<span class="chip">' + info.codex.length + ' Codex</span>' : '') +
    (info.silent ? '<span class="chip fail">no heartbeat ' + dur(now - s.updatedAt) + '</span>' : info.ended ? '<span class="chip">ended</span>' : '') + '</span>';
  var tools = '<button class="mini pin" aria-pressed="' + (!!pinned[s.sessionId]) + '">' + (pinned[s.sessionId] ? '★ Pinned' : '☆ Pin') + '</button><span class="id">#' + esc(String(s.sessionId).slice(0, 4)) + '</span><button class="mini copy" data-path="' + esc(s.cwd) + '">Copy path</button>';
  var pulse = spark(s.activity || []) + '<div class="stat"><span><b>' + dur((info.ended ? s.updatedAt : now) - begin) + '</b> elapsed</span><span><b>' + tok(claude + cx) + '</b> tokens (Claude ' + tok(claude) + (cx ? ' · Codex ' + tok(cx) : '') + ')</span><span><b>' + calls + '</b> tool calls</span></div>';
  var tree = rows.map(function (r) { return rowHtml(r, best, now, info.ended); }).join('');
  var feed = eventsFor(s).map(function (ev) {
    var known = ev.nodeId && rows.some(function (r) { return r.a.id === ev.nodeId; });
    var cls = ev.level === 'info' ? '' : ev.level;
    return '<li class="' + esc(cls) + '"><time>' + esc(new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })) + '</time><span>' + (known ? '<button class="jump" data-go="' + esc(ev.nodeId) + '">' + esc(ev.text) + '</button>' : esc(ev.text)) + '</span></li>';
  }).join('') || '<li><time></time><span class="note">No events yet.</span></li>';
  return { head: head, tools: tools, pulse: pulse, tree: tree, feed: feed };
}

function drawEdges(tree) {
  var old = tree.querySelector('svg.edges'); if (old) old.remove();
  var rows = {}; tree.querySelectorAll('.row[data-id]').forEach(function (r) { rows[r.dataset.id] = r; });
  var box = tree.getBoundingClientRect(); if (!box.height) return;
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'edges'); svg.setAttribute('aria-hidden', 'true');
  var mid = 'ah' + Math.random().toString(36).slice(2, 7), defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<marker id="' + mid + '" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L7 3.5L0 7z" fill="context-stroke"/></marker>';
  svg.appendChild(defs);
  var dot = function (r) { var b = r.querySelector('.dot').getBoundingClientRect(); return { x: b.left - box.left + b.width / 2, y: b.top - box.top + b.height / 2 }; };
  var lit = [], quiet = [];
  Object.keys(rows).forEach(function (id) {
    var r = rows[id], pid = r.dataset.p; if (!pid || !rows[pid]) return;
    var P = dot(rows[pid]), C = dot(r), st = r.dataset.edge || 'idle', col = getComputedStyle(r).getPropertyValue('--fam');
    var dx = P.x - 2, rx = P.x + 4, ty = C.y - 3, by = C.y + 3, q = 5;
    var down = 'M' + dx + ' ' + (P.y + 7) + 'V' + (ty - q) + 'Q' + dx + ' ' + ty + ' ' + (dx + q) + ' ' + ty + 'H' + (C.x - 8);
    var up = 'M' + (C.x - 8) + ' ' + by + 'H' + (rx + q) + 'Q' + rx + ' ' + by + ' ' + rx + ' ' + (by - q) + 'V' + (P.y + 8);
    var mk = function (d, cls) { var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('class', 'e ' + cls); if (cls !== 'off') { p.setAttribute('stroke', col); p.style.color = col; } p.setAttribute('marker-end', 'url(#' + mid + ')'); return p; };
    if (st === 'send') { quiet.push(mk(up, 'off')); lit.push(mk(down, 'on')); }
    else if (st === 'recv') { lit.push(mk(down, 'hold')); lit.push(mk(up, 'on')); }
    else if (st === 'done') { quiet.push(mk(down, 'fade')); quiet.push(mk(up, 'fade')); }
    else { quiet.push(mk(down, 'off')); quiet.push(mk(up, 'off')); }
  });
  quiet.concat(lit).forEach(function (p) { svg.appendChild(p); });
  tree.appendChild(svg);
}

function sectionFor(s) {
  var el = document.createElement('section'); el.id = 'sess-' + s.sessionId; el.className = 'sess'; el.dataset.sid = s.sessionId;
  el.innerHTML = '<button class="sess-head" aria-expanded="true"></button><div class="inner"><div class="tools"></div><div class="pulse"></div><div class="body"><div class="tree" role="list"></div><aside class="feedcol" aria-label="Recent events"><h2>Timeline</h2><ul class="feed"></ul><div class="acts"><button class="mini clr-nodes">Clear finished agents</button><button class="mini clr-hist">Clear history</button><p class="note">Clearing finished agents keeps the timeline, so you still see what went wrong.</p></div></aside></div></div>';
  return el;
}
function setHtml(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; return true; } return false; }

function render() {
  var now = Date.now(), live = all.filter(function (s) { return now - s.updatedAt < LIVE; });
  // A T3 child thread already shows as a node under its parent thread's session.
  var threads = {}; live.forEach(function (s) { if (s.t3) threads[s.t3.threadId] = 1; });
  live = live.filter(function (s) { return !(s.t3 && s.t3.parentThreadId && threads[s.t3.parentThreadId]); });
  var infos = new Map(); live.forEach(function (s) { infos.set(s.sessionId, sessionInfo(s, now)); });
  var best = bestVersions(live), board = document.getElementById('board');
  if (!live.length) { board.innerHTML = '<div class="empty">No live sessions. Start one with the agent-board mod loaded.</div>'; document.getElementById('attnbox').hidden = true; renderFilters(infos, live); return; }
  if (board.querySelector('.empty')) board.innerHTML = '';
  var q = document.getElementById('q').value.trim().toLowerCase(), mode = document.getElementById('sort').value;
  var sorted = live.slice().sort(function (a, b) {
    var pa = pinned[a.sessionId] ? 1 : 0, pb = pinned[b.sessionId] ? 1 : 0; if (pa !== pb) return pb - pa;
    if (mode === 'name') return String(a.title || a.name).localeCompare(String(b.title || b.name));
    if (mode === 'recent') return b.updatedAt - a.updatedAt;
    return infos.get(b.sessionId).sev - infos.get(a.sessionId).sev || b.updatedAt - a.updatedAt;
  });
  var shown = 0, existing = {};
  board.querySelectorAll('.sess').forEach(function (el) { existing[el.dataset.sid] = el; });
  Object.keys(existing).forEach(function (id) { if (!infos.has(id)) existing[id].remove(); });
  sorted.forEach(function (s, i) {
    var info = infos.get(s.sessionId), el = existing[s.sessionId] || sectionFor(s), p = parts(s, info, best, now);
    var isClosed = s.sessionId in folded ? folded[s.sessionId] : info.ended;
    el.classList.toggle('closed', !!isClosed); el.classList.toggle('ended', info.ended);
    el.querySelector('.sess-head').setAttribute('aria-expanded', String(!isClosed));
    setHtml(el.querySelector('.sess-head'), p.head); setHtml(el.querySelector('.tools'), p.tools);
    setHtml(el.querySelector('.pulse'), p.pulse); setHtml(el.querySelector('.feed'), p.feed);
    var tree = el.querySelector('.tree');
    if (setHtml(tree, p.tree) || !tree.querySelector('svg.edges')) { if (!isClosed) drawEdges(tree); }
    var hay = ((s.title || '') + ' ' + s.name + ' ' + s.cwd + ' ' + (info.warn.length ? 'attention looping stalled approval' : '') + (info.run ? ' running' : '') + (info.codex.length ? ' codex' : '') + (info.ended ? ' ended' : '')).toLowerCase();
    var ok = (filter === 'all' || (filter === 'attn' && info.sev === 3) || (filter === 'run' && info.run > 0) || (filter === 'codex' && info.codex.length > 0) || (filter === 'ended' && info.ended)) && (!q || hay.indexOf(q) > -1);
    el.hidden = !ok; if (ok) shown++;
    if (board.children[i] !== el) board.insertBefore(el, board.children[i] || null);
  });
  document.getElementById('nomatch').hidden = shown > 0;
  renderFilters(infos, live); renderAttention(infos, live, now); renderLegend(best);
}
function renderFilters(infos, live) {
  var c = { all: live.length, attn: 0, run: 0, codex: 0, ended: 0 };
  live.forEach(function (s) { var i = infos.get(s.sessionId); if (i.sev === 3) c.attn++; if (i.run) c.run++; if (i.codex.length) c.codex++; if (i.ended) c.ended++; });
  var names = [['all', 'All'], ['attn', 'Needs attention'], ['run', 'Running'], ['codex', 'Codex'], ['ended', 'Ended']];
  setHtml(document.getElementById('filters'), names.map(function (n) { return '<button class="f" data-f="' + n[0] + '" aria-pressed="' + (filter === n[0]) + '">' + n[1] + ' <b>' + c[n[0]] + '</b></button>'; }).join(''));
}
function renderAttention(infos, live, now) {
  var items = [];
  live.forEach(function (s) {
    var info = infos.get(s.sessionId), title = s.title || s.name;
    info.warn.forEach(function (a) { items.push({ cls: a.health === 'approval' ? 'wait' : 'fail', k: a.health === 'approval' ? 'Waiting for approval' : a.health === 'looping' ? 'Looping' : 'Stalled', who: a.label, why: title + (a.healthNote ? ' · ' + a.healthNote : ''), sid: s.sessionId, id: a.id }); });
    info.agents.filter(function (a) { return a.status === 'failed'; }).forEach(function (a) { items.push({ cls: 'fail', k: 'Failed', who: a.label, why: title, sid: s.sessionId, id: a.id }); });
    if (info.silent && now - s.updatedAt < 600000 && info.agents.some(function (a) { return a.status === 'running'; })) items.push({ cls: 'fail', k: 'No heartbeat', who: title, why: 'Silent for ' + dur(now - s.updatedAt) + ' while working', sid: s.sessionId, id: '' });
  });
  var box = document.getElementById('attnbox'); box.hidden = !items.length;
  document.getElementById('attnh').textContent = 'Needs attention · ' + items.length;
  setHtml(document.getElementById('attn'), items.map(function (x) { return '<button class="a ' + x.cls + '" data-sid="' + esc(x.sid) + '" data-go="' + esc(x.id) + '"><span class="k">' + esc(x.k) + '</span><span class="who">' + esc(clip(x.who, 80)) + '</span><span class="why">' + esc(clip(x.why, 140)) + '</span></button>'; }).join(''));
}
function renderLegend(best) {
  var g = function (f, label) { return '<span class="g ' + f + '"><span class="sw t1" style="--fam:var(--' + f + ')"></span><span class="sw t2" style="--fam:var(--' + f + ');--mix:66%"></span><span class="sw t3" style="--fam:var(--' + f + ');--mix:40%"></span>' + label + '</span>'; };
  var v = function (f) { return best[f] ? ' ' + Math.floor(best[f] / 100) + '.' + (best[f] % 100) : ''; };
  setHtml(document.getElementById('legend'), g('opus', 'Opus' + v('opus')) + g('sonnet', 'Sonnet' + v('sonnet')) + g('haiku', 'Haiku' + v('haiku')) +
    '<span class="g"><span class="sw sq" style="--fam:var(--cx)"></span>Codex</span><span>Newest version is strongest, older fade. Arrow down = task sent, arrow up = answer returning.</span>');
}

function jumpTo(sid, nodeId) {
  var sec = document.getElementById('sess-' + sid); if (!sec) return;
  if (sec.classList.contains('closed')) { folded[sid] = false; store.set('closed', folded); render(); }
  var r = nodeId && sec.querySelector('.row[data-id="' + (window.CSS && CSS.escape ? CSS.escape(nodeId) : nodeId) + '"]') || sec;
  r.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (r.classList.contains('row')) { r.classList.add('flash'); setTimeout(function () { r.classList.remove('flash'); }, 1400); }
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('button'); if (!t) return;
  var sec = t.closest('.sess'), sid = sec && sec.dataset.sid;
  if (t.classList.contains('sess-head')) { var c = !sec.classList.contains('closed'); folded[sid] = c; store.set('closed', folded); sec.classList.toggle('closed', c); t.setAttribute('aria-expanded', String(!c)); if (!c) drawEdges(sec.querySelector('.tree')); return; }
  if (t.classList.contains('pin')) { pinned[sid] = !pinned[sid]; store.set('pinned', pinned); render(); return; }
  if (t.classList.contains('copy')) { var txt = t.dataset.path, done = function () { t.textContent = 'Copied'; setTimeout(function () { t.textContent = 'Copy path'; }, 1200); }; try { navigator.clipboard.writeText(txt).then(done, done); } catch (x) { done(); } return; }
  if (t.classList.contains('clr-nodes')) { var s = all.find(function (x) { return x.sessionId === sid; }); clearedNodes[sid] = clearedNodes[sid] || {}; ((s && s.agents) || []).forEach(function (a) { if (a.status === 'done' || a.status === 'failed') clearedNodes[sid][a.id] = 1; }); render(); return; }
  if (t.classList.contains('clr-hist')) { clearedAt[sid] = Date.now(); store.set('clearedAt', clearedAt); render(); return; }
  if (t.dataset.f) { filter = t.dataset.f; render(); return; }
  if (t.dataset.go !== undefined) jumpTo(t.dataset.sid || sid, t.dataset.go);
});
document.getElementById('q').addEventListener('input', render);
document.getElementById('sort').addEventListener('change', render);
window.addEventListener('resize', function () { document.querySelectorAll('.sess:not(.closed) .tree').forEach(drawEdges); });

// Browser alerts: each new done / warn / fail event once, and a session that stops heartbeating mid-work.
var seen = new Set(), silentSeen = new Set(), lastAlert = new Map(), primed = false;
var alertsBtn = document.getElementById('alerts');
function beep() {
  try {
    var C = window.AudioContext || window.webkitAudioContext, c = new C(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.18);
  } catch (e) {}
}
var baseTitle = document.title;
window.addEventListener('focus', function () { document.title = baseTitle; });
function fire(title, body, tag) {
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body: body, tag: tag }); return; } catch (e) {} }
  // No OS permission: still make noise in the page so the alert is never silent.
  beep(); if (document.hidden) document.title = '● ' + title;
}
function alertsLabel() {
  if (!('Notification' in window)) { alertsBtn.textContent = 'Alerts: sound only'; alertsBtn.disabled = true; return; }
  var p = Notification.permission;
  alertsBtn.classList.toggle('off', p === 'denied');
  alertsBtn.textContent = p === 'granted' ? 'Alerts on ✓ (click to test)' : p === 'denied' ? 'Alerts blocked, sound only' : 'Enable alerts';
}
alertsLabel();
alertsBtn.onclick = function () {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') { fire('Agent board', 'Test alert', 'test'); return; }
  var done = function () { alertsLabel(); if (Notification.permission !== 'granted') beep(); };
  try { var r = Notification.requestPermission(done); if (r && r.then) r.then(done); } catch (e) { done(); }
};
function notifyNew(sessions) {
  var now = Date.now();
  sessions.forEach(function (s) {
    (s.events || []).forEach(function (ev) {
      var key = s.sessionId + ':' + ev.at + ':' + ev.text;
      if (seen.has(key)) return;
      seen.add(key);
      // One alert per node and kind every 5 minutes; the tag makes the OS replace rather than stack.
      var tag = s.sessionId + ':' + (ev.nodeId || '') + ':' + ev.level;
      if (!primed || ev.level === 'info' || now - (lastAlert.get(tag) || 0) < 300000) return;
      lastAlert.set(tag, now);
      fire(s.title || s.name, ev.text, tag);
    });
    var main = (s.agents || []).find(function (a) { return a.kind === 'main'; });
    var silent = !s.isEnded && now - s.updatedAt > SILENT && now - s.updatedAt < 600000 && main && main.status === 'running';
    if (silent && !silentSeen.has(s.sessionId)) {
      silentSeen.add(s.sessionId);
      if (primed) fire(s.title || s.name, 'Session stopped answering while it was working', 'silent:' + s.sessionId);
    } else if (!silent) silentSeen.delete(s.sessionId);
  });
  primed = true;
}

async function poll() {
  var live = document.getElementById('live'), status = document.getElementById('status');
  try {
    var listing = await (await fetch('sessions/', { cache: 'no-store' })).text();
    var files = Array.from(new Set(Array.from(listing.matchAll(/href="([^"]+\\.json)"/g)).map(function (m) { return m[1]; })));
    all = (await Promise.all(files.map(function (f) { return fetch('sessions/' + f, { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return null; }); }))).filter(Boolean);
    render(); notifyNew(all);
    live.classList.remove('stale'); status.textContent = 'live · ' + new Date().toLocaleTimeString();
  } catch (error) {
    live.classList.add('stale'); status.textContent = 'server unreachable';
  }
}
poll(); setInterval(poll, 1000);
</script>
</body>
</html>
`
