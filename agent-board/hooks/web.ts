// The browser board: one session index per poll, with a retained legacy fallback.
export const WEB_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0c1015">
<title>Agent Board</title>
<style>
:root {
  color-scheme: dark;
  --bg: #0c1015; --panel: #131920; --sunk: #1b232d; --ink: #e8edf3; --muted: #9aa9ba; --line: #2b3542;
  --run: #70d6a4; --wait: #efbb68; --done: #8998a9; --fail: #ff8d92;
  --run-bg: #182d27; --wait-bg: #32291d; --fail-bg: #342126;
  --opus: #929aff; --sonnet: #51d9cb; --haiku: #ffad69; --cx: #f18bda; --none: #8998a9;
  --mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  --ease-out: cubic-bezier(.23, 1, .32, 1);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; min-height: 100dvh; background: var(--bg); color: var(--ink); font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
::selection { color: var(--ink); background: #344b67; }
.wrap { max-width: 1440px; margin: 0 auto; padding: 24px 28px 56px; display: grid; gap: 20px; }
h1 { font-size: 22px; margin: 0; font-weight: 650; letter-spacing: -.035em; }
h2 { font-size: 11px; margin: 0 0 12px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
.note { color: var(--muted); font-size: 12px; margin: 0; }
.bar, .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }
.bar { padding-top: 4px; }
.bar .alerts { margin-left: auto; }
.live { display: inline-flex; align-items: center; gap: 7px; font: 11px var(--mono); color: var(--muted); }
.live i { width: 6px; height: 6px; border-radius: 50%; background: var(--run); }
.live.stale { color: var(--wait); } .live.stale i { background: var(--wait); }
.toolbar { gap: 8px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.filters { display: flex; flex-wrap: wrap; gap: 4px; margin-right: auto; }
.f, .alerts, .mini, .search, .sel { font: inherit; font-size: 12px; border-radius: 5px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); min-height: 32px; }
.f, .alerts, .mini { cursor: pointer; padding: 5px 10px; transition: background-color 140ms var(--ease-out), border-color 140ms var(--ease-out), color 140ms var(--ease-out); }
.f { display: inline-flex; gap: 8px; align-items: center; border-color: transparent; background: transparent; color: var(--muted); }
.f b { font: 11px var(--mono); color: var(--muted); }
.f[aria-pressed="true"] { background: var(--sunk); color: var(--ink); border-color: #455367; }
.f[aria-pressed="true"] b { color: var(--ink); }
.search, .sel { padding: 6px 10px; }
.search { width: 225px; max-width: 100%; caret-color: var(--sonnet); }
.search::placeholder { color: var(--muted); opacity: 1; }
.sel { max-width: 100%; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--sonnet); outline-offset: 3px; }
button:disabled { opacity: .55; cursor: default; }
button:active:not(:disabled) { background-color: var(--sunk); }
.attn { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 8px; }
.a { all: unset; box-sizing: border-box; cursor: pointer; border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; display: grid; gap: 3px; min-width: 0; transition: border-color 140ms var(--ease-out); }
.a:focus-visible { outline: 2px solid var(--sonnet); outline-offset: 3px; }
.a.fail { background: var(--fail-bg); border-color: #714049; }
.a.wait { background: var(--wait-bg); border-color: #73603b; }
.a .k { font-size: 11px; font-weight: 650; }
.a.fail .k { color: var(--fail); } .a.wait .k { color: var(--wait); }
.a .who { font-weight: 600; overflow-wrap: anywhere; }
.a .why { color: #b8c2cf; font-size: 12px; overflow-wrap: anywhere; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 20px; align-items: center; font-size: 11px; color: var(--muted); }
.legend .g { display: inline-flex; align-items: center; gap: 5px; }
.legend > span:last-child { margin-left: auto; max-width: 520px; }
.sw { display: inline-block; width: 10px; height: 7px; border-radius: 1px; background: color-mix(in srgb, var(--fam) var(--mix, 100%), var(--panel)); }
.sw.sq { width: 7px; }
#board { display: grid; gap: 16px; min-width: 0; }
.sess { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; min-width: 0; }
.sess.ended { background: #10161d; }
.sess.ended .sess-head .title { color: #b4bfcc; }
.sess-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 20px; padding: 16px 18px 10px; width: 100%; text-align: left; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; align-items: start; }
.sess-head .title { font-size: 15px; font-weight: 620; letter-spacing: -.015em; overflow-wrap: anywhere; }
.sess-head .cwd { grid-column: 1; padding-left: 18px; font: 11px/1.6 var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; grid-row: 1 / span 2; grid-column: 2; max-width: 600px; }
.chip { font-size: 11px; padding: 2px 7px; border-radius: 4px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.chip.run, .chip.live-on { color: var(--run); background: var(--run-bg); border-color: transparent; }
.chip.wait, .chip.live-idle { color: var(--wait); background: var(--wait-bg); border-color: transparent; }
.chip.live-on, .chip.live-idle { display: inline-flex; align-items: center; gap: 6px; }
.chip.live-on::before, .chip.live-idle::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.alerts.off, .chip.fail { color: var(--fail); }
.chip.fail { background: var(--fail-bg); border-color: transparent; }
.chev { transition: transform 160ms var(--ease-out); display: inline-block; width: 12px; margin-right: 6px; color: var(--muted); }
.sess.closed .chev { transform: rotate(-90deg); }
.sess.closed .inner { display: none; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 0 18px 10px 36px; font-size: 11px; color: var(--muted); }
.tools .id { font: 10px var(--mono); }
.mini { font-size: 11px; min-height: 28px; padding: 3px 8px; background: transparent; }
.mini[aria-pressed="true"] { border-color: #73603b; color: var(--wait); }
.pulse { padding: 0 18px 14px 36px; display: grid; grid-template-columns: minmax(80px, 180px) 1fr; gap: 24px; align-items: end; }
.sp { position: relative; height: 28px; opacity: .8; }
.sp svg { width: 100%; height: 28px; display: block; }
.sp i { position: absolute; width: 5px; height: 5px; border-radius: 50%; background: var(--run); right: 0; transform: translate(0, -50%); }
.stat { display: flex; flex-wrap: wrap; gap: 4px 20px; font-size: 11px; color: var(--muted); justify-content: flex-end; }
.stat b { color: var(--ink); font: 12px var(--mono); }
.body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; border-top: 1px solid var(--line); }
.tree { padding: 6px 0; min-width: 0; position: relative; }
svg.edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.e { fill: none; stroke-width: 1.25; stroke-linecap: round; }
.e.off { stroke: var(--line); stroke-dasharray: 2 4; }
.e.on { stroke-dasharray: 5 4; animation: flow 1.2s linear infinite; }
.e.hold { stroke-dasharray: none; } .e.fade { opacity: .4; stroke-dasharray: none; }
.row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 3px 10px; padding: 10px 18px 10px calc(20px + var(--d, 0) * 28px); position: relative; --mix: 100%; --fam: var(--none); transition: background-color 140ms var(--ease-out); }
.row::after { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 2px; background: color-mix(in srgb, var(--fam) var(--mix), var(--panel)); }
.row + .row { border-top: 1px solid #202833; }
.row.flash { background: color-mix(in srgb, var(--fam) 16%, var(--panel)); }
.t1 { --mix: 100%; } .t2 { --mix: 66%; } .t3 { --mix: 40%; }
.opus { --fam: var(--opus); } .sonnet { --fam: var(--sonnet); } .haiku { --fam: var(--haiku); } .codex { --fam: var(--cx); }
.codex::after { background: repeating-linear-gradient(180deg, var(--cx) 0 4px, transparent 4px 7px) !important; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--done); margin-top: 6px; position: relative; }
.running .dot { background: var(--run); }
.waiting .dot, .idle .dot { background: var(--wait); } .failed .dot { background: var(--fail); }
.codex .dot { border-radius: 1px; }
.name { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; min-width: 0; }
.name b { font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.badge { font: 500 10px var(--mono); padding: 1px 5px; border-radius: 3px; color: var(--fam); background: color-mix(in srgb, var(--fam) 9%, var(--panel)); border: 1px solid color-mix(in srgb, var(--fam) 25%, var(--line)); }
.doing { grid-column: 2; font: 11px/1.6 var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.running .doing { color: #c6d0dd; }
.flag { grid-column: 2; font-size: 12px; font-weight: 500; color: var(--fail); overflow-wrap: anywhere; }
.flag.wait { color: var(--wait); }
.nums { grid-row: 1 / span 3; grid-column: 3; text-align: right; font: 11px/1.5 var(--mono); color: var(--muted); display: grid; gap: 3px; align-content: start; }
.nums .t { color: var(--ink); }
.bar-tok { height: 2px; width: 50px; background: var(--sunk); overflow: hidden; justify-self: end; margin-top: 2px; }
.bar-tok i { display: block; height: 100%; background: color-mix(in srgb, var(--fam) var(--mix), var(--panel)); }
.over { grid-column: 2; font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
.done-row .name b, .done-row .doing { color: var(--muted); }
.feedcol { border-left: 1px solid var(--line); padding: 14px 16px; background: #10161d; min-width: 0; }
.feedcol h2 { font-size: 10px; }
.feed { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.feed li { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 10px; font-size: 12px; color: var(--muted); }
.feed time { font: 10px/1.8 var(--mono); }
.feed .done { color: var(--run); } .feed .warn { color: var(--wait); } .feed .fail { color: var(--fail); }
.feed span { overflow-wrap: anywhere; }
.jump { all: unset; cursor: pointer; text-align: left; overflow-wrap: anywhere; text-decoration: underline; text-decoration-color: #546171; text-underline-offset: 3px; }
.jump:focus-visible { outline: 2px solid var(--sonnet); outline-offset: 3px; }
.acts { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; }
.acts .note { font-size: 11px; line-height: 1.6; }
.nomatch, .empty { padding: 40px 24px; text-align: center; color: var(--muted); background: var(--panel); border: 1px dashed #435065; border-radius: 8px; }
.usage { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.usage-resets { grid-column: 1 / -1; display: grid; gap: 6px; }
.usage-resets[hidden] { display: none; }
.usage-reset { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px solid var(--run); border-radius: 6px; background: var(--panel); color: var(--run); font-size: 12px; }
.usage-reset.early { border-color: var(--wait); color: var(--wait); }
.usage-reset > span { min-width: 0; overflow-wrap: anywhere; }
.usage-reset .mini { flex-shrink: 0; }
.early-reset { justify-self: start; width: fit-content; padding: 2px 6px; border: 1px solid var(--wait); border-radius: 3px; color: var(--wait); font: 10px/1.5 var(--mono); }
.usage-history { padding: 10px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.usage-history summary { cursor: pointer; }
.usage-history summary:focus-visible { outline: 2px solid var(--wait); outline-offset: 3px; }
.usage-history strong { color: #c0cad7; font-weight: 500; }
.usage-history ol { margin: 8px 0 0; padding-left: 18px; }
.reset-marker { color: var(--run); font-size: 11px; }
.reset-history { color: var(--muted); font-size: 10px; }
.reading-old { color: var(--wait); }
.usage-asof { margin-left: auto; text-align: right; }
.usage-foot > span { min-width: 0; overflow-wrap: anywhere; }
.usage-window.reset .remaining { font-size: 26px; letter-spacing: -.04em; }
.usage-window.reset .remaining small { display: block; margin-left: 0; }
.usage-card { min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: hidden; }
.usage-head { padding: 13px 18px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); }
.usage-head h2 { margin: 0; font-size: 14px; letter-spacing: -.015em; text-transform: none; color: var(--ink); }
.provider-mark { width: 8px; height: 8px; border: 2px solid var(--haiku); border-radius: 50%; margin-right: 2px; }
.usage-card.codex-usage .provider-mark { border-radius: 1px; border-color: var(--cx); }
.plan { font: 10px var(--mono); padding: 2px 6px; border: 1px solid #435065; border-radius: 3px; color: #bcc7d5; text-transform: uppercase; }
.usage-state { margin-left: auto; font-size: 11px; color: var(--muted); }
.usage-state.good { color: var(--run); } .usage-state.danger { color: var(--fail); font-weight: 600; }
.usage-card.limited { border-color: #8b4751; }
.usage-card.limited .usage-head { background: var(--fail-bg); border-color: #63333d; }
.usage-windows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 16px 18px; gap: 14px; }
.usage-window { min-width: 0; display: grid; gap: 5px; }
.usage-window + .usage-window { padding-left: 16px; border-left: 1px solid var(--line); }
.window-label { font-size: 11px; color: #c0cad7; }
.remaining { font: 500 32px/1.15 var(--mono); letter-spacing: -.06em; color: var(--gauge, var(--muted)); }
.remaining small { font: 11px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; color: var(--muted); margin-left: 7px; }
.usage-gauge { position: relative; height: 5px; margin: 3px 0; background: var(--sunk); overflow: hidden; border-radius: 1px; }
.usage-gauge i { display: block; height: 100%; width: var(--left, 0%); background: var(--gauge, var(--done)); }
.usage-gauge::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(10% - 2px), var(--panel) calc(10% - 2px), var(--panel) 10%); }
.window-meta { display: flex; flex-wrap: wrap; gap: 3px 10px; color: var(--muted); font-size: 10px; }
.reset-clock { color: #b6c2d1; font: 10px/1.7 var(--mono); }
.reset-note { color: var(--run); font-size: 10px; }
.usage-foot { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; padding: 9px 18px; border-top: 1px solid var(--line); color: var(--muted); font-size: 10px; }
.reset-credits { margin-top: 8px; font-size: 12px; color: var(--good, #7ee787); }
.usage-expiry.warning, .usage-asof.warning { color: var(--wait); } .usage-expiry.danger { color: var(--fail); }
.usage-empty { min-height: 121px; display: flex; align-items: center; padding: 18px; color: var(--muted); font-size: 12px; }
.usage-card.unavailable .provider-mark { border-color: var(--done); }
.usage-card.unavailable .usage-head h2 { color: var(--muted); }
@keyframes flow { to { stroke-dashoffset: -9; } }
@media (hover: hover) and (pointer: fine) {
  .mini:hover, .alerts:hover, .f:hover, .sess-head:hover { background: var(--sunk); }
  .row:hover { background: #1a222c; }
  .a:hover { border-color: var(--muted); }
  .jump:hover { color: var(--ink); text-decoration-color: currentColor; }
}
@media (max-width: 1024px) {
  .wrap { padding: 20px 20px 40px; }
  .filters { flex-basis: 100%; }
  .body { grid-template-columns: minmax(0, 1fr) 250px; }
  .chips { max-width: 380px; }
}
@media (max-width: 760px) {
  .wrap { padding: 16px 12px 36px; gap: 16px; }
  .usage { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .body { grid-template-columns: minmax(0, 1fr); }
  .feedcol { border-left: 0; border-top: 1px solid var(--line); }
  .sess-head { grid-template-columns: minmax(0, 1fr); padding: 14px; }
  .chips { grid-row: auto; grid-column: 1; justify-content: flex-start; max-width: none; margin-top: 5px; }
  .tools, .pulse { padding-left: 14px; padding-right: 14px; }
  .pulse { grid-template-columns: minmax(60px, 100px) 1fr; gap: 16px; }
  .stat { justify-content: flex-end; gap: 3px 12px; }
  .row { grid-template-columns: 12px minmax(0, 1fr); padding-left: calc(16px + min(var(--d, 0), 6) * 18px); }
  .nums { grid-row: auto; grid-column: 2; display: flex; gap: 10px; text-align: left; }
  .bar-tok { display: none; }
  .legend > span:last-child { margin-left: 0; flex-basis: 100%; }
  .search { flex: 1; min-width: 140px; }
  .bar { gap: 8px 12px; } .bar .alerts { margin-left: 0; }
  .f, .alerts, .mini { min-height: 36px; }
}
@media (max-width: 380px) {
  .usage-windows { padding: 14px; gap: 10px; }
  .usage-window + .usage-window { padding-left: 10px; }
  .remaining { font-size: 28px; }
  .remaining small { display: block; margin-left: 0; }
  .sel { flex: 1; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }

/* Dense product surfaces retain the original palette and give controls stable DOM identity. */
.sess { overflow: visible; position: relative; }
.sess-x { position: absolute; top: 8px; right: 8px; z-index: 6; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 13px; line-height: 1; cursor: pointer; }
.sess-x:hover { background: var(--sunk); color: var(--ink); }
.sess-head { padding-right: 40px; }
.sess-head { border-radius: 8px 8px 0 0; text-align: start; }
.session-summary { display:flex; flex-wrap:wrap; gap:6px 18px; position:sticky; top:0; z-index:5; background:var(--panel); border-block:1px solid var(--line); padding:9px 18px; color:var(--muted); font-size:11px; border-radius:0; }
.session-summary b { color:var(--ink); }
.closed .session-summary { border-radius:0 0 8px 8px; border-bottom:0; }
.tools { padding:12px 18px; gap:8px; }
.tools .agent-search { margin-inline-start:auto; width:210px; }
.tools .sel { min-height:32px; font-size:12px; }
.row b, .doing, .flag, .over, .cwd, .title { unicode-bidi:plaintext; text-align:start; }
.name .badge { unicode-bidi:isolate; }
.nums, .usage-window, time { unicode-bidi:isolate; }
.finished-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 18px; border-top:1px solid var(--line); }
.finished-row .note { font-size:11px; }
.tree-empty { padding:24px 18px; color:var(--muted); }
.attn { display:flex; flex-wrap:wrap; align-items:start; gap:12px; }
.attention-group { display:grid; gap:6px; flex:1 1 260px; min-width:0; }
.attention-group h3 { margin:0 0 2px; font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
.a { cursor:default; gap:8px; padding:10px 12px; }
.issue-jump { display:grid; gap:3px; border:0; padding:0; background:transparent; color:inherit; font:inherit; text-align:start; cursor:pointer; }
.acknowledge { justify-self:start; }
.attn-heading { display:flex; gap:12px; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
.attn-heading h2 { margin:0; }
.traffic { padding:14px 18px; border:1px solid var(--line); border-radius:8px; }
.traffic h2 { margin-bottom:8px; }
.exchange { display:grid; grid-template-columns:minmax(150px,1fr) minmax(0,2fr) auto; gap:6px 16px; padding:5px 0; }
.exchange span { overflow-wrap:anywhere; }
.exchange time { font:11px var(--mono); color:var(--muted); }
.traffic-chip { color:var(--sonnet); max-width:100%; white-space:normal; overflow-wrap:anywhere; }
.legend { align-items:start; gap:6px 16px; }
.legend > span:last-child { margin-inline-start:0; }
.legend span { cursor:help; }
.projection { display:block; margin-top:5px; font:11px var(--mono); color:var(--wait); }
.unknown .remaining { font-size:27px; color:var(--muted); }
.unknown .remaining small { display:block; margin:0; }
.unknown .usage-gauge { opacity:.35; }
.e { pointer-events:stroke; stroke:var(--sonnet); stroke-width:1.4; opacity:.28; fill:none; }
.e.flow-result { stroke:var(--cx); stroke-dasharray:5 3; }
.e.fresh { opacity:.9; }
.e.fallback { stroke:var(--done); stroke-dasharray:2 5; opacity:.2; }
.e.traffic-live { animation:traffic-pulse 1.2s ease-in-out infinite alternate; }
@keyframes traffic-pulse { from { opacity:.5; } to { opacity:1; } }
button, select, input { -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
button { transition:background-color 150ms var(--ease-out),color 150ms var(--ease-out),border-color 150ms var(--ease-out); }
button:active:not(:disabled) { transform:scale(.99); }
@media(max-width:720px) {
  .session-summary { padding:9px 14px; gap:5px 12px; }
  .tools { padding:12px 14px; }
  .tools .agent-search { margin-inline-start:0; flex:1 1 160px; }
  .tools .agent-filter { flex:1 1 130px; }
  input.search, select.sel, select.alerts { font-size:16px; }
  .row { padding-left:calc(16px + min(var(--d,0),3)*18px); }
  .exchange { grid-template-columns:minmax(0,1fr) auto; }
  .exchange .note { grid-column:1 / -1; grid-row:2; }
  .exchange time { grid-column:2; grid-row:1; }
  .traffic { padding:12px 14px; }
}
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } button:active:not(:disabled) { transform:none; } }

</style>
</head>
<body>
<main class="wrap">
  <section class="usage" aria-label="Account usage">
    <div class="usage-resets" id="usage-resets" aria-live="polite" hidden></div>
    <article class="usage-card unavailable" id="usage-claude" aria-label="Claude usage"><div class="usage-head"><span class="provider-mark" aria-hidden="true"></span><h2>Claude</h2><span class="usage-state">Connecting</span></div><div class="usage-empty">Waiting for usage data…</div></article>
    <article class="usage-card codex-usage unavailable" id="usage-codex" aria-label="Codex usage"><div class="usage-head"><span class="provider-mark" aria-hidden="true"></span><h2>Codex</h2><span class="usage-state">Connecting</span></div><div class="usage-empty">Waiting for usage data…</div></article>
  </section>
  <header class="bar">
    <h1>Agent board</h1>
    <span class="live" id="live" role="status"><i aria-hidden="true"></i><span id="status">connecting</span></span>
    <select class="alerts" id="alerts" aria-label="Notification mode"><option value="off">Alerts: Off</option><option value="sound">Alerts: Sound</option><option value="desktop">Alerts: Desktop</option></select>
  </header>
  <nav class="toolbar" aria-label="Session controls">
    <div class="filters" id="filters" role="group" aria-label="Filter sessions"></div>
    <input class="search" id="q" type="search" placeholder="Search title, folder, status" aria-label="Search sessions">
    <select class="sel" id="sort" aria-label="Sort sessions"><option value="sev">Needs attention first</option><option value="recent">Most recent</option><option value="name">Title</option></select>
  </nav>
  <section class="traffic" id="traffic" aria-label="Cross-session traffic" hidden></section>
  <section id="attnbox" aria-label="Needs attention" hidden><div class="attn-heading"><h2 id="attnh"></h2><button class="mini dismiss-all" title="Acknowledge every current issue">Dismiss all</button></div><div class="attn" id="attn"></div></section>
  <div class="legend" id="legend" aria-label="Legend"></div>
  <div id="board"><div class="empty">Waiting for sessions with the agent-board mod…</div></div>
  <div class="nomatch" id="nomatch" hidden>No sessions match. Clear the search or pick All.</div>
</main>
<script>
// Keep this browser equivalent in sync with compareAdvice in board.ts.
function compareAdvice(advice, nodes) {
  var advisedParallel = advice.mode === 'parallel' ? advice.parts.filter(function (p) { return p.executor === 'claude'; }).length : 0;
  var advisedCodex = advice.mode === 'parallel' ? advice.parts.filter(function (p) { return p.executor === 'codex'; }).length : 0;
  var started = nodes.filter(function (n) { return n.startedAt >= advice.at; });
  var actualAgents = started.filter(function (n) { return n.kind === 'agent' || n.kind === 'workflow'; }).length;
  var actualCodex = started.filter(function (n) { return n.kind === 'codex'; }).length;
  var verdict = actualAgents > advisedParallel || actualCodex > advisedCodex ? 'over' : advice.mode === 'single' ? 'single-ok' : actualAgents < advisedParallel || actualCodex < advisedCodex ? 'under' : 'followed';
  return { advisedParallel: advisedParallel, advisedCodex: advisedCodex, actualAgents: actualAgents, actualCodex: actualCodex, verdict: verdict };
}
// All snapshot ages use the server clock. Local wall time is only used for tab leases.
var SILENT = 90000, clockOffset = 0;
function serverNow() { return Date.now() + clockOffset; }
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var clip = function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
var dur = function (ms) { var s = Math.max(0, Math.round((ms || 0) / 1000)); if (s < 60) return s + 's'; var m = Math.floor(s / 60); return m < 60 ? m + 'm ' + String(s % 60).padStart(2, '0') + 's' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
var tok = function (n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n || 0); };
var store = {
  get: function (k, d) { try { var v = localStorage.getItem('ab.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('ab.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
var pinned = store.get('pinned', {}), folded = store.get('closed', {}), finishedOpen = store.get('finishedOpen', {}), muted = store.get('muted', {}), dismissed = store.get('dismissed', {});
var acknowledged = store.get('acknowledged', {}), issueEpisodes = store.get('issueEpisodes', {}), clearedAt = store.get('clearedAt', {});
var agentControls = {}, rowLimits = {}, filter = 'all', all = [], visibleSessions = [], infos = new Map(), lastGood = new Map(), confirmedMissing = new Map();
var usageData = null, usageBusy = false, usageSamples = new Map(), worstRemaining = null;
var dedupeState = new Map(), sortState = new Map(), stableOrder = [], sortMode = null;
var resetSeen = store.get('usageResetSeen', {}), resetNotices = new Map(), resetTitlePending = false;
var resetDismissed = store.get('usageResetDismissed', {}), resetLastSeen = store.get('usageResetLastSeen', {}), usageOpenedAt = Date.now();
function finiteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function validDate(value) { return finiteNumber(value) && !isNaN(new Date(value).getTime()); }
function textIfChanged(el, text) { if (el && el.textContent !== text) el.textContent = text; }
function sessionName(s) { return s.title || s.name || String(s.sessionId); }
function stamp(s) { return finiteNumber(s.updatedAt) ? s.updatedAt : 0; }
function nodes(s) { return Array.isArray(s.agents) ? s.agents.filter(function (a) { return a && a.id != null; }) : []; }
function isRunning(a) { return a.status === 'running'; }
function flagged(a) { return ['approval', 'stalled', 'looping'].indexOf(a.health) >= 0 || a.phase === 'waiting-approval'; }
function chip(cls, text, title) { return '<span class="chip ' + cls + '" title="' + esc(title || text) + '">' + esc(text) + '</span>'; }
function issue(s, a, kind, now, fallbackAt, detail) {
  var base = s.sessionId + '|' + (a ? a.id : '') + '|' + kind;
  var ep = issueEpisodes[base];
  if (!ep || ep.recoveredAt && now - ep.recoveredAt >= (kind === 'no-heartbeat' ? 120000 : 300000)) ep = issueEpisodes[base] = { onset: fallbackAt || now };
  ep.recoveredAt = 0;
  var labels = { approval: 'Waiting for approval', stalled: 'Stalled', looping: 'Looping', failed: 'Failed', 'no-heartbeat': 'No heartbeat' };
  return { key: base + '|' + ep.onset, base: base, onset: ep.onset, sid: s.sessionId, id: a ? a.id : '', kind: kind, label: labels[kind], who: a && (a.label || a.id) || sessionName(s), detail: detail || a && a.healthNote || '', cls: kind === 'approval' ? 'wait' : 'fail' };
}
function sessionInfo(s, now) {
  var agents = nodes(s), run = agents.filter(isRunning).length, age = Math.max(0, now - stamp(s));
  var blocked = agents.some(function (a) { return a.status !== 'done' && a.status !== 'failed' && (a.phase === 'waiting-approval' || a.phase === 'waiting-input' || a.health === 'approval'); });
  var child = !!(s.t3 && s.t3.parentThreadId), lastWork = agents.reduce(function (m, a) { return Math.max(m, finiteNumber(a.activityAt) ? a.activityAt : 0, finiteNumber(a.endedAt) ? a.endedAt : 0); }, 0);
  var ended = !!s.isEnded || (!run && !blocked && (age > 600000 || child && lastWork > 0 && now - lastWork > 120000)), silent = !ended && run > 0 && age > SILENT;
  var current = [];
  if (!ended) {
    agents.forEach(function (a) {
      var kind = a.status === 'done' || a.status === 'failed' ? null : a.phase === 'waiting-approval' || a.health === 'approval' ? 'approval' : ['stalled', 'looping'].indexOf(a.health) >= 0 && isRunning(a) ? a.health : null;
      if (kind) current.push(issue(s, a, kind, now, null));
      if (a.status === 'failed') {
        var failureKey = s.sessionId + '|' + a.id + '|failed';
        var failureAt = a.endedAt || a.activityAt || issueEpisodes[failureKey] && issueEpisodes[failureKey].onset || stamp(s);
        if (now - failureAt < 600000) current.push(issue(s, a, 'failed', now, failureAt));
      }
    });
    if (s.lastError && !agents.some(function (a) { return a.status === 'failed'; })) {
      var previousError = issueEpisodes[s.sessionId + '||failed'];
      var fallbackErrorAt = previousError && previousError.onset || stamp(s);
      var errorAt = typeof s.lastError === 'object' ? s.lastError.at || s.lastError.timestamp || fallbackErrorAt : fallbackErrorAt;
      if (now - errorAt < 600000) current.push(issue(s, null, 'failed', now, errorAt, typeof s.lastError === 'string' ? s.lastError : s.lastError.message || 'Session reported an error'));
    }
    if (silent) current.push(issue(s, null, 'no-heartbeat', now, stamp(s) + SILENT, 'Disconnected while work is still running · last heartbeat ' + dur(age) + ' ago'));
  }
  var active = new Set(current.map(function (x) { return x.base; }));
  Object.keys(issueEpisodes).forEach(function (key) { if (key.startsWith(s.sessionId + '|') && !active.has(key) && !issueEpisodes[key].recoveredAt) issueEpisodes[key].recoveredAt = now; });
  var issues = current.filter(function (x) { return !acknowledged[x.key]; });
  return { agents: agents, run: run, ended: ended, silent: silent, age: age, issues: issues, currentIssues: current, warn: agents.filter(flagged), fail: agents.filter(function (a) { return a.status === 'failed'; }).length, codex: agents.filter(function (a) { return a.kind === 'codex'; }), sev: issues.length ? 3 : ended ? 0 : run ? 2 : 1 };
}
function stateChip(s, info) {
  if (info.ended) return chip('', 'Ended', 'Session explicitly ended, or has no running agents and has been quiet for 10 minutes (2 minutes for a delegated child)');
  if (info.silent) return chip('fail', 'No heartbeat', 'Disconnected or no heartbeat; running work is retained');
  var main = info.agents.find(function (a) { return a.kind === 'main' || a.id === 'main'; });
  var phase = main && main.phase;
  if (phase === 'waiting-approval' || main && main.health === 'approval') return chip('wait', 'Waiting for approval', 'Review and approve the pending action');
  if (phase === 'waiting-user') return chip('wait', 'Waiting for you', 'The main agent is waiting for your reply');
  if (phase === 'waiting-children') return chip('live-on', 'Working in background', 'The main agent is waiting for children to return');
  var child = info.agents.some(function (a) { return a !== main && isRunning(a); });
  var recentMain = main && isRunning(main) && finiteNumber(main.activityAt) && serverNow() - main.activityAt < 90000;
  if (child || recentMain || main && isRunning(main) && phase === 'tool') return chip('live-on', 'Working', 'Recent main-agent activity, a running tool, or a running child');
  if (!info.run || phase === 'idle') return chip('', 'Idle', 'No recent active work is reported');
  return chip('wait', 'No heartbeat', 'A running status is reported, but no recent activity timestamp is available');
}
// Advance hysteresis only on complete polls, never on local renders or failed requests.
function updateDedupe(sessions, confirmed) {
  if (!confirmed) return;
  lastGood.forEach(function (s, id) {
    var match = !!(s.t3 && s.t3.parentThreadId && s.t3.threadId && sessions.some(function (parent) {
      return parent.sessionId !== id && parent.t3 && parent.t3.threadId === s.t3.parentThreadId && nodes(parent).some(function (a) { return a.id === s.t3.threadId || a.t3 && a.t3.childThreadId === s.t3.threadId; });
    }));
    var state = dedupeState.get(id) || { hidden: false, hits: 0, misses: 0 };
    state.hits = match ? state.hits + 1 : 0; state.misses = match ? 0 : state.misses + 1;
    if (state.hits >= 5) state.hidden = true;
    if (state.misses >= 5) state.hidden = false;
    dedupeState.set(id, state);
  });
}
function dedupedSessions(sessions) {
  return sessions.filter(function (s) { return pinned[s.sessionId] || !dedupeState.has(s.sessionId) || !dedupeState.get(s.sessionId).hidden; });
}
function activeSession(s, info) {
  return !!pinned[s.sessionId] || info.run > 0 || !info.ended;
}
function filterMatch(s, info, value) {
  if (value === 'ended') return info.ended;
  if (!activeSession(s, info)) return false;
  return value === 'all' || value === 'attn' && info.issues.length > 0 || value === 'run' && info.run > 0 && !info.ended || value === 'codex' && info.codex.length > 0;
}
function matches(s, info) {
  if (dismissed[s.sessionId] !== undefined && stamp(s) <= dismissed[s.sessionId] + 15000 && !pinned[s.sessionId]) return false;
  var q = document.getElementById('q').value.trim().toLowerCase();
  var hay = [sessionName(s), s.cwd || '', info.issues.map(function (x) { return x.kind; }).join(' '), info.run ? 'running working' : '', info.codex.length ? 'codex' : '', info.ended ? 'ended' : ''].join(' ').toLowerCase();
  return (!q || hay.includes(q)) && filterMatch(s, info, filter);
}
function orderedSessions(live, now, mode) {
  var changedMode = sortMode !== mode, ranks = new Map();
  stableOrder.forEach(function (id, index) { ranks.set(id, index); });
  live.forEach(function (s) {
    var sev = infos.get(s.sessionId).sev, state = sortState.get(s.sessionId);
    if (!state) state = { severity: sev, pending: sev, since: now };
    if (state.pending !== sev) { state.pending = sev; state.since = now; }
    if (state.severity !== state.pending && now - state.since >= 5000) state.severity = state.pending;
    sortState.set(s.sessionId, state);
  });
  if (!changedMode) live.filter(function (s) { return !ranks.has(s.sessionId); }).sort(function (a, b) { return mode === 'name' ? sessionName(a).localeCompare(sessionName(b)) : stamp(b) - stamp(a); }).forEach(function (s) { ranks.set(s.sessionId, ranks.size); });
  var sorted = live.slice().sort(function (a, b) {
    var pa = pinned[a.sessionId] ? 1 : 0, pb = pinned[b.sessionId] ? 1 : 0; if (pa !== pb) return pb - pa;
    if (mode === 'sev') { var severity = sortState.get(b.sessionId).severity - sortState.get(a.sessionId).severity; if (severity) return severity; }
    if (!changedMode && ranks.has(a.sessionId) && ranks.has(b.sessionId)) return ranks.get(a.sessionId) - ranks.get(b.sessionId);
    if (mode === 'name') return sessionName(a).localeCompare(sessionName(b));
    return stamp(b) - stamp(a) || a.sessionId.localeCompare(b.sessionId);
  });
  stableOrder = sorted.map(function (s) { return s.sessionId; }); sortMode = mode;
  return sorted;
}
function windowReset(w) {
  var at = finiteNumber(w.resetAt) ? w.resetAt : finiteNumber(w.resetsAt) ? w.resetsAt * 1000 : null;
  return validDate(at) ? at : null;
}
function windowLabel(w) { return w.label || (w.id === 'five_hour' ? '5-hour window' : w.id === 'seven_day' ? '7-day window' : w.id ? String(w.id).replace(/_/g, ' ') : 'Reported window'); }
function clock24(at) { return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function datedClock(at, now) {
  var date = new Date(at), far = Math.abs(at - now) > 86400000;
  return date.toLocaleDateString('en-US', far ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short' }) + ' ' + clock24(at);
}
function relativeTime(ms) {
  var minutes = Math.floor(Math.abs(ms) / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return days ? days + 'd ' + hours % 24 + 'h' : hours ? hours + 'h ' + minutes % 60 + 'm' : minutes ? minutes + 'm' : '<1m';
}
function updateUsageTitle() {
  document.title = (resetTitlePending ? '↻ reset · ' : '') + (worstRemaining !== null && worstRemaining < 20 ? Math.round(worstRemaining) + '% remaining · ' : '') + 'Agent Board';
}
function resetEvents(data) {
  return data && Array.isArray(data.resets) ? data.resets.filter(function (e) {
    return e && typeof e.window === 'string' && validDate(e.at) && finiteNumber(e.fromPct) && finiteNumber(e.toPct) && (e.kind === 'early' || e.kind === 'scheduled');
  }).sort(function (a, b) { return b.at - a.at; }).slice(0, 5) : [];
}
function resetEventId(provider, e) { return provider + '|' + e.window + '|' + e.at + '|' + e.kind; }
function resetWindowLabel(data, e) {
  var w = data && Array.isArray(data.windows) && data.windows.find(function (w) { return w && w.id === e.window; });
  return windowLabel(w || { id: e.window });
}
function resetUsed(e) { return e.fromPct + '% → ' + e.toPct + '% used'; }
function resetDescription(e) {
  return 'Reset ' + (e.kind === 'early' ? 'early ' : 'on schedule ') + new Date(e.at).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + clock24(e.at) + ' · ' + resetUsed(e);
}
function observeResets(now) {
  var changed = false;
  ['claude', 'codex'].forEach(function (provider) {
    var data = usageData && usageData[provider]; if (!data || !Array.isArray(data.windows)) return;
    if (Array.isArray(data.resets)) {
      var seen = resetLastSeen[provider] || 0;
      resetEvents(data).slice().reverse().forEach(function (e) {
        if (e.at <= seen) return;
        var id = resetEventId(provider, e), away = e.at < usageOpenedAt;
        var message = (provider === 'claude' ? 'Claude' : 'Codex') + ' ' + resetWindowLabel(data, e) + ' was reset ' + (e.kind === 'early' ? 'early' : 'on schedule') + ' (' + resetUsed(e) + ')' + (away ? ' · while you were away' : '');
        if (!resetDismissed[id]) {
          resetNotices.set(id, { provider: provider, text: message, epoch: e.at, kind: e.kind }); resetTitlePending = true;
          if (alertMode === 'desktop') pendingAlerts.set('usage-reset:' + id, { reset: true, key: id, epoch: e.at, name: message, sid: 'usage-' + provider, messages: [resetDescription(e)] });
        }
        resetLastSeen[provider] = Math.max(resetLastSeen[provider] || 0, e.at); changed = true;
      });
      return;
    }
    data.windows.forEach(function (w, index) {
      if (!w || !finiteNumber(w.usedPct)) return;
      var at = windowReset(w); if (at === null) return;
      var key = provider + '|' + (w.id || w.label || index), old = resetSeen[key] || {}, epoch = at <= now ? at : old.epoch && old.epoch <= now ? old.epoch : null;
      var announced = old.announced || 0;
      if (epoch !== null && epoch > announced) {
        var message = (provider === 'claude' ? 'Claude' : 'Codex') + ' ' + windowLabel(w) + ' reset ✓';
        resetNotices.set(key, { provider: provider, text: message, epoch: epoch }); resetTitlePending = true; announced = epoch;
        if (alertMode === 'desktop') pendingAlerts.set('usage-reset:' + key, { reset: true, key: key, epoch: epoch, name: message, sid: 'usage-' + provider, messages: ['Window reset at ' + datedClock(epoch, now)] });
        changed = true;
      }
      if (old.epoch !== at || old.announced !== announced) { resetSeen[key] = { epoch: at, announced: announced }; changed = true; }
    });
  });
  if (changed) { store.set('usageResetSeen', resetSeen); store.set('usageResetLastSeen', resetLastSeen); }
  return changed;
}
function renderResetNotices() {
  var el = document.getElementById('usage-resets'); el.hidden = !resetNotices.size;
  setHtml(el, Array.from(resetNotices.entries()).map(function (entry) { return '<div class="usage-reset' + (entry[1].kind === 'early' ? ' early' : '') + '"><span>' + esc(entry[1].text) + '</span><button class="mini" data-dismiss-reset="' + esc(entry[0]) + '" aria-label="Dismiss ' + esc(entry[1].text) + '">Dismiss</button></div>'; }).join(''));
}
window.addEventListener('focus', function () { resetTitlePending = false; updateUsageTitle(); });
function sampleUsage(provider, data) {
  if (!data || !Array.isArray(data.windows)) return;
  data.windows.forEach(function (w, index) {
    if (!w || w.stale || data.stale || !finiteNumber(w.usedPct)) return;
    var key = provider + '|' + (w.id || w.label || index), at = w.asOf || data.asOf || serverNow();
    var samples = usageSamples.get(key) || [], last = samples[samples.length - 1];
    if (last && (w.resetsAt !== last.reset || w.usedPct < last.used)) samples = [];
    last = samples[samples.length - 1];
    if (!last || at > last.at) samples.push({ at: at, used: w.usedPct, reset: w.resetsAt });
    usageSamples.set(key, samples.filter(function (p) { return at - p.at < 3600000; }).slice(-60));
  });
}
function projection(provider, w, index, left) {
  if (left === null) return '';
  var samples = usageSamples.get(provider + '|' + (w.id || w.label || index)) || [];
  if (samples.length < 2) return '';
  var first = samples[0], last = samples[samples.length - 1], rate = (last.used - first.used) / (last.at - first.at);
  if (!(rate > 0)) return '';
  var at = serverNow() + left / rate;
  if (!validDate(at)) return '';
  return '<span class="projection" title="Estimated exhaustion time from recent usage; the pace may change">At this pace ~' + esc(new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })) + '</span>';
}
function usageCard(provider, data) {
  var now = serverNow(), name = provider === 'claude' ? 'Claude' : 'Codex', available = data && Array.isArray(data.windows);
  var windows = available ? data.windows.filter(function (w) { return w && typeof w === 'object'; }) : [];
  var reset = windows.some(function (w) { var at = windowReset(w); return finiteNumber(w.usedPct) && at !== null && at <= now; });
  var observed = windows.some(function (w) { return finiteNumber(w.usedPct); });
  var limited = windows.some(function (w) { var at = windowReset(w); return w.usedPct >= 100 && (at === null || at > now); });
  var marker = Array.from(resetNotices.values()).some(function (n) { return n.provider === provider; });
  var card = document.getElementById('usage-' + provider);
  var events = resetEvents(data), historyOpen = card.querySelector('.usage-history[open]');
  card.classList.toggle('unavailable', !available); card.classList.toggle('limited', limited);
  var state = !available ? 'Usage unavailable' : limited ? 'Limit reached' : reset ? 'Reset ✓' : observed ? 'Available' : 'Unknown';
  var html = '<div class="usage-head"><span class="provider-mark" aria-hidden="true"></span><h2>' + name + '</h2><span class="plan">' + esc(available && data.plan || 'Plan unknown') + '</span>' + (marker ? '<span class="reset-marker" title="A usage window reset">✓</span>' : '') + '<span class="usage-state' + (limited ? ' danger' : reset ? ' good' : '') + '">' + state + '</span></div>';
  if (!available) html += '<div class="usage-empty">Usage unavailable. Retrying every 15 seconds.</div>';
  else if (!windows.length) html += '<div class="usage-empty">No usage windows reported.</div>';
  else html += '<div class="usage-windows">' + windows.map(function (w, index) {
    var known = finiteNumber(w.usedPct), used = known ? Math.max(0, Math.min(100, w.usedPct)) : null;
    var at = windowReset(w), rolled = known && at !== null && at <= now, left = rolled ? 100 : known ? 100 - used : null;
    var pct = rolled ? 'Reset ✓' : left === null ? 'Unknown' : String(Math.round(left * 10) / 10) + '%';
    if (left !== null) worstRemaining = worstRemaining === null ? left : Math.min(worstRemaining, left);
    var color = left === null ? 'var(--done)' : left > 40 ? 'var(--run)' : left >= 15 ? 'var(--wait)' : 'var(--fail)', label = windowLabel(w);
    var latest = events.find(function (e) { return e.window === w.id; });
    return '<div class="usage-window' + (rolled ? ' reset' : left === null ? ' unknown' : '') + '" style="--gauge:' + color + ';--left:' + (left === null ? 0 : left) + '%"><span class="window-label">' + esc(label) + '</span>' + (latest && latest.kind === 'early' ? '<span class="early-reset" title="' + esc(resetDescription(latest)) + '">Early reset</span>' : '') + '<div class="remaining">' + pct + '<small>' + (left === null ? 'No observation yet' : rolled ? '100% remaining' : 'remaining') + '</small></div><div class="usage-gauge" role="img" aria-label="' + esc(label + ': ' + (left === null ? 'remaining unknown' : left + '% remaining')) + '"><i></i></div><div class="window-meta"><span class="' + (rolled ? 'reset-history' : '') + '">' + (used === null ? 'No usage reading' : rolled ? 'last seen ' + used + '% used before reset' : used + '% used') + '</span></div><span class="reset-clock" data-reset="' + (at === null ? '' : at) + '"></span>' + (rolled ? '<span class="reset-note" data-reset-note="' + at + '"></span>' : projection(provider, w, index, left)) + '</div>';
  }).join('') + '</div>';
  var credits = available && data.resetCredits && finiteNumber(data.resetCredits.available) ? data.resetCredits : null;
  if (credits && credits.available > 0) html += '<div class="reset-credits"><strong>' + credits.available + ' reset' + (credits.available === 1 ? '' : 's') + ' available</strong> · ' + (Array.isArray(credits.items) ? credits.items.filter(function (c) { return validDate(c.expiresAt); }).map(function (c) { return esc('expires ' + new Date(c.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })); }).join(', ') : '') + '</div>';
  html += events.length ? '<details class="usage-history"' + (historyOpen ? ' open' : '') + '><summary><strong>Reset history</strong> · ' + esc(resetDescription(events[0])) + '</summary><ol>' + events.map(function (e) { return '<li>' + esc(resetWindowLabel(data, e) + ' · ' + resetDescription(e)) + '</li>'; }).join('') + '</ol></details>' : '<div class="usage-history">Reset history · No resets observed yet</div>';
  html += '<div class="usage-foot"><span class="usage-expiry" data-provider="' + provider + '" data-expiry="' + (available && validDate(data.expiresAt) ? data.expiresAt : '') + '"></span><span class="usage-asof" data-asof="' + (available && validDate(data.asOf) ? data.asOf : '') + '"></span></div>';
  setHtml(card, html);
}
function renderUsage() {
  observeResets(serverNow()); worstRemaining = null;
  usageCard('claude', usageData && usageData.claude); usageCard('codex', usageData && usageData.codex);
  renderResetNotices(); updateUsageTitle(); tickUsage(serverNow());
}
async function pollUsage() {
  if (usageBusy) return;
  usageBusy = true;
  var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 10000);
  try {
    var response = await fetch('usage.json', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Usage unavailable');
    var data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid usage data');
    usageData = data; sampleUsage('claude', data.claude); sampleUsage('codex', data.codex);
  } catch (error) { /* Keep the last observation during a failed refresh. */ }
  finally { clearTimeout(timeout); usageBusy = false; renderUsage(); }
}
function tickUsage(now) {
  // A window can roll over between the 15-second usage polls.
  if (observeResets(now)) { renderUsage(); return; }
  document.querySelectorAll('[data-reset]').forEach(function (el) {
    var hasAt = el.dataset.reset !== '', at = Number(el.dataset.reset), past = at <= now;
    textIfChanged(el, !hasAt ? 'Reset time unavailable' : (past ? 'Reset ' : 'Resets ') + datedClock(at, now) + ' · ' + (past ? relativeTime(now - at) + ' ago' : 'in ' + relativeTime(at - now)));
  });
  document.querySelectorAll('[data-reset-note]').forEach(function (el) {
    var at = Number(el.dataset.resetNote);
    textIfChanged(el, 'Window reset at ' + (now - at > 86400000 ? datedClock(at, now) : clock24(at)) + ' (' + relativeTime(now - at) + ' ago) · new window starts at your next message');
  });
  document.querySelectorAll('[data-asof]').forEach(function (el) {
    var hasAt = el.dataset.asof !== '', at = Number(el.dataset.asof), stale = hasAt && now - at > 1800000;
    var tooltip = 'Claude data refreshes only while a T3 Claude session runs. Codex data comes from the newest Codex log.';
    var text = hasAt ? 'Last usage reading ' + (now - at > 86400000 ? datedClock(at, now) : clock24(at)) + ' · ' + Math.floor(Math.max(0, now - at) / 3600000) + 'h ' + Math.floor(Math.max(0, now - at) / 60000) % 60 + 'm ago' : 'Last usage reading unavailable';
    setHtml(el, esc(text) + (stale ? ' <span class="reading-old" title="' + tooltip + '">old reading</span>' : '')); el.title = tooltip;
  });
  document.querySelectorAll('[data-expiry]').forEach(function (el) {
    var hasAt = el.dataset.expiry !== '', at = Number(el.dataset.expiry), remaining = at - now, days = Math.max(0, Math.ceil(remaining / 86400000));
    el.classList.toggle('warning', hasAt && remaining < 7 * 86400000 && remaining >= 2 * 86400000);
    el.classList.toggle('danger', hasAt && remaining < 2 * 86400000);
    textIfChanged(el, el.dataset.provider === 'claude' ? "Claude renewal date isn't stored locally" : hasAt ? 'Subscription active until ' + new Date(at).toLocaleDateString('en-US', { weekday: Math.abs(remaining) > 86400000 ? 'short' : undefined, month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + days + (days === 1 ? ' day left' : ' days left') : 'Subscription active until: unavailable');
  });
}
// Clock text is patched in place; its HTML stays constant between snapshots.
function clockHtml(start, end) { return '<span data-clock="' + (start || serverNow()) + '" data-clock-end="' + (end || 0) + '"></span>'; }
function tickClocks() {
  var now = serverNow();
  document.querySelectorAll('[data-clock]').forEach(function (el) { textIfChanged(el, dur((Number(el.dataset.clockEnd) || now) - Number(el.dataset.clock))); });
  tickUsage(now);
}

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
function rowHtml(r, best, now, ended) {
  var a = r.a, mc = modelClass(a, best), end = a.endedAt || now, over = a.status === 'done' || a.status === 'failed';
  var doing = a.tool ? a.tool + (a.detail ? ' · ' + a.detail : '') : a.t3 ? (over ? (a.t3.result || a.status) : 'working') : a.kind === 'codex' ? (a.detail || 'starting') : a.status;
  var phases = { 'thinking': 'Thinking', 'tool': 'Using a tool', 'waiting-user': 'Waiting for you', 'waiting-approval': 'Waiting for approval', 'waiting-children': 'Waiting for children', 'idle': 'Idle' }; if (!a.tool && !over && phases[a.phase]) doing = phases[a.phase]; var fl = flagged(a), st = a.status;
  var third = a.codex && over && a.codex.summary ? a.codex.summary : a.codex ? (Array.isArray(a.codex.files) ? a.codex.files.length : 0) + ' files' + (Array.isArray(a.codex.tasks) && a.codex.tasks.length ? ' · ' + a.codex.tasks.join(', ') : '') : '';
  var line = over ? [a.kind === 'codex' && !a.codex && !a.t3 ? a.detail : '', a.t3 ? '' : (a.tools || 0) + (a.kind === 'codex' ? ' cmds' : ' tools'), a.errors ? a.errors + ' err' : '', a.tokens ? tok(a.tokens) : '', dur(end - a.startedAt)].filter(Boolean).join(' · ') : doing;
  var pct = Math.max(2, Math.min(100, Math.round((a.tokens || 0) / (a.kind === 'codex' ? 1200000 : 300000) * 100)));
  return '<div role="listitem" class="row ' + mc.cls + ' ' + esc(st) + (over ? ' done-row' : '') + '" style="--d:' + r.d + '" data-id="' + esc(a.id) + '"' + (r.parent ? ' data-p="' + esc(r.parent) + '" data-edge="' + edgeState(a) + '"' : '') + ' title="' + esc((a.label || a.id) + '\\n' + (a.healthNote || '') + (a.codex && a.codex.summary ? '\\n' + a.codex.summary : '')) + '">' +
    '<i class="dot" aria-hidden="true"></i><span class="name"><b>' + esc(clip(a.label || a.id, 70)) + '</b>' + (mc.label ? '<span class="badge" title="' + esc('Reported model: ' + (a.model || 'unknown')) + '">' + esc(mc.label) + '</span>' : '') + '</span>' +
    '<span class="doing">' + esc(clip(line, 140)) + '</span>' +
    (fl ? '<span class="flag' + (a.health === 'approval' ? ' wait' : '') + '">' + esc(clip(a.healthNote || a.health, 120)) + '</span>' : third && !over ? '<span class="over">' + esc(clip(third, 120)) + '</span>' : over && third ? '<span class="over">' + esc(clip(third, 120)) + '</span>' : '') +
    '<span class="nums"><span class="t">' + clockHtml(a.startedAt, a.endedAt) + '</span>' + (a.tokens ? '<span>' + tok(a.tokens) + '</span><span class="bar-tok"><i style="width:' + pct + '%"></i></span>' : '') + '</span></div>';
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
  if (!a || !Array.isArray(a.parts) || now - a.at > 21600000 || a.at > now) return '';
  var c = compareAdvice(a, s.agents || []);
  var title = a.reason + '\\n' + a.parts.map(function (p) { return p.title + ': ' + p.executor + ' · ' + p.model + (p.effort ? ' · ' + p.effort : ''); }).join('\\n');
  var mode = a.mode === 'parallel' ? 'parallel ×' + a.parts.length + ' (' + c.advisedParallel + ' claude · <span style="color:var(--cx)">' + c.advisedCodex + ' codex</span>)' : 'single';
  var cls = c.verdict === 'under' || c.verdict === 'over' ? 'wait' : 'run';
  return '<span class="chip ' + cls + '" dir="ltr" style="unicode-bidi:isolate;max-width:100%;overflow:hidden;text-overflow:ellipsis" title="' + esc(title) + '">advice: ' + mode + ' → ran ' + c.actualAgents + ' agents · <span style="color:var(--cx)">' + c.actualCodex + ' codex</span> [' + esc(c.verdict) + ']</span>';
}
function edgeState(a) { return a.status === "done" || a.status === "failed" ? "done" : "idle"; }
var recentLinks = new Map();
function linksFor(s) { return Array.from(recentLinks.values()).filter(function (l) { return l._owner === s.sessionId; }); }
function collectLinks(sessions) {
  sessions.forEach(function (s) { (Array.isArray(s.links) ? s.links : []).forEach(function (l) {
    if (!l || !l.from || !l.to || !finiteNumber(l.at)) return;
    var key = l.id || [l.kind, l.at, l.from.sessionId, l.from.nodeId, l.to.sessionId, l.to.nodeId, l.to.peer].join('|');
    recentLinks.set(key, Object.assign({}, l, { _owner: s.sessionId }));
  }); });
  var latest = Array.from(recentLinks.entries()).sort(function (a, b) { return b[1].at - a[1].at; }).slice(0, 500);
  recentLinks = new Map(latest);
}
function peerLinks() {
  return Array.from(recentLinks.values()).filter(function (l) { return l.kind === 'peer-msg' && l.from.sessionId && (l.to.sessionId || l.to.peer) && l.from.sessionId !== l.to.sessionId; }).sort(function (a, b) { return b.at - a.at; });
}
function nameById(id) { var s = all.find(function (s) { return s.sessionId === id || s.t3 && s.t3.threadId === id; }); return s ? sessionName(s) : id || 'Peer'; }
function linkTitle(l, now) { return l.kind + ' · ' + (l.preview || 'No preview supplied') + ' · ' + dur(now - l.at) + ' ago'; }
function peerBadges(s, now) {
  return peerLinks().filter(function (l) { return l.from.sessionId === s.sessionId || l.to.sessionId === s.sessionId; }).slice(0, 2).map(function (l) {
    var other = l.from.sessionId === s.sessionId ? l.to.sessionId || l.to.peer : l.from.sessionId;
    return chip('traffic-chip', '↔ ' + clip(nameById(other), 26) + ' · ' + dur(now - l.at) + ' ago', linkTitle(l, now));
  }).join('');
}
function order(agents) {
  var byId = new Map(agents.map(function (a) { return [a.id, a]; })), kids = new Map(), out = [], visited = new Set();
  agents.forEach(function (a) { if (a.parentId && a.parentId !== a.id && byId.has(a.parentId)) kids.set(a.parentId, (kids.get(a.parentId) || []).concat(a)); });
  function walk(a, d, parent) { if (visited.has(a.id)) return; visited.add(a.id); out.push({ a: a, d: Math.min(d, 8), parent: parent }); (kids.get(a.id) || []).forEach(function (k) { walk(k, d + 1, a.id); }); }
  agents.filter(function (a) { return !a.parentId || !byId.has(a.parentId); }).forEach(function (a) { walk(a, 0, null); });
  agents.forEach(function (a) { walk(a, 0, null); });
  return out;
}
function agentView(s, info, best, now) {
  var controls = agentControls[s.sessionId] || { q: '', mode: 'all' }, agents = info.agents;
  var finished = agents.filter(function (a) { return a.status === 'done' || a.status === 'failed'; }).sort(function (a, b) { return (b.endedAt || b.activityAt || 0) - (a.endedAt || a.activityAt || 0); });
  var lastFive = new Set(finished.slice(0, 5).map(function (a) { return a.id; }));
  var returning = new Set(linksFor(s).filter(function (l) { return l.kind === 'result' && now - l.at < 60000; }).map(function (l) { return l.from.nodeId; }));
  var full = !!finishedOpen[s.sessionId], totalDone = finished.filter(function (a) { return a.status === 'done'; }).length;
  var rows = order(agents).filter(function (r) {
    var a = r.a, over = a.status === 'done' || a.status === 'failed';
    var searchable = [a.label, a.id, a.model, a.tool, a.detail].join(' ').toLowerCase();
    return (full || !over || flagged(a) || info.issues.some(function (x) { return x.id === a.id; }) || lastFive.has(a.id) || returning.has(a.id)) && (!controls.q || searchable.includes(controls.q.toLowerCase())) && (controls.mode === 'all' || controls.mode === 'running' && isRunning(a) || controls.mode === 'flagged' && (flagged(a) || info.issues.some(function (x) { return x.id === a.id; })) || controls.mode === 'codex' && a.kind === 'codex');
  });
  var limit = rowLimits[s.sessionId] || 60, total = rows.length;
  var html = rows.slice(0, limit).map(function (r) { return rowHtml(r, best, now, info.ended); }).join('');
  if (!html) html = '<div class="tree-empty" data-key="empty">' + (agents.length ? 'No agents match this search or filter.' : 'No agent details reported yet.') + '</div>';
  if (finished.length) html += '<div class="finished-row" data-key="finished"><button class="mini toggle-finished" aria-expanded="' + full + '" title="Show or collapse the completed-agent archive">' + totalDone + ' done · ' + info.fail + ' failed · ' + (full ? 'Collapse archive' : 'Expand archive') + '</button><span class="note">' + (full ? 'All finished agents included' : 'Showing running, flagged, and the latest 5 finished agents') + '</span></div>';
  if (total > limit) html += '<div class="finished-row" data-key="more"><button class="mini show-more">Show ' + Math.min(60, total - limit) + ' more (' + (total - limit) + ' remaining)</button></div>';
  return html;
}
function parts(s, info, best, now, expanded) {
  var agents = info.agents, begin = Math.min.apply(null, agents.map(function (a) { return a.startedAt || now; }).concat([now]));
  var claude = 0, cx = 0, calls = 0;
  agents.forEach(function (a) { if (a.kind === 'codex') cx += a.tokens || 0; else claude += a.tokens || 0; calls += a.tools || 0; });
  var parent = s.t3 && s.t3.parentThreadId ? chip('', 'Child of ' + clip(nameById(s.t3.parentThreadId), 30), 'Shown separately because the parent has no matching child-agent node') : '';
  var head = '<span class="title" dir="auto"><span class="chev" aria-hidden="true">▾</span>' + esc(sessionName(s)) + '</span><span class="cwd" dir="auto">' + esc(s.cwd || 'Folder unavailable') + '</span><span class="chips">' + stateChip(s, info) + adviceChip(s, now) + parent + peerBadges(s, now) +
    (info.run && !info.ended ? chip('run', info.run + ' running', 'Includes the main agent and all running children') : '') +
    (info.issues.length ? chip('fail', info.issues.length + ' need attention', 'Unacknowledged approval, stalled, looping, recent failure, or heartbeat issues') : '') +
    chip('', agents.length + ' agents', 'All reported nodes, including the main agent') + (muted[s.sessionId] ? chip('', 'Muted', 'Notifications are muted for this session') : '') + '</span>';
  var summary = s.summary || {}, count = function (key, fallback) { return finiteNumber(summary[key]) ? summary[key] : fallback; };
  var lastActivity = summary.lastActivityAt || Math.max.apply(null, agents.map(function (a) { return a.activityAt || 0; }).concat([stamp(s)]));
  var strip = '<span title="Running count includes the main agent"><b>' + count('running', info.run) + '</b> running</span><span title="Agents waiting for a person, approval, or children"><b>' + count('waiting', agents.filter(function (a) { return String(a.phase || '').startsWith('waiting-'); }).length) + '</b> waiting</span><span title="Failed nodes, including acknowledged failures"><b>' + count('failed', info.fail) + '</b> failed</span><span title="Backend health flags, independent of acknowledgement"><b>' + count('flagged', info.warn.length) + '</b> flagged</span><span title="Most recent reported activity">Activity ' + dur(now - lastActivity) + ' ago</span>';
  if (!expanded) return { head: head, summary: strip };
  var pulse = spark(s.activity || []) + '<div class="stat"><span><b>' + clockHtml(begin, info.ended ? s.endedAt || stamp(s) : 0) + '</b> elapsed</span><span><b>' + tok(claude + cx) + '</b> tokens</span><span><b>' + calls + '</b> tool calls</span></div>';
  var feed = eventsFor(s).map(function (ev) { return '<li class="' + esc(ev.level || '') + '"><time>' + esc(new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })) + '</time><span dir="auto">' + (ev.nodeId ? '<button class="jump" data-go="' + esc(ev.nodeId) + '">' + esc(ev.text) + '</button>' : esc(ev.text)) + '</span></li>'; }).join('') || '<li style="display:block"><span class="note">No timeline events yet.</span></li>';
  return { head: head, summary: strip, pulse: pulse, tree: agentView(s, info, best, now), feed: feed };
}
function drawEdges(tree) {
  var old = tree.querySelector('svg.edges'); if (old) old.remove();
  var sec = tree.closest('.sess'), s = all.find(function (s) { return s.sessionId === sec.dataset.sid; }); if (!s) return;
  var rows = new Map(); tree.querySelectorAll('.row[data-id]').forEach(function (r) { rows.set(r.dataset.id, r); });
  var box = tree.getBoundingClientRect(); if (!box.height) return;
  var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'edges'); svg.setAttribute('aria-label', 'Agent data flow');
  var mid = 'ah' + Math.random().toString(36).slice(2, 9), defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<marker id="' + mid + '" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L7 3.5L0 7z" fill="context-stroke"/></marker>'; svg.appendChild(defs);
  function point(r) { var b = r.querySelector('.dot').getBoundingClientRect(); return { x: b.left - box.left + b.width / 2, y: b.top - box.top + b.height / 2 }; }
  function resolve(endpoint) {
    if (endpoint.nodeId && rows.has(endpoint.nodeId)) return rows.get(endpoint.nodeId);
    var child = nodes(s).find(function (a) { return endpoint.sessionId && (a.id === endpoint.sessionId || a.t3 && a.t3.childThreadId === endpoint.sessionId); });
    if (child && rows.has(child.id)) return rows.get(child.id);
    if (!endpoint.nodeId && (!endpoint.sessionId || endpoint.sessionId === s.sessionId)) return rows.get('main') || rows.values().next().value;
    return null;
  }
  function path(from, to, kind, at, title, fallback) {
    if (!from || !to || from === to) return;
    var a = point(from), b = point(to), bend = Math.max(5, Math.min(a.x, b.x) - (kind === 'result' ? 8 : 14));
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M' + (a.x - 5) + ' ' + a.y + 'H' + bend + 'V' + b.y + 'H' + (b.x - 5));
    var age = serverNow() - at, bright = !fallback && (age < 10000 || kind === 'result' && age < 60000);
    p.setAttribute('class', 'e flow-' + kind + (bright ? ' fresh' : ' quiet') + (!fallback && age >= 0 && age < 10000 ? ' traffic-live' : '') + (fallback ? ' fallback' : ''));
    p.setAttribute('marker-end', 'url(#' + mid + ')'); var t = document.createElementNS(NS, 'title'); t.textContent = title; p.appendChild(t); svg.appendChild(p);
  }
  var links = linksFor(s), hasLinks = Array.isArray(s.links) && s.links.length || links.length;
  if (hasLinks) links.filter(function (l) { return l.kind === 'delegate' || l.kind === 'result'; }).forEach(function (l) { path(resolve(l.from), resolve(l.to), l.kind, l.at, linkTitle(l, serverNow()), false); });
  else rows.forEach(function (r) { var parent = rows.get(r.dataset.p); if (parent) path(parent, r, 'delegate', 0, 'Inferred relationship; no exchange data reported', true); });
  tree.appendChild(svg);
}
function sectionFor(s) {
  var el = document.createElement('section'); el.id = 'sess-' + s.sessionId; el.className = 'sess'; el.dataset.sid = s.sessionId;
  el.innerHTML = '<button class="sess-x" aria-label="Close session" title="Close: hide this session until it is active again">✕</button><button class="sess-head" aria-expanded="true" title="Expand or collapse this session"></button><div class="session-summary"></div><div class="inner"><div class="tools"><button class="mini pin" title="Keep this session available">☆ Pin</button><button class="mini mute" title="Mute notifications for this session">Mute</button><button class="mini copy" title="Copy the session folder">Copy path</button><input class="search agent-search" type="search" placeholder="Find an agent" aria-label="Search agents in this session"><select class="sel agent-filter" aria-label="Filter agents in this session"><option value="all">All agents</option><option value="running">Running</option><option value="flagged">Flagged</option><option value="codex">Codex</option></select></div><div class="pulse"></div><div class="body"><div class="tree" role="list"></div><aside class="feedcol" aria-label="Recent events"><h2>Timeline</h2><ul class="feed"></ul><div class="acts"><button class="mini clr-hist">Clear history</button></div></aside></div></div>';
  el.querySelector('.agent-search').dataset.focus = 'agent-search-' + s.sessionId;
  el.querySelector('.agent-filter').dataset.focus = 'agent-filter-' + s.sessionId;
  return el;
}
function focusKey(el) { if (!el) return ''; return el.id || el.dataset.focus || el.dataset.ack || el.dataset.go || el.dataset.f || el.className; }
function setHtml(el, html) {
  if (el._h === html) return false;
  var active = document.activeElement, key = el.contains(active) ? focusKey(active) : null;
  el._h = html; el.innerHTML = html;
  if (key) { var target = Array.from(el.querySelectorAll('button,input,select,a')).find(function (b) { return focusKey(b) === key; }); if (target) target.focus({ preventScroll: true }); }
  return true;
}
function setTree(tree, html) {
  if (tree._h === html) return false;
  tree._h = html;
  var incoming = document.createElement('div'); incoming.innerHTML = html;
  var existing = new Map(); Array.from(tree.children).forEach(function (row) { if (!row.matches('svg.edges')) existing.set(row.dataset.id || row.dataset.key, row); });
  Array.from(incoming.children).forEach(function (next, index) {
    var key = next.dataset.id || next.dataset.key, row = existing.get(key);
    if (row) { existing.delete(key); if (row._rowHtml !== next.outerHTML) { row.className = next.className; Array.from(next.attributes).forEach(function (a) { row.setAttribute(a.name, a.value); }); setHtml(row, next.innerHTML); row._rowHtml = next.outerHTML; } }
    else { row = next; row._rowHtml = next.outerHTML; }
    if (tree.children[index] !== row) tree.insertBefore(row, tree.children[index] || null);
  });
  existing.forEach(function (r) { r.remove(); }); return true;
}
function renderFilters(infos, live) {
  var c = { all: 0, attn: 0, run: 0, codex: 0, ended: 0 };
  live.forEach(function (s) { var i = infos.get(s.sessionId); Object.keys(c).forEach(function (key) { if (filterMatch(s, i, key)) c[key]++; }); });
  setHtml(document.getElementById('filters'), [['all', 'All'], ['attn', 'Needs attention'], ['run', 'Running'], ['codex', 'Codex'], ['ended', 'Ended']].map(function (n) { return '<button class="f" data-f="' + n[0] + '" aria-pressed="' + (filter === n[0]) + '" title="Filter sessions: ' + n[1] + '">' + n[1] + ' <b>' + c[n[0]] + '</b></button>'; }).join(''));
}
var attentionExpanded = false;
function renderAttention(infos, sessions) {
  var groups = sessions.map(function (s) { return { s: s, issues: infos.get(s.sessionId).issues }; }).filter(function (g) { return g.issues.length; });
  var count = groups.reduce(function (n, g) { return n + g.issues.length; }, 0), remaining = attentionExpanded ? Infinity : 5;
  document.getElementById('attnbox').hidden = !count;
  document.getElementById('attnh').textContent = 'Needs attention · ' + count;
  var html = groups.map(function (g) {
    if (remaining <= 0) return '';
    var items = g.issues.slice(0, remaining); remaining -= items.length;
    return '<div class="attention-group"><h3 dir="auto">' + esc(sessionName(g.s)) + '</h3>' + items.map(function (x) { return '<div class="a ' + x.cls + '"><button class="issue-jump" data-sid="' + esc(x.sid) + '" data-go="' + esc(x.id) + '" title="Open the affected agent"><span class="k">' + x.label + '</span><span class="who" dir="auto">' + esc(clip(x.who, 80)) + '</span><span class="why" dir="auto">' + esc(clip(x.detail, 140)) + '</span></button><button class="mini acknowledge" data-ack="' + esc(x.key) + '" title="Dismiss this issue until a new episode begins">Acknowledge</button></div>'; }).join('') + '</div>';
  }).join('');
  if (!attentionExpanded && count > 5) html += '<button class="mini attention-more">+' + (count - 5) + ' more</button>';
  setHtml(document.getElementById('attn'), html);
}
function renderTraffic(now) {
  var links = peerLinks().filter(function (l) { return now - l.at < 21600000; }).slice(0, 4), el = document.getElementById('traffic');
  el.hidden = !links.length;
  setHtml(el, '<h2>Cross-session traffic</h2>' + links.map(function (l) { return '<div class="exchange" title="' + esc(linkTitle(l, now)) + '"><span dir="auto">' + esc(clip(nameById(l.from.sessionId), 35)) + ' ↔ ' + esc(clip(nameById(l.to.sessionId || l.to.peer), 35)) + '</span><span class="note" dir="auto">' + esc(clip(l.preview || 'Message exchanged', 100)) + '</span><time>' + dur(now - l.at) + ' ago</time></div>'; }).join(''));
}
function renderLegend() {
  setHtml(document.getElementById('legend'), '<span title="Recent activity or running child/tool">● Working: active work</span><span title="A person must approve the pending action">● Approval: review needed</span><span title="The agent is waiting for a reply">● Waiting for you: reply needed</span><span title="Child agents are still running">● Background: waiting for children</span><span title="Heartbeat missing while work remains running">● No heartbeat: connection uncertain</span><span title="Actual recorded exchanges; faint lines are old or inferred">→ Task sent · ⇢ Result returned</span>');
}
function render() {
  var now = serverNow(), live = dedupedSessions(all), board = document.getElementById('board');
  infos = new Map(); live.forEach(function (s) { infos.set(s.sessionId, sessionInfo(s, now)); }); visibleSessions = live;
  var anchor = Array.from(board.querySelectorAll('.sess')).find(function (s) { return !s.hidden && s.getBoundingClientRect().bottom > 0; }), anchorTop = anchor && anchor.getBoundingClientRect().top;
  renderFilters(infos, live); renderAttention(infos, live); renderLegend(); renderTraffic(now);
  if (!live.length) { setHtml(board, '<div class="empty">No sessions yet. Start an agent-board session or a Codex thread in T3 Code. Sessions remain available when a poll fails.</div>'); document.getElementById('nomatch').hidden = true; return; }
  if (board.querySelector('.empty')) { board.innerHTML = ''; board._h = null; }
  var mode = document.getElementById('sort').value, best = bestVersions(live);
  var sorted = orderedSessions(live, now, mode);
  var shown = 0, existing = new Map(); board.querySelectorAll('.sess').forEach(function (el) { existing.set(el.dataset.sid, el); });
  existing.forEach(function (el, id) { if (!infos.has(id)) el.remove(); });
  sorted.forEach(function (s, index) {
    var info = infos.get(s.sessionId), el = existing.get(s.sessionId) || sectionFor(s), closed = s.sessionId in folded ? folded[s.sessionId] : info.ended, ok = matches(s, info);
    var p = parts(s, info, best, now, !closed && ok);
    el.classList.toggle('closed', !!closed); el.classList.toggle('ended', info.ended); el.hidden = !ok;
    var header = el.querySelector('.sess-head'); header.setAttribute('aria-expanded', String(!closed)); setHtml(header, p.head); setHtml(el.querySelector('.session-summary'), p.summary);
    if (ok) shown++;
    if (!closed && ok) {
      var pin = el.querySelector('.pin'), mute = el.querySelector('.mute'); textIfChanged(pin, pinned[s.sessionId] ? '★ Pinned' : '☆ Pin'); pin.setAttribute('aria-pressed', String(!!pinned[s.sessionId])); textIfChanged(mute, muted[s.sessionId] ? 'Unmute' : 'Mute'); mute.setAttribute('aria-pressed', String(!!muted[s.sessionId]));
      el.querySelector('.copy').dataset.path = s.cwd || ''; setHtml(el.querySelector('.pulse'), p.pulse); setHtml(el.querySelector('.feed'), p.feed); setTree(el.querySelector('.tree'), p.tree);
    } else { setTree(el.querySelector('.tree'), ''); }
    if (board.children[index] !== el) board.insertBefore(el, board.children[index] || null);
    if (ok && !closed) drawEdges(el.querySelector('.tree'));
  });
  document.getElementById('nomatch').hidden = shown > 0;
  if (anchor && anchor.isConnected && !anchor.hidden) { var delta = anchor.getBoundingClientRect().top - anchorTop; if (Math.abs(delta) > 1 && window.scrollY > 0) window.scrollBy(0, delta); }
  tickClocks();
}
function jumpTo(sid, nodeId) {
  var s = all.find(function (x) { return x.sessionId === sid; }); if (!s) return;
  folded[sid] = false; finishedOpen[sid] = true; agentControls[sid] = { q: '', mode: 'all' };
  rowLimits[sid] = Math.max(60, nodes(s).length); store.set('closed', folded); store.set('finishedOpen', finishedOpen); render();
  var sec = document.getElementById('sess-' + sid); if (!sec) return;
  sec.querySelector('.agent-search').value = ''; sec.querySelector('.agent-filter').value = 'all';
  var row = Array.from(sec.querySelectorAll('.row')).find(function (r) { return r.dataset.id === nodeId; }) || sec;
  row.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  if (row.matches('.row')) { row.classList.add('flash'); setTimeout(function () { row.classList.remove('flash'); }, 1400); }
}
document.addEventListener('click', function (e) {
  var t = e.target.closest('button'); if (!t) return;
  if (t.dataset.dismissReset) { resetDismissed[t.dataset.dismissReset] = serverNow(); resetDismissed = Object.fromEntries(Object.entries(resetDismissed).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 200)); store.set('usageResetDismissed', resetDismissed); resetNotices.delete(t.dataset.dismissReset); resetTitlePending = resetNotices.size > 0 && resetTitlePending; renderUsage(); return; }
  var sec = t.closest('.sess'), sid = sec && sec.dataset.sid;
  if (t.matches('.sess-head')) { folded[sid] = !sec.classList.contains('closed'); store.set('closed', folded); render(); return; }
  if (t.matches('.sess-x')) { var open = all.find(function (x) { return x.sessionId === sid; }); dismissed[sid] = open ? stamp(open) : serverNow(); store.set('dismissed', dismissed); render(); return; }
  if (t.matches('.pin')) { pinned[sid] = !pinned[sid]; store.set('pinned', pinned); render(); return; }
  if (t.matches('.mute')) { muted[sid] = !muted[sid]; store.set('muted', muted); pendingAlerts.delete(sid); render(); return; }
  if (t.matches('.copy')) { if (navigator.clipboard) navigator.clipboard.writeText(t.dataset.path).then(function () { textIfChanged(t, 'Copied'); setTimeout(function () { textIfChanged(t, 'Copy path'); }, 1200); }, function () { textIfChanged(t, 'Copy unavailable'); }); return; }
  if (t.matches('.clr-hist')) { clearedAt[sid] = serverNow(); store.set('clearedAt', clearedAt); render(); return; }
  if (t.matches('.toggle-finished')) { finishedOpen[sid] = !finishedOpen[sid]; store.set('finishedOpen', finishedOpen); render(); return; }
  if (t.matches('.show-more')) { rowLimits[sid] = (rowLimits[sid] || 60) + 60; render(); return; }
  if (t.dataset.ack) { infos.forEach(function (info) { info.issues.forEach(function (x) { if (x.key === t.dataset.ack) pendingAlerts.delete(x.sid); }); }); acknowledged[t.dataset.ack] = serverNow(); store.set('acknowledged', acknowledged); render(); return; }
  if (t.matches('.dismiss-all')) { pendingAlerts.clear(); infos.forEach(function (info) { info.issues.forEach(function (x) { acknowledged[x.key] = serverNow(); }); }); store.set('acknowledged', acknowledged); render(); return; }
  if (t.matches('.attention-more')) { attentionExpanded = true; render(); return; }
  if (t.dataset.f) { filter = t.dataset.f; render(); return; }
  if (t.dataset.go !== undefined) jumpTo(t.dataset.sid || sid, t.dataset.go);
});
function changeAgentControls(e) {
  if (!e.target.matches('.agent-search,.agent-filter')) return;
  var sec = e.target.closest('.sess'), sid = sec.dataset.sid;
  agentControls[sid] = { q: sec.querySelector('.agent-search').value, mode: sec.querySelector('.agent-filter').value }; rowLimits[sid] = 60; render();
}
document.addEventListener('input', changeAgentControls); document.addEventListener('change', changeAgentControls);
document.getElementById('q').addEventListener('input', render); document.getElementById('sort').addEventListener('change', render);
window.addEventListener('resize', function () { document.querySelectorAll('.sess:not(.closed):not([hidden]) .tree').forEach(drawEdges); });
// Notification episodes survive reloads; first snapshots are always primed silently.
var alertState = store.get('alertState', {}), lastAlert = store.get('lastAlert', {}), primed = false, previousNodes = new Map(), previousSessions = new Map();
var alertMode = store.get('alertMode', 'off'), pendingAlerts = new Map(), tabId = Math.random().toString(36).slice(2), peers = new Map(), channel = null;
var alertsControl = document.getElementById('alerts'), audioContext;
try { channel = new BroadcastChannel('agent-board-alerts'); channel.onmessage = function (e) { if (e.data && e.data.id) peers.set(e.data.id, Date.now()); }; } catch (e) {}
function leader() {
  var wall = Date.now(), lease = store.get('alertLeader', null);
  if (lease && lease.until > wall && lease.id !== tabId) return false;
  if (store.set('alertLeader', { id: tabId, until: wall + 8000 })) return store.get('alertLeader', {}).id === tabId;
  // Storage can be unavailable in private contexts; use a short BroadcastChannel election.
  if (!channel) return false;
  return !Array.from(peers.entries()).some(function (p) { return wall - p[1] < 8000 && p[0] < tabId; });
}
function heartbeatLeader() { if (channel) channel.postMessage({ id: tabId }); leader(); }
heartbeatLeader(); setInterval(heartbeatLeader, 3000);
window.addEventListener('pagehide', function () { var lease = store.get('alertLeader', {}); if (lease.id === tabId) store.set('alertLeader', { id: '', until: 0 }); if (channel) channel.close(); });
function syncAlertsControl() {
  if (!['off', 'sound', 'desktop'].includes(alertMode)) alertMode = 'off';
  alertsControl.value = alertMode;
  alertsControl.title = alertMode === 'off' ? 'Notifications disabled' : alertMode === 'sound' ? 'One sound at most every 30 seconds, in the leader tab' : 'Desktop notifications are grouped and limited to one every 30 seconds';
}
syncAlertsControl();
alertsControl.addEventListener('change', async function () {
  alertMode = alertsControl.value;
  if (alertMode === 'desktop') {
    try { if (!('Notification' in window) || await Notification.requestPermission() !== 'granted') alertMode = 'off'; }
    catch (e) { alertMode = 'off'; }
  }
  if (alertMode === 'sound') { try { var C = window.AudioContext || window.webkitAudioContext; audioContext = new C(); await audioContext.resume(); } catch (e) {} }
  pendingAlerts.clear(); store.set('alertMode', alertMode); syncAlertsControl();
});
window.addEventListener('storage', function (e) {
  if (e.key === 'ab.usageResetDismissed') { resetDismissed = store.get('usageResetDismissed', {}); resetNotices.forEach(function (notice, id) { if (resetDismissed[id]) resetNotices.delete(id); }); renderUsage(); }
  if (e.key === 'ab.alertMode') { alertMode = store.get('alertMode', 'off'); pendingAlerts.clear(); syncAlertsControl(); }
  if (e.key === 'ab.dismissed') { dismissed = store.get('dismissed', {}); render(); }
  if (e.key === 'ab.muted') { muted = store.get('muted', {}); render(); }
  if (e.key === 'ab.acknowledged') { acknowledged = store.get('acknowledged', {}); pendingAlerts.clear(); render(); }
});
function beep() {
  try { if (!audioContext || audioContext.state !== 'running') return; var o = audioContext.createOscillator(), g = audioContext.createGain(); o.frequency.value = 660; g.gain.value = 0.035; o.connect(g); g.connect(audioContext.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.13); o.stop(audioContext.currentTime + 0.15); } catch (e) {}
}
function queueAlert(s, text, kind, nodeId, completion) {
  if (!primed || alertMode === 'off' || muted[s.sessionId]) return;
  var info = infos.get(s.sessionId);
  if (!info || !matches(s, info) || info.ended && !completion) return;
  var pending = pendingAlerts.get(s.sessionId) || { sid: s.sessionId, name: sessionName(s), messages: [], completion: !!completion };
  pending.completion = pending.completion && !!completion;
  if (!pending.messages.includes(text)) pending.messages.push(text);
  pendingAlerts.set(s.sessionId, pending);
  lastAlert[s.sessionId + '|' + (nodeId || '') + '|' + kind] = serverNow();
}
function flushAlerts() {
  if (alertMode === 'off' || !pendingAlerts.size || !leader()) return;
  var now = serverNow(), globalLast = store.get('lastAlert', {}).global || 0;
  if (now - globalLast < 30000) return;
  var items = Array.from(pendingAlerts.values()).filter(function (p) {
    if (p.reset) return alertMode === 'desktop' && (store.get('usageResetDelivered', {})[p.key] || 0) < p.epoch;
    var s = all.find(function (s) { return s.sessionId === p.sid; }), info = infos.get(p.sid);
    return s && info && !muted[p.sid] && matches(s, info) && (!info.ended || p.completion);
  });
  pendingAlerts.clear(); if (!items.length) return;
  var title = items.length > 1 ? items.every(function (p) { return p.reset; }) ? 'Usage windows reset ✓' : items.some(function (p) { return p.reset; }) ? 'Agent Board updates' : items.length + ' sessions need attention' : items[0].name;
  var body = items.map(function (p) { return (items.length > 1 ? p.name + ': ' : '') + p.messages.join(' · '); }).join('\\n');
  if (alertMode === 'desktop') { try { if (Notification.permission !== 'granted') return; new Notification(title, { body: body, tag: 'agent-board:' + items[0].sid }); } catch (e) { return; } }
  else if (alertMode === 'sound') beep();
  var delivered = store.get('usageResetDelivered', {}); items.forEach(function (p) { if (p.reset) delivered[p.key] = p.epoch; }); store.set('usageResetDelivered', delivered);
  lastAlert.global = now; store.set('lastAlert', Object.assign({}, store.get('lastAlert', {}), lastAlert));
}
function notifyNew(sessions) {
  var now = serverNow(), active = new Set();
  sessions.forEach(function (s) {
    var info = infos.get(s.sessionId); if (!info) return;
    info.currentIssues.forEach(function (x) {
      active.add(x.base); var state = alertState[x.base], recovery = x.kind === 'no-heartbeat' ? 120000 : 300000;
      var rearmed = !state || !state.active && state.okSince && now - state.okSince >= recovery;
      if (rearmed && !acknowledged[x.key]) queueAlert(s, x.label + ': ' + x.who, x.kind, x.id, false);
      alertState[x.base] = { active: true, okSince: 0, lastSeen: now };
    });
    var previousSession = previousSessions.get(s.sessionId), begin = Math.min.apply(null, info.agents.map(function (a) { return a.startedAt || now; }).concat([now]));
    var sessionFinished = previousSession && !previousSession.ended && info.ended;
    if (sessionFinished && now - begin > 60000) queueAlert(s, 'Session finished after ' + dur(now - begin), 'finished', '', true);
    info.agents.forEach(function (a) {
      var key = s.sessionId + '|' + a.id, prev = previousNodes.get(key);
      if (!sessionFinished && !info.ended && prev === 'running' && a.status === 'done' && now - (a.startedAt || now) > 60000) queueAlert(s, (a.label || a.id) + ' finished', 'finished', a.id, false);
      previousNodes.set(key, a.status);
    });
    previousSessions.set(s.sessionId, { ended: info.ended });
  });
  Object.keys(alertState).forEach(function (key) {
    var state = alertState[key];
    if (!active.has(key) && state.active) { state.active = false; state.okSince = now; }
    if (!state.active && now - state.okSince > 300000) delete alertState[key];
  });
  // Keep acknowledgement history bounded while retaining all active episodes.
  Object.keys(acknowledged).forEach(function (key) { if (now - acknowledged[key] > 7 * 86400000) delete acknowledged[key]; });
  store.set('alertState', alertState); store.set('issueEpisodes', issueEpisodes); primed = true;
  // One brief batching window combines simultaneous transitions before sending a digest.
  if (pendingAlerts.size && !flushTimer) flushTimer = setTimeout(function () { flushTimer = null; flushAlerts(); }, 600);
}
var flushTimer = null, polling = false;
async function fetchJson(url, signal) {
  var r = await fetch(url, { cache: 'no-store', signal: signal }); if (!r.ok) throw new Error(url + ': ' + r.status); return r.json();
}
function normalizedSnapshot(s) {
  if (!s || typeof s !== 'object' || typeof s.sessionId !== 'string' || !s.sessionId || !finiteNumber(s.updatedAt) || !Array.isArray(s.agents)) return null;
  if (String(s.cwd || '').startsWith('/tmp/remember-summarizer-cwd')) return null;
  return s;
}
function retainSnapshots(sessions, confirmed) {
  var present = new Set(), now = serverNow();
  sessions.forEach(function (s) {
    if (!s || typeof s.sessionId !== 'string') return;
    present.add(s.sessionId); // A malformed entry is a failed parse, never proof of absence.
    var valid = normalizedSnapshot(s); if (!valid) return;
    var old = lastGood.get(s.sessionId);
    if (!old || !finiteNumber(old.seq) || !finiteNumber(s.seq) || s.seq >= old.seq) lastGood.set(s.sessionId, valid);
  });
  lastGood.forEach(function (s, id) {
    var running = nodes(s).some(isRunning), age = now - stamp(s);
    var count = confirmed ? present.has(id) ? 0 : (confirmedMissing.get(id) || 0) + 1 : confirmedMissing.get(id) || 0;
    confirmedMissing.set(id, count);
    if (confirmed && count >= 10 && !running && age > 1800000) { lastGood.delete(id); confirmedMissing.delete(id); dedupeState.delete(id); sortState.delete(id); }
  });
  updateDedupe(sessions, confirmed);
  all = Array.from(lastGood.values()); collectLinks(all);
}
async function poll() {
  if (polling) return; polling = true;
  var live = document.getElementById('live'), status = document.getElementById('status'), controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 8000);
  try {
    var sessions, confirmed = true, aggregate = true;
    try {
      var batch = await fetchJson('sessions.json', controller.signal);
      if (!batch || !Array.isArray(batch.sessions)) throw new Error('Invalid session index');
      if (finiteNumber(batch.serverNow)) clockOffset = batch.serverNow - Date.now();
      sessions = batch.sessions;
      if (sessions.some(function (s) { return !normalizedSnapshot(s); })) confirmed = false;
    } catch (error) {
      aggregate = false;
      var results = await Promise.allSettled([
        fetch('sessions/', { cache: 'no-store', signal: controller.signal }).then(function (r) { if (!r.ok) throw new Error('Session listing unavailable'); var date = Date.parse(r.headers.get('Date')); if (finiteNumber(date)) clockOffset = date - Date.now(); return r.text(); }),
        fetchJson('codex-sessions.json', controller.signal)
      ]);
      if (results[0].status !== 'fulfilled' && results[1].status !== 'fulfilled') throw new Error('Server unreachable');
      confirmed = results.every(function (r) { return r.status === 'fulfilled'; });
      var listing = results[0].status === 'fulfilled' ? results[0].value : '';
      var files = Array.from(new Set(Array.from(listing.matchAll(/href="([^"?#]+\\.json)"/g)).map(function (m) { return m[1]; })));
      var fetched = await Promise.allSettled(files.map(function (f) { return fetchJson('sessions/' + f, controller.signal); }));
      sessions = fetched.filter(function (r) { return r.status === 'fulfilled'; }).map(function (r) { return r.value; });
      if (fetched.some(function (r) { return r.status !== 'fulfilled' || !normalizedSnapshot(r.value); })) confirmed = false;
      var codex = results[1].status === 'fulfilled' ? results[1].value : [];
      if (Array.isArray(codex)) sessions = sessions.concat(codex); else confirmed = false;
    }
    retainSnapshots(sessions, confirmed); render(); notifyNew(visibleSessions);
    live.classList.toggle('stale', !confirmed); status.textContent = (confirmed ? 'Live' : 'Partial data · keeping last snapshots') + (aggregate ? '' : ' · legacy index') + ' · ' + new Date(serverNow()).toLocaleTimeString('en-GB', { hour12: false });
  } catch (error) {
    live.classList.add('stale'); status.textContent = 'Disconnected · keeping last snapshots'; render(); notifyNew(visibleSessions);
  } finally { clearTimeout(timeout); polling = false; }
}
pollUsage(); setInterval(pollUsage, 15000); poll(); setInterval(poll, 2000); setInterval(tickClocks, 1000); setInterval(flushAlerts, 1000);

</script>
</body>
</html>
`
