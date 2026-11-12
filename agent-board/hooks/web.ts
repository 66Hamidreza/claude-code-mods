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
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; min-height: 100dvh; background: var(--bg); color: var(--ink); font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
::selection { color: var(--ink); background: #344b67; }
.wrap { width: 100%; max-width: 2200px; margin: 0 auto; padding: 24px clamp(12px, 2.2vw, 44px) 56px; display: grid; gap: 20px; }
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
.body { display: grid; grid-template-columns: minmax(0, 1fr) clamp(240px, 24vw, 380px); border-top: 1px solid var(--line); }
.tree { padding: 6px 0; min-width: 0; position: relative; }
svg.edges { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.e { fill: none; stroke-width: 1.25; stroke-linecap: round; }
.e.off { stroke: var(--line); stroke-dasharray: 2 4; }
.e.on { stroke-dasharray: 5 4; animation: flow 1.2s linear infinite; }
.e.hold { stroke-dasharray: none; } .e.fade { opacity: .4; stroke-dasharray: none; }
.row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 3px 10px; padding: 10px 18px 10px calc(20px + var(--d, 0) * 28px); position: relative; --mix: 100%; --fam: var(--none); transition: background-color 140ms var(--ease-out); }
.row::after { content: ""; position: absolute; left: 0; top: 9px; bottom: 9px; width: 2px; background: color-mix(in srgb, var(--fam) var(--mix), var(--panel)); }
.row + .row { border-top: 1px solid #202833; }
.running .dot { box-shadow: 0 0 0 0 color-mix(in srgb, var(--run) 60%, transparent); animation: glow 1.6s ease-out infinite; }
.running::after { animation: bar-glow 1.6s ease-in-out infinite alternate; }
.running .bar-tok i { animation: bar-glow 1.6s ease-in-out infinite alternate; }
@keyframes glow { to { box-shadow: 0 0 0 7px transparent; } }
@keyframes bar-glow { from { opacity: .55; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .running .dot, .running::after, .running .bar-tok i { animation: none; } }
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
.usage-credits { color: var(--run); font-weight: 600; margin-right: 12px; }
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
.usage-windows { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); padding: 16px 18px; gap: 14px; }
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
.reset-credits { margin: 8px 12px 0; font-size: 12px; color: var(--good, #7ee787); }
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
.session-summary { display:flex; flex-wrap:wrap; gap:6px 18px; position:sticky; top:var(--strip-h, 0px); z-index:5; background:var(--panel); border-block:1px solid var(--line); padding:9px 18px; color:var(--muted); font-size:11px; border-radius:0; }
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
.last-known .remaining { opacity:.72; }
.last-known .usage-gauge { opacity:.55; }
.unknown .remaining { font-size:27px; color:var(--muted); }
.unknown .remaining small { display:block; margin:0; }
.unknown .usage-gauge { opacity:.35; }
.e { pointer-events:stroke; stroke:var(--sonnet); stroke-width:1.4; opacity:.28; fill:none; }
.e.flow-result { stroke:var(--cx); stroke-dasharray:5 3; }
.edge-label { font:600 9px var(--mono); paint-order:stroke; stroke:var(--panel); stroke-width:3px; stroke-linejoin:round; opacity:.95; pointer-events:none; }
.edge-label.delegate { fill:var(--sonnet); } .edge-label.result { fill:var(--cx); }
.e.fresh { opacity:.9; }
.e.delegate { stroke:var(--sonnet); }
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


/* ===== Mission-control theme (council: gpt-6.1-sol + Sonnet 5.5) ===== */
:root { --bg:#05070d; --panel:rgba(13,20,34,.72); --sunk:rgba(255,255,255,.05); --ink:#eaf0ff; --muted:#93a3c0; --line:rgba(140,170,255,.15);
  --run:#4dffb4; --wait:#ffc857; --fail:#ff6b86; --done:#7686a3; --down:#2de2ff; --up:#ff5fd2; --sonnet:#2de2ff; --cx:#ff5fd2; --opus:#a095ff;
  --ui: "Inter Variable", Inter, ui-sans-serif, system-ui, "Vazirmatn", "Segoe UI", sans-serif; }
body { font-family: var(--ui); font-size: 14px; background: radial-gradient(1200px 600px at 12% -10%, #14204a77, transparent), radial-gradient(900px 500px at 100% 0, #3a145055, transparent), var(--bg); background-attachment: fixed; }
body::before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1; background: linear-gradient(var(--line) 1px, transparent 1px) 0 0/52px 52px, linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0/52px 52px; opacity:.35; -webkit-mask: radial-gradient(ellipse at 50% 0, #000, transparent 72%); mask: radial-gradient(ellipse at 50% 0, #000, transparent 72%); }
.wrap { max-width: 3000px; padding: 28px clamp(12px, 2.5vw, 56px) 56px; gap: 24px; }
h1 { font-size: clamp(20px, 2vw, 26px); background: linear-gradient(90deg, var(--ink), var(--down) 60%, var(--up)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sess, .usage-card { border-radius: 16px; background: var(--panel); -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); border: 1px solid var(--line); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 24px 60px -34px #000; }
.sess { container: session / inline-size; }
.usage-card { container: quota / inline-size; }
.usage-card::before, .sess::before { content:""; position:absolute; left:18px; right:18px; top:0; height:1px; background: linear-gradient(90deg, transparent, var(--down), var(--up), transparent); opacity:.55; pointer-events:none; }
.usage-card { position: relative; }
.usage-windows { padding: 24px; gap: 24px; }
.remaining { font-size: clamp(32px, 5cqi, 46px); letter-spacing: -.05em; text-shadow: 0 0 28px color-mix(in srgb, var(--gauge, var(--muted)) 45%, transparent); }
.usage-gauge { height: 8px; margin-block: 10px; border-radius: 4px; }
.reset-clock { font-size: 12px; color: var(--ink); }
.sess-head .title { font-size: clamp(15px, 1.3vw, 18px); }
.row { min-height: 72px; margin: 4px 10px; border-radius: 12px; padding: 14px 18px 14px calc(34px + var(--d, 0) * 26px); gap: 5px 12px; border: 1px solid transparent; transition: background-color 160ms var(--ease-out), border-color 160ms var(--ease-out), box-shadow 160ms var(--ease-out); }
.row + .row { border-top: 1px solid transparent; }
.row::after { display: none; }
.row:hover { background: rgba(255,255,255,.035); border-color: var(--line); }
.row.running { background: color-mix(in srgb, var(--fam) 7%, transparent); border-color: color-mix(in srgb, var(--fam) 32%, transparent); box-shadow: 0 0 30px -12px var(--fam); }
.row.done-row, .row.done { opacity: .6; }
.dot { width: 11px; height: 11px; margin-top: 4px; background: transparent !important; border: 2px solid var(--done); border-radius: 50%; }
.codex .dot { border-radius: 3px; }
.running .dot { border-color: var(--run); background: var(--run) !important; box-shadow: 0 0 12px var(--run); animation: none; }
.waiting .dot, .idle .dot { border-color: var(--wait); } .failed .dot { border-color: var(--fail); }
.name b { font-size: 14px; }
.badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; }
.feedcol { padding: 22px; background: rgba(8,12,22,.55); }
.body { grid-template-columns: minmax(0, 1fr) clamp(260px, 22vw, 340px); }
.e { stroke-width: 1.2px; opacity: .22; stroke-linejoin: round; stroke-dasharray: none; }
.e.flow-delegate { stroke: var(--down); } .e.flow-result { stroke: var(--up); stroke-dasharray: none; }
.e.fresh { stroke-width: 1.7px; opacity: 1; }
.e.flow-delegate.fresh { color: var(--down); } .e.flow-result.fresh { color: var(--up); }
.e.fallback { stroke: var(--done); stroke-dasharray: none; opacity: .38; filter: none; }
.e.traffic-live { animation: none; }
.particle { filter: drop-shadow(0 0 4px currentColor); }
@container session (max-width: 900px) { .body { grid-template-columns: minmax(0, 1fr); } .feedcol { border-left: 0; border-top: 1px solid var(--line); } }
@container quota (max-width: 360px) { .usage-windows { grid-template-columns: 1fr; } .usage-window + .usage-window { padding: 16px 0 0; border-left: 0; border-top: 1px solid var(--line); } }
@media (min-width: 2400px) { #board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: start; } #board > .empty { grid-column: 1 / -1; } }
@media (max-width: 760px) { .row { margin: 3px 6px; padding-left: calc(28px + min(var(--d,0),3) * 14px); } .usage-windows { padding: 16px; gap: 16px; } .f, .mini, .alerts, .sess-x { min-height: 40px; } }
@media (prefers-reduced-motion: reduce) { .particle { display: none; } }

/* ===== Command-center units ===== */
h1 { display: flex; flex-direction: column; gap: 2px; }
.hud-tag { font: 600 10px var(--mono); letter-spacing: .28em; color: var(--down); -webkit-text-fill-color: var(--down); opacity: .85; }
.provider-mark.logo { width: 22px; height: 22px; border: 0; border-radius: 7px; padding: 4px; display: inline-grid; place-items: center; color: #ffb26b; background: rgba(255,178,107,.1); box-shadow: inset 0 0 0 1px rgba(255,178,107,.35), 0 0 16px -4px rgba(255,178,107,.5); }
.usage-card.codex-usage .provider-mark.logo { color: var(--cx); background: rgba(255,95,210,.1); box-shadow: inset 0 0 0 1px rgba(255,95,210,.35), 0 0 16px -4px rgba(255,95,210,.5); border-radius: 7px; }
.usage-card.unavailable .provider-mark.logo { color: var(--done); box-shadow: inset 0 0 0 1px var(--line); background: transparent; }
.name { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.unit { position: relative; flex: none; width: 28px; height: 28px; display: grid; place-items: center; --uc: var(--sonnet); }
.unit.codex { --uc: var(--cx); } .unit.claude { --uc: #ffb26b; }
.avatar { width: 28px; height: 28px; padding: 6px; border-radius: 9px; color: var(--uc); background: color-mix(in srgb, var(--uc) 10%, #060a14); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--uc) 45%, transparent); transition: filter 200ms var(--ease-out), box-shadow 200ms var(--ease-out); }
.unit.codex .avatar { border-radius: 50% 50% 50% 50% / 38% 38% 38% 38%; }
.running .avatar { box-shadow: inset 0 0 0 1px var(--uc), 0 0 18px -2px var(--uc); animation: unit-pulse 2.2s ease-in-out infinite; }
.running .unit::after { content: ""; position: absolute; inset: -4px; border-radius: 12px; border: 1px solid var(--uc); opacity: 0; animation: unit-ping 2.2s ease-out infinite; }
.waiting .avatar, .idle .avatar { filter: saturate(.55); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--wait) 55%, transparent); animation: unit-breathe 4s ease-in-out infinite; }
.done .avatar, .done-row .avatar { filter: grayscale(1) brightness(.75); animation: none; box-shadow: inset 0 0 0 1px var(--line); }
.failed .avatar { color: var(--fail); box-shadow: inset 0 0 0 1px var(--fail), 0 0 14px -4px var(--fail); animation: none; }
@keyframes unit-pulse { 50% { box-shadow: inset 0 0 0 1px var(--uc), 0 0 26px 0 var(--uc); } }
@keyframes unit-ping { 0% { transform: scale(.85); opacity: .7; } 100% { transform: scale(1.35); opacity: 0; } }
@keyframes unit-breathe { 50% { opacity: .55; } }
.state-pill { font: 700 9px var(--mono); letter-spacing: .16em; padding: 2px 7px; border-radius: 999px; color: var(--done); background: rgba(255,255,255,.05); border: 1px solid var(--line); }
.state-pill.s-running { color: #04130c; background: var(--run); border-color: var(--run); box-shadow: 0 0 14px -2px var(--run); }
.state-pill.s-waiting, .state-pill.s-idle { color: var(--wait); background: color-mix(in srgb, var(--wait) 10%, transparent); border-color: color-mix(in srgb, var(--wait) 40%, transparent); }
.state-pill.s-failed { color: var(--fail); background: color-mix(in srgb, var(--fail) 12%, transparent); border-color: var(--fail); }
.eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
.eq i { width: 2px; background: var(--run); border-radius: 1px; height: 4px; animation: eq 900ms ease-in-out infinite; }
.eq i:nth-child(2) { animation-delay: -.3s; } .eq i:nth-child(3) { animation-delay: -.6s; } .eq i:nth-child(4) { animation-delay: -.15s; }
@keyframes eq { 0%, 100% { height: 3px; } 50% { height: 12px; } }
.row.running::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: linear-gradient(100deg, transparent 35%, color-mix(in srgb, var(--fam) 14%, transparent) 50%, transparent 65%); background-size: 250% 100%; animation: scan 3.6s linear infinite; }
@keyframes scan { from { background-position: 150% 0; } to { background-position: -50% 0; } }
@media (prefers-reduced-motion: reduce) { .running .avatar, .running .unit::after, .eq i, .row.running::before, .waiting .avatar, .idle .avatar { animation: none !important; } }
/* ===== Usage cards v2: per-window rows, reset credits, renewal footer (logical properties keep it RTL-safe) ===== */
.usage-windows { display: grid; grid-template-columns: minmax(0, 1fr); padding: 6px 24px; gap: 0; }
.uw { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name pct" "bar bar"; align-items: end; gap: 2px 16px; padding-block: 16px; }
.uw + .uw { border-block-start: 1px solid var(--line); }
.uw-name { grid-area: name; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.uw .window-label { font-size: 13px; font-weight: 600; color: var(--ink); letter-spacing: -.01em; }
.uw-pct { grid-area: pct; font: 500 clamp(28px, 5cqi, 40px)/1.05 var(--mono); letter-spacing: -.05em; color: var(--gauge, var(--muted)); text-shadow: 0 0 26px color-mix(in srgb, var(--gauge, var(--muted)) 40%, transparent); text-align: end; white-space: nowrap; unicode-bidi: isolate; }
.uw-pct small { font: 11px/1.4 var(--ui); letter-spacing: 0; color: var(--muted); margin-inline-start: 6px; text-shadow: none; }
.uw-bar { grid-area: bar; min-width: 0; display: grid; gap: 8px; }
.uw .usage-gauge { position: relative; overflow: visible; height: 8px; margin: 10px 0 0; border-radius: 4px; background: var(--sunk); }
.uw .usage-gauge i { border-radius: 4px; min-width: 3px; }
.uw .usage-gauge::after { border-radius: 4px; }
.uw .usage-gauge .pace { position: absolute; z-index: 2; inset-block: -4px; inset-inline-start: var(--even, 0%); width: 2px; margin-inline-start: -1px; border-radius: 1px; background: var(--ink); opacity: .85; box-shadow: 0 0 0 1px rgba(5,7,13,.7); }
.uw-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; color: var(--muted); font-size: 12px; min-width: 0; }
.uw-meta > * { min-width: 0; overflow-wrap: anywhere; }
.uw-count { color: var(--ink); font-weight: 500; }
.uw-abs { font-family: var(--mono); font-size: 11px; }
.uw-pace { font-size: 11px; } .uw-pace.fast { color: var(--wait); }
.uw .projection { display: inline; margin: 0; }
.uw.last-known .uw-pct { opacity: .72; } .uw.last-known .usage-gauge i { opacity: .55; }
.uw.unknown .uw-pct { font-size: 24px; color: var(--muted); } .uw.unknown .usage-gauge { opacity: .35; }
.ucredits { margin-inline: 24px; padding-block: 14px 16px; border-block-start: 1px solid var(--line); display: grid; gap: 10px; }
.uc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.uc-head h3 { margin: 0; font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); }
.uc-head span { font-size: 11px; color: var(--muted); }
.uc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.ucredit { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.025); }
.ucredit.confirming { border-color: color-mix(in srgb, var(--wait) 55%, transparent); }
.uc-main { min-width: 0; display: grid; gap: 2px; }
.uc-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.uc-title { font-size: 13px; font-weight: 600; }
.uc-count { font: 600 10px/1.6 var(--mono); padding: 0 7px; border-radius: 999px; color: var(--run); background: color-mix(in srgb, var(--run) 12%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--run) 35%, transparent); }
.uc-desc { font-size: 11px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.uc-exp { font-size: 11px; color: var(--muted); } .uc-exp.soon { color: var(--wait); }
.uc-btn { min-height: 32px; padding: 0 16px; border-radius: 8px; border: 1px solid var(--line); background: var(--sunk); color: var(--ink); font: 600 12px var(--ui); cursor: pointer; transition: transform 140ms var(--ease-out), background-color 150ms var(--ease-out), border-color 150ms var(--ease-out), opacity 150ms var(--ease-out); }
.uc-btn.primary { border-color: color-mix(in srgb, var(--run) 50%, transparent); color: var(--run); background: color-mix(in srgb, var(--run) 9%, transparent); }
.uc-btn.danger { border-color: color-mix(in srgb, var(--wait) 70%, transparent); color: #1a1200; background: var(--wait); }
.uc-btn:active:not(:disabled) { transform: scale(.97); }
.uc-btn:disabled { opacity: .42; cursor: not-allowed; }
.uc-btn:focus-visible { outline: 2px solid var(--sonnet); outline-offset: 2px; }
.uc-confirm { grid-column: 1 / -1; display: grid; gap: 10px; padding-block-start: 10px; border-block-start: 1px dashed var(--line); }
.uc-confirm p { margin: 0; font-size: 12px; line-height: 1.55; color: var(--ink); overflow-wrap: anywhere; }
.uc-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.uc-notice { padding: 9px 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; border: 1px solid; }
.uc-notice.ok { color: var(--run); border-color: color-mix(in srgb, var(--run) 45%, transparent); background: color-mix(in srgb, var(--run) 8%, transparent); }
.uc-notice.bad { color: var(--wait); border-color: color-mix(in srgb, var(--wait) 45%, transparent); background: color-mix(in srgb, var(--wait) 8%, transparent); }
.usage-foot { padding-inline: 24px; }
.usage-renew { color: var(--ink); font-size: 11px; } .usage-renew.warning { color: var(--wait); font-weight: 600; }
@media (hover: hover) and (pointer: fine) {
  .uc-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 12%, transparent); }
  .uc-btn.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--run) 18%, transparent); }
  .uc-btn.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--wait) 85%, #fff); }
}
@media (max-width: 760px) {
  .usage-windows { padding: 2px 16px; } .ucredits { margin-inline: 16px; } .usage-foot { padding-inline: 16px; }
  .ucredit { grid-template-columns: minmax(0, 1fr); } .ucredit > .uc-btn { justify-self: stretch; min-height: 40px; }
  .uc-actions .uc-btn { flex: 1 1 0; min-height: 40px; }
}
@media (max-width: 380px) { .uw { grid-template-columns: minmax(0, 1fr); grid-template-areas: "name" "pct" "bar"; } .uw-pct { text-align: start; } }
/* ===== Usage strip v3: one compact sticky row, details in a popover that never pushes the board down ===== */
html { scroll-padding-top: calc(var(--strip-h, 0px) + 12px); }
.usage { position: sticky; top: 0; z-index: 20; padding: 8px clamp(12px, 2.5vw, 56px); background: linear-gradient(rgba(5,7,13,.94), rgba(5,7,13,.84)); -webkit-backdrop-filter: blur(18px) saturate(1.3); backdrop-filter: blur(18px) saturate(1.3); border-block-end: 1px solid var(--line); box-shadow: 0 14px 30px -22px #000; }
.usage-strip { max-width: 3000px; margin-inline: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ug { position: relative; min-width: 0; --pc: #ffb26b; }
.ug-codex { --pc: var(--cx); }
.ug-btn { line-height: 1.2; appearance: none; width: 100%; min-height: 52px; margin: 0; padding: 7px 12px; display: flex; align-items: center; gap: 14px; font: inherit; color: var(--ink); text-align: start; cursor: pointer; border: 1px solid var(--line); border-radius: 12px; background: rgba(13,20,34,.62); box-shadow: inset 0 1px 0 rgba(255,255,255,.06); transition: background-color 150ms var(--ease-out), border-color 150ms var(--ease-out); }
.ug-btn:active:not(:disabled) { transform: none; }
.ug-btn:focus-visible { outline: 2px solid var(--sonnet); outline-offset: 2px; }
.ug.open .ug-btn { border-color: color-mix(in srgb, var(--pc) 55%, var(--line)); background: rgba(20,30,52,.85); }
.ug.limited .ug-btn { border-color: #8b4751; background: color-mix(in srgb, var(--fail) 8%, rgba(13,20,34,.62)); }
.ug-id { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.ug-id b { font-size: 13px; font-weight: 650; letter-spacing: -.015em; }
.ug.unavailable .ug-id b { color: var(--muted); }
.ug .provider-mark.logo { width: 22px; height: 22px; margin: 0; }
.ug-codex .provider-mark.logo { color: var(--cx); background: rgba(255,95,210,.1); box-shadow: inset 0 0 0 1px rgba(255,95,210,.35), 0 0 16px -4px rgba(255,95,210,.5); }
.ug.unavailable .provider-mark.logo { color: var(--done); box-shadow: inset 0 0 0 1px var(--line); background: transparent; }
.ug-segs { flex: 1 1 auto; min-width: 0; display: flex; gap: 14px; }
.us { flex: 1 1 var(--w, 80px); min-width: 0; display: grid; gap: 4px; }
.us-top { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; min-width: 0; }
.us-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; color: var(--muted); }
.us-pct { flex: none; font: 600 13px/1 var(--mono); letter-spacing: -.04em; color: var(--gauge, var(--muted)); unicode-bidi: isolate; }
.us .usage-gauge { height: 4px; margin: 0; overflow: visible; border-radius: 2px; background: var(--sunk); }
.us .usage-gauge::after { display: none; }
.us .usage-gauge i { border-radius: 2px; min-width: 2px; }
.us .usage-gauge .pace { position: absolute; z-index: 2; inset-block: -2px; inset-inline-start: var(--even, 0%); width: 2px; margin-inline-start: -1px; border-radius: 1px; background: var(--ink); opacity: .85; box-shadow: 0 0 0 1px rgba(5,7,13,.7); }
.us-reset { font: 10px/1 var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; unicode-bidi: isolate; }
.us.last-known .us-pct { opacity: .72; } .us.last-known .usage-gauge i { opacity: .5; } .us.last-known .us-reset { color: var(--wait); }
.us.unknown .us-pct { color: var(--muted); } .us.unknown .usage-gauge { opacity: .35; }
.ug.stale .ug-segs { opacity: .62; }
.ug-note { flex: 1 1 auto; font-size: 12px; color: var(--muted); }
.ug-chips { flex: none; display: inline-flex; align-items: center; gap: 6px; }
.ug-chip { font: 600 10px/1 var(--mono); padding: 4px 8px; border-radius: 999px; color: var(--muted); border: 1px solid var(--line); white-space: nowrap; unicode-bidi: isolate; }
.ug-chip.good { color: var(--run); border-color: color-mix(in srgb, var(--run) 38%, transparent); background: color-mix(in srgb, var(--run) 9%, transparent); }
.ug-chip.warn { color: var(--wait); border-color: color-mix(in srgb, var(--wait) 45%, transparent); background: color-mix(in srgb, var(--wait) 9%, transparent); }
.ug-chip.danger { color: var(--fail); border-color: color-mix(in srgb, var(--fail) 55%, transparent); background: color-mix(in srgb, var(--fail) 10%, transparent); }
.ug-chev { width: 12px; height: 12px; color: var(--muted); transition: transform 180ms var(--ease-out); }
.ug.open .ug-chev { transform: rotate(180deg); color: var(--ink); }
.ug .reset-marker { margin-inline-start: -3px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
/* Popover: absolutely positioned under its group, so opening it never moves the session list. */
.ug-panel { position: absolute; z-index: 30; inset-block-start: calc(100% + 6px); inset-inline-start: 0; width: min(580px, calc(100vw - 24px)); max-height: calc(100dvh - var(--strip-h, 72px) - 20px); overflow: hidden auto; overscroll-behavior: contain; border-radius: 16px; background: linear-gradient(rgba(16,24,42,.985), rgba(10,15,28,.985)); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 30px 70px -20px #000, 0 0 0 1px rgba(5,7,13,.6); transform-origin: top left; }
.ug-codex .ug-panel { inset-inline-start: auto; inset-inline-end: 0; transform-origin: top right; }
[dir="rtl"] .ug-panel { transform-origin: top right; } [dir="rtl"] .ug-codex .ug-panel { transform-origin: top left; }
.ug.open .ug-panel { animation: ug-in 170ms var(--ease-out); }
@keyframes ug-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } }
.ug-panel .usage-head { padding: 14px 18px 12px; }
.ug-close { margin-inline-start: 6px; width: 28px; height: 28px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--muted); font: 16px/1 var(--ui); cursor: pointer; }
.ug-close:hover { color: var(--ink); background: var(--sunk); }
.ug-panel .usage-state { margin-inline-start: auto; }
.ug-panel .usage-windows { padding: 2px 20px; }
.ug-panel .uw { padding-block: 12px; }
.ug-panel .uw-pct { font-size: 30px; }
.ug-panel .ucredits { margin-inline: 20px; }
.ug-panel .usage-foot { padding-inline: 20px; }
/* Early-reset notice: one slim, dismissible line. */
.usage-resets { display: block; }
.usage-resets[hidden] { display: none; }
.usage-reset { display: flex; align-items: center; gap: 10px; min-height: 32px; max-height: 40px; padding: 4px 6px 4px 12px; border-radius: 10px; font-size: 12px; background: color-mix(in srgb, var(--run) 7%, var(--panel)); }
.usage-reset.early { background: color-mix(in srgb, var(--wait) 8%, var(--panel)); }
.usage-reset .ur-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.usage-reset .ur-more { flex: none; font: 10px var(--mono); opacity: .8; }
.usage-reset .ur-x { flex: none; width: 24px; min-height: 24px; height: 24px; padding: 0; border-radius: 6px; border-color: transparent; background: transparent; color: inherit; font-size: 15px; line-height: 1; }
/* Everything above the first session row stays short. */
.wrap { padding-block-start: 14px; gap: 14px; }
.bar { padding-top: 0; gap: 6px 14px; }
h1 { flex-direction: row; align-items: baseline; gap: 4px 12px; }
.toolbar { padding-bottom: 10px; }
@media (hover: hover) and (pointer: fine) { .ug-btn:hover { background: rgba(26,38,66,.8); border-color: color-mix(in srgb, var(--pc) 40%, var(--line)); } .ug-close { transition: background-color 150ms var(--ease-out), color 150ms var(--ease-out); } }
@media (max-width: 1000px) { .usage-strip { grid-template-columns: minmax(0, 1fr); gap: 6px; } .usage { padding-block: 6px; } .ug-btn { min-height: 48px; padding-block: 5px; } }
@media (max-width: 760px) {
  .ug { position: static; }
  .ug-panel, .ug-codex .ug-panel { inset-inline: 0; inset-block-start: 100%; width: auto; border-radius: 0 0 16px 16px; max-height: calc(100dvh - var(--strip-h, 120px)); transform-origin: top center; }
  .usage { padding-block: 3px; } .usage-strip { gap: 3px; }
  .ug-btn { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "id chips" "segs segs"; gap: 2px 8px; min-height: 0; padding: 3px 10px 4px; border-radius: 10px; }
  .ug-id { grid-area: id; } .ug-chips { grid-area: chips; } .ug-segs { grid-area: segs; gap: 10px; } .ug-note { grid-area: segs; }
  .ug .provider-mark.logo { width: 16px; height: 16px; padding: 2px; border-radius: 5px; }
  .ug-id { gap: 6px; } .ug-id b { font-size: 12px; }
  .ug-chip { padding: 2px 6px; font-size: 9.5px; line-height: 1.2; }
  .us { gap: 2px; } .us-top { height: 12px; align-items: center; line-height: 1; } .us-label { font-size: 10px; line-height: 1; } .us-pct { font-size: 12px; } .us-reset { font-size: 9.5px; }
  .ug-btn .ug-id { min-height: 0; }
  .bar { flex-wrap: nowrap; gap: 8px; } .bar .alerts { width: 116px; min-height: 36px; padding-inline: 8px; flex: none; } .live { font-size: 10px; min-width: 0; } h1 { font-size: 20px; flex: none; }
  .toolbar .f { padding-inline: 7px; gap: 5px; }
  .ug-panel .usage-windows { padding: 2px 16px; } .ug-panel .ucredits { margin-inline: 16px; } .ug-panel .usage-foot { padding-inline: 16px; }
  .hud-tag { display: none; }
  .legend { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; gap: 6px 16px; white-space: nowrap; padding-bottom: 2px; }
  .legend::-webkit-scrollbar { display: none; }
  .legend > span:last-child { flex-basis: auto; max-width: none; }
  .wrap { padding-block-start: 10px; gap: 10px; }
}
</style>
</head>
<body>
<section class="usage" id="usage" aria-label="Account usage">
  <div class="usage-strip">
    <article class="ug unavailable" id="usage-claude" aria-label="Claude usage">
      <button type="button" class="ug-btn" id="usage-claude-btn" data-usage-toggle="claude" aria-expanded="false" aria-controls="usage-claude-panel"><span class="ug-id"><span class="provider-mark" aria-hidden="true"></span><b>Claude</b></span><span class="ug-note">Connecting…</span></button>
      <div class="usage-card ug-panel" id="usage-claude-panel" role="region" aria-label="Claude usage details" hidden></div>
    </article>
    <article class="ug ug-codex unavailable" id="usage-codex" aria-label="Codex usage">
      <button type="button" class="ug-btn" id="usage-codex-btn" data-usage-toggle="codex" aria-expanded="false" aria-controls="usage-codex-panel"><span class="ug-id"><span class="provider-mark" aria-hidden="true"></span><b>Codex</b></span><span class="ug-note">Connecting…</span></button>
      <div class="usage-card codex-usage ug-panel" id="usage-codex-panel" role="region" aria-label="Codex usage details" hidden></div>
    </article>
  </div>
</section>
<main class="wrap">
  <div class="usage-resets" id="usage-resets" aria-live="polite" hidden></div>
  <header class="bar">
    <h1><span class="hud-tag">◉ MISSION CONTROL</span>Agent board</h1>
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
var resetNotices = new Map(), resetTitlePending = false;
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
function isDismissed(s) { return dismissed[s.sessionId] !== undefined && stamp(s) <= dismissed[s.sessionId] + 15000 && !pinned[s.sessionId]; }
function matches(s, info) {
  if (isDismissed(s)) return false;
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
function windowStale(w, data, now) {
  var at = windowReset(w), seen = validDate(w.asOf) ? w.asOf : data && data.asOf;
  return !!(w.stale || data && data.stale || !validDate(seen) || seen > now || now - seen >= 1800000 || at !== null && at <= now);
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
  });
  if (changed) store.set('usageResetLastSeen', resetLastSeen);
  return changed;
}
function renderResetNotices() {
  var el = document.getElementById('usage-resets'), entries = Array.from(resetNotices.entries()), first = entries[0];
  el.hidden = !first;
  setHtml(el, first ? '<div class="usage-reset' + (first[1].kind === 'early' ? ' early' : '') + '"><span class="ur-text" title="' + esc(first[1].text) + '">' + esc(first[1].text) + '</span>' + (entries.length > 1 ? '<span class="ur-more">+' + (entries.length - 1) + ' more</span>' : '') + '<button type="button" class="mini ur-x" data-dismiss-reset="' + esc(first[0]) + '" aria-label="Dismiss: ' + esc(first[1].text) + '" title="Dismiss">×</button></div>' : '');
}
window.addEventListener('focus', function () { resetTitlePending = false; updateUsageTitle(); });
function sampleUsage(provider, data) {
  if (!data || !Array.isArray(data.windows)) return;
  data.windows.forEach(function (w, index) {
    if (!w || windowStale(w, data, serverNow()) || !finiteNumber(w.usedPct)) return;
    var key = provider + '|' + (w.id || w.label || index), at = w.asOf || data.asOf || serverNow();
    var samples = usageSamples.get(key) || [], last = samples[samples.length - 1];
    if (last && (w.resetsAt !== last.reset || w.usedPct < last.used)) samples = [];
    last = samples[samples.length - 1];
    if (!last || at > last.at) samples.push({ at: at, used: w.usedPct, reset: w.resetsAt });
    usageSamples.set(key, samples.filter(function (p) { return at - p.at < 3600000; }).slice(-60));
  });
}
function projection(provider, w, index, left) {
  if (left === null || windowStale(w, null, serverNow())) return '';
  var samples = usageSamples.get(provider + '|' + (w.id || w.label || index)) || [];
  if (samples.length < 2) return '';
  var first = samples[0], last = samples[samples.length - 1], rate = (last.used - first.used) / (last.at - first.at);
  if (!(rate > 0)) return '';
  var at = serverNow() + left / rate;
  if (!validDate(at)) return '';
  return '<span class="projection" title="Estimated exhaustion time from recent usage; the pace may change">At this pace ~' + esc(new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })) + '</span>';
}
var redeemState = { busy: false, pending: null, notice: null, timer: 0 }, usageAgain = false;
var CREDIT_EFFECT = {
  fable: "Refills your 5-hour window and Fable's weekly usage. It doesn't reset the whole week.",
  session: 'Refills your 5-hour window.',
  weekly: 'Refills your weekly allowance.',
  full: 'Refills your 5-hour window and your whole week.'
};
function gaugeColor(left, severity) {
  if (left === null) return 'var(--done)';
  if (severity === 'critical' || severity === 'exhausted' || left < 15) return 'var(--fail)';
  if (left <= 40 || severity === 'warning' || severity === 'elevated') return 'var(--wait)';
  return 'var(--run)';
}
function absStamp(at) {
  return new Date(at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + clock24(at);
}
function shortDate(at) { return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
// Where the gauge would sit if the allowance were used evenly across the window (percent remaining).
function evenPace(w, at, now, left) {
  if (left === null || at === null || !finiteNumber(w.windowMinutes) || w.windowMinutes <= 0) return null;
  var elapsed = Math.max(0, Math.min(1, 1 - (at - now) / (w.windowMinutes * 60000)));
  return Math.round((1 - elapsed) * 1000) / 10;
}
function windowRow(provider, data, w, index, events, now) {
  var known = finiteNumber(w.usedPct), used = known ? Math.max(0, Math.min(100, w.usedPct)) : null;
  var at = windowReset(w), old = windowStale(w, data, now), left = known ? Math.round((100 - used) * 10) / 10 : null;
  if (left !== null && !old) worstRemaining = worstRemaining === null ? left : Math.min(worstRemaining, left);
  var label = windowLabel(w), color = gaugeColor(left, w.severity), even = old ? null : evenPace(w, at, now, left);
  var latest = events.find(function (e) { return e.window === w.id; });
  var paceText = even === null || left === null ? '' : left < even - 5 ? 'Faster than even pace' : left > even + 5 ? 'Slower than even pace' : 'On even pace';
  var passed = at !== null && at <= now;
  var meta = '<span class="uw-count" data-count="' + (at === null ? '' : at) + '"></span>' + (at !== null ? '<span class="uw-abs">' + esc(absStamp(at)) + '</span>' : '')
    + (paceText ? '<span class="uw-pace' + (left < even - 5 ? ' fast' : '') + '">' + paceText + '</span>' : '')
    + (passed ? '<span class="reset-note">Scheduled reset passed · awaiting a new usage reading</span>' : projection(provider, w, index, left))
    + (validDate(w.asOf) && w.asOf !== data.asOf ? '<span class="usage-asof" data-asof="' + w.asOf + '"></span>' : '');
  return '<div class="uw' + (left === null ? ' unknown' : '') + (old && left !== null ? ' last-known' : '') + '"' + (!old ? ' data-fresh-until="' + Math.min(at === null ? Infinity : at, (w.asOf || data.asOf) + 1800000) + '"' : '')
    + ' style="--gauge:' + color + ';--left:' + (left === null ? 0 : left) + '%' + (even === null ? '' : ';--even:' + even + '%') + '">'
    + '<div class="uw-name"><span class="window-label">' + esc(label) + '</span>' + (latest && latest.kind === 'early' ? '<span class="early-reset" title="' + esc(resetDescription(latest)) + '">Early reset</span>' : '') + '</div>'
    + '<div class="uw-pct">' + (left === null ? 'Unknown' : String(left) + '%') + '<small>' + (left === null ? 'no reading yet' : old ? 'left · last known' : 'left') + '</small></div>'
    + '<div class="uw-bar"><div class="usage-gauge" role="img" aria-label="' + esc(label + ': ' + (left === null ? 'no reading yet' : left + '% left' + (old ? ' (last known)' : '') + (even === null ? '' : ', even pace would leave ' + even + '%'))) + '"><i></i>'
    + (even === null ? '' : '<b class="pace" title="Even pace: ' + even + '% would be left by now"></b>') + '</div>'
    + '<div class="uw-meta">' + (used === null ? '<span>No usage reading</span>' : old ? '<span class="reset-history">Last observed ' + used + '% used</span>' : '') + meta + '</div></div></div>';
}
function creditRow(provider, c, now) {
  var pend = redeemState.pending, mine = pend && pend.provider === provider && pend.id === c.id, claude = provider === 'claude';
  var canUse = claude && c.canUse && !!c.id && !redeemState.busy;
  var title = c.title || 'Reset', effect = CREDIT_EFFECT[c.kind] || 'Refills your usage limits.';
  var exp = validDate(c.expiresAt) ? c.expiresAt : null, soon = exp !== null && exp - now < 3 * 86400000;
  var count = finiteNumber(c.count) && c.count > 0 ? c.count : 1;
  var html = '<li class="ucredit' + (mine ? ' confirming' : '') + '"><div class="uc-main"><div class="uc-line"><b class="uc-title">' + esc(title) + '</b><span class="uc-count">' + count + ' left</span></div>'
    + (c.description ? '<div class="uc-desc">' + esc(c.description) + '</div>' : '')
    + '<div class="uc-exp' + (soon ? ' soon' : '') + '">' + (exp === null ? 'No expiry date' : esc(shortDate(exp)) + ' · <span data-exp="' + exp + '"></span>') + '</div></div>'
    + '<button type="button" class="uc-btn primary" data-focus="use-' + esc(provider + '-' + c.id) + '" data-redeem-ask="' + esc(c.id) + '" data-provider="' + provider + '"'
    + (canUse && !mine ? '' : ' disabled') + (claude ? '' : ' title="Redeem in Codex"') + (claude && !c.canUse ? ' title="Not usable right now"' : '') + '>Use</button>';
  if (mine) {
    var busy = pend.step === 'busy';
    html += '<div class="uc-confirm" role="group" aria-label="Confirm ' + esc(title) + '">'
      + (busy ? '<p role="status"><strong>Using ' + esc(title) + '…</strong> Waiting for Anthropic.</p>'
              : '<p><strong>Use this ' + esc(title) + '?</strong> ' + esc(effect) + ' It spends one credit and cannot be undone.</p>')
      + '<div class="uc-actions"><button type="button" class="uc-btn" data-focus="redeem-cancel" data-redeem-cancel="1"' + (busy ? ' disabled' : '') + '>Cancel</button>'
      + '<button type="button" class="uc-btn danger" data-focus="redeem-go" data-redeem-go="' + esc(c.id) + '" data-provider="' + provider + '"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Using…' : 'Use reset') + '</button></div></div>';
  }
  return html + '</li>';
}
function creditsSection(provider, credits, now) {
  if (!credits) return '';
  var items = Array.isArray(credits.items) ? credits.items.filter(function (c) { return c && typeof c === 'object'; }) : [];
  var notice = redeemState.notice && redeemState.notice.provider === provider ? redeemState.notice : null;
  return '<section class="ucredits" aria-label="Reset credits"><div class="uc-head"><h3>Resets</h3><span>' + (items.length ? credits.available + ' available' : 'None available') + '</span></div>'
    + (notice ? '<div class="uc-notice ' + (notice.ok ? 'ok' : 'bad') + '" role="status">' + esc(notice.text) + '</div>' : '')
    + (items.length ? '<ul class="uc-list">' + items.map(function (c) { return creditRow(provider, c, now); }).join('') + '</ul>' : '') + '</section>';
}
// ----- Compact strip: one slim segment per window; the full detail lives in the popover panel below -----
var usageOpen = null, CHEV = '<svg class="ug-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function stripColor(left, severity, limited) {
  if (left === null) return 'var(--done)';
  if (limited || left <= 5 || severity === 'exhausted') return 'var(--fail)';
  if (left <= 15 || severity === 'critical') return 'var(--wait)';
  return 'var(--run)';
}
function stripSeg(data, w, now) {
  var known = finiteNumber(w.usedPct), used = known ? Math.max(0, Math.min(100, w.usedPct)) : null;
  var at = windowReset(w), old = windowStale(w, data, now), left = known ? Math.round((100 - used) * 10) / 10 : null;
  var even = old ? null : evenPace(w, at, now, left), label = String(windowLabel(w)).replace(/ window$/, '');
  var color = stripColor(left, w.severity, left !== null && left <= 0 && !old);
  var title = label + ': ' + (left === null ? 'no reading yet' : left + '% left' + (old ? ' (last known)' : '')) + (at !== null ? ' · resets ' + absStamp(at) : '') + (even === null ? '' : ' · even pace would leave ' + even + '%');
  return '<span class="us' + (left === null ? ' unknown' : '') + (old && left !== null ? ' last-known' : '') + '" title="' + esc(title) + '" style="--gauge:' + color + ';--left:' + (left === null ? 0 : left) + '%' + (even === null ? '' : ';--even:' + even + '%') + ';--w:' + Math.round(label.length * 5.4 + 40) + 'px">'
    + '<span class="us-top"><span class="us-label">' + esc(label) + '</span><b class="us-pct">' + (left === null ? '—' : Math.round(left) + '%') + '<span class="sr"> left' + (old ? ', last known' : '') + '</span></b></span>'
    + '<span class="usage-gauge" aria-hidden="true"><i></i>' + (even === null ? '' : '<b class="pace"></b>') + '</span>'
    + '<span class="us-reset" data-rs="' + (at === null ? '' : at) + '"></span></span>';
}
function usageStrip(provider, data, ctx) {
  var name = provider === 'claude' ? 'Claude' : 'Codex';
  var html = '<span class="ug-id"><span class="provider-mark logo" aria-hidden="true">' + LOGOS[provider] + '</span><b>' + name + '</b>' + (ctx.marker ? '<span class="reset-marker" title="A usage window reset">✓</span>' : '') + '</span>';
  if (!ctx.available) html += '<span class="ug-note">Usage unavailable</span>';
  else if (!ctx.windows.length) html += '<span class="ug-note">No usage windows reported</span>';
  else html += '<span class="ug-segs">' + ctx.windows.map(function (w) { return stripSeg(data, w, ctx.now); }).join('') + '</span>';
  var chips = '';
  if (ctx.limited) chips += '<span class="ug-chip danger">Limit reached</span>';
  if (ctx.credits && ctx.credits.available > 0) chips += '<span class="ug-chip good" title="Reset credits you can use">' + ctx.credits.available + (ctx.credits.available === 1 ? ' reset' : ' resets') + '</span>';
  if (ctx.renewAt !== null) chips += '<span class="ug-chip" data-renew-chip="' + ctx.renewAt + '"></span>';
  return html + '<span class="ug-chips">' + chips + CHEV + '</span>';
}
function usageCard(provider, data) {
  var now = serverNow(), name = provider === 'claude' ? 'Claude' : 'Codex', available = data && Array.isArray(data.windows);
  var windows = available ? data.windows.filter(function (w) { return w && typeof w === 'object'; }) : [];
  var stale = windows.some(function (w) { return windowStale(w, data, now); });
  var observed = windows.some(function (w) { return finiteNumber(w.usedPct) && !windowStale(w, data, now); });
  var limited = windows.some(function (w) { return w.usedPct >= 100 && !windowStale(w, data, now); });
  var marker = Array.from(resetNotices.values()).some(function (n) { return n.provider === provider; });
  var group = document.getElementById('usage-' + provider), panel = document.getElementById('usage-' + provider + '-panel');
  var events = resetEvents(data), historyOpen = panel.querySelector('.usage-history[open]');
  var credits = available && data.resetCredits && finiteNumber(data.resetCredits.available) ? data.resetCredits : null;
  var renewAt = available ? (data.renewal && validDate(data.renewal.at) ? data.renewal.at : validDate(data.expiresAt) ? data.expiresAt : null) : null;
  group.classList.toggle('unavailable', !available); group.classList.toggle('limited', limited); group.classList.toggle('stale', available && stale && !observed);
  panel.classList.toggle('unavailable', !available); panel.classList.toggle('limited', limited);
  setHtml(document.getElementById('usage-' + provider + '-btn'), usageStrip(provider, data, { available: available, windows: windows, limited: limited, marker: marker, credits: credits, renewAt: renewAt, now: now }));
  var state = !available ? 'Usage unavailable' : limited ? 'Limit reached' : stale ? 'Old reading' : observed ? 'Available' : 'No reading yet';
  var html = '<div class="usage-head"><span class="provider-mark logo" aria-hidden="true">' + LOGOS[provider] + '</span><h2>' + name + '</h2><span class="plan">' + esc(available && data.plan || 'Plan unknown') + '</span><span class="usage-state' + (limited ? ' danger' : '') + '">' + state + '</span><button type="button" class="ug-close" data-usage-close="1" data-focus="usage-close-' + provider + '" aria-label="Close ' + name + ' details" title="Close (Esc)">×</button></div>';
  if (!available) html += '<div class="usage-empty">Usage unavailable. Retrying every 15 seconds.</div>';
  else if (!windows.length) html += '<div class="usage-empty">No usage windows reported.</div>';
  else html += '<div class="usage-windows">' + windows.map(function (w, index) { return windowRow(provider, data, w, index, events, now); }).join('') + '</div>';
  html += creditsSection(provider, credits, now);
  html += events.length ? '<details class="usage-history"' + (historyOpen ? ' open' : '') + '><summary><strong>Reset history</strong> · ' + esc(resetDescription(events[0])) + '</summary><ol>' + events.map(function (e) { return '<li>' + esc(resetWindowLabel(data, e) + ' · ' + resetDescription(e)) + '</li>'; }).join('') + '</ol></details>' : '<div class="usage-history">Reset history · No resets observed yet</div>';
  html += '<div class="usage-foot">' + (renewAt === null ? '<span class="usage-renew">Renewal date unavailable</span>' : '<span class="usage-renew" data-renew="' + renewAt + '"></span>') + '<span class="usage-asof" data-asof="' + (available && validDate(data.asOf) ? data.asOf : '') + '"></span></div>';
  setHtml(panel, html);
}
function applyUsageOpen() {
  ['claude', 'codex'].forEach(function (p) {
    var open = usageOpen === p, group = document.getElementById('usage-' + p);
    document.getElementById('usage-' + p + '-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
    document.getElementById('usage-' + p + '-panel').hidden = !open; group.classList.toggle('open', open);
  });
}
function setUsageOpen(provider, refocus) {
  usageOpen = provider || null; applyUsageOpen();
  if (!usageOpen && refocus) { var b = document.getElementById('usage-' + refocus + '-btn'); if (b) b.focus({ preventScroll: true }); }
}
function syncStripHeight() { var el = document.getElementById('usage'); document.documentElement.style.setProperty('--strip-h', Math.ceil(el.getBoundingClientRect().height) + 'px'); }
if (window.ResizeObserver) new ResizeObserver(syncStripHeight).observe(document.getElementById('usage'));
function clearRedeemNotice() { redeemState.notice = null; renderUsage(); }
async function redeemCredit(provider, id) {
  if (redeemState.busy || provider !== 'claude') return;
  redeemState.busy = true; redeemState.pending = { provider: provider, id: id, step: 'busy' }; clearTimeout(redeemState.timer); redeemState.notice = null; renderUsage();
  var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 30000), notice;
  try {
    var response = await fetch('usage/redeem', { method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: provider, grantId: id }) });
    var body = null; try { body = await response.json(); } catch (error) { body = null; }
    notice = { provider: provider, ok: !!(body && body.ok), text: body && typeof body.message === 'string' && body.message ? body.message : 'Request failed (HTTP ' + response.status + ').' };
  } catch (error) { notice = { provider: provider, ok: false, text: 'The request did not finish. Check your usage before trying again.' }; }
  clearTimeout(timeout);
  redeemState.busy = false; redeemState.pending = null; redeemState.notice = notice;
  redeemState.timer = setTimeout(clearRedeemNotice, 15000);
  renderUsage();
  if (usageBusy) usageAgain = true; else pollUsage();
}
function renderUsage() {
  observeResets(serverNow()); worstRemaining = null;
  usageCard('claude', usageData && usageData.claude); usageCard('codex', usageData && usageData.codex);
  renderResetNotices(); applyUsageOpen(); syncStripHeight(); updateUsageTitle(); tickUsage(serverNow());
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
  finally { clearTimeout(timeout); usageBusy = false; renderUsage(); if (usageAgain) { usageAgain = false; setTimeout(pollUsage, 0); } }
}
function tickUsage(now) {
  // Expire observations between polls without inventing a confirmed reset.
  if (Array.from(document.querySelectorAll('[data-fresh-until]')).some(function (el) { return now >= Number(el.dataset.freshUntil); })) { renderUsage(); return; }
  if (observeResets(now)) { renderUsage(); return; }
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var hasAt = el.dataset.count !== '', at = Number(el.dataset.count), past = at <= now;
    textIfChanged(el, !hasAt ? 'Reset time unavailable' : past ? 'Reset time passed · ' + relativeTime(now - at) + ' ago' : 'Resets in ' + relativeTime(at - now));
  });
  document.querySelectorAll('[data-rs]').forEach(function (el) {
    var at = el.dataset.rs === '' ? null : Number(el.dataset.rs);
    textIfChanged(el, at === null ? 'no reset time' : at <= now ? 'reset due' : relativeTime(at - now));
  });
  document.querySelectorAll('[data-renew-chip]').forEach(function (el) {
    var at = Number(el.dataset.renewChip), remaining = at - now, days = Math.max(0, Math.ceil(remaining / 86400000));
    el.classList.toggle('warn', remaining > 0 && days <= 3);
    textIfChanged(el, remaining <= 0 ? 'ended ' + new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : days + 'd to renew');
    el.title = remaining <= 0 ? 'Renewal ended ' + shortDate(at) : 'Renews ' + shortDate(at);
  });
  document.querySelectorAll('[data-exp]').forEach(function (el) {
    var at = Number(el.dataset.exp); textIfChanged(el, at <= now ? 'expired' : 'expires in ' + relativeTime(at - now));
  });
  document.querySelectorAll('[data-asof]').forEach(function (el) {
    var hasAt = el.dataset.asof !== '', at = Number(el.dataset.asof), stale = hasAt && now - at > 1800000;
    var tooltip = 'Claude data refreshes only while a T3 Claude session runs. Codex data comes from the latest timestamped usage observation across recent Codex logs.';
    var text = hasAt ? 'Last usage reading ' + (now - at > 86400000 ? datedClock(at, now) : clock24(at)) + ' · ' + Math.floor(Math.max(0, now - at) / 3600000) + 'h ' + Math.floor(Math.max(0, now - at) / 60000) % 60 + 'm ago' : 'Last usage reading unavailable';
    setHtml(el, esc(text) + (stale ? ' <span class="reading-old" title="' + tooltip + '">old reading</span>' : '')); el.title = tooltip;
  });
  document.querySelectorAll('[data-renew]').forEach(function (el) {
    var at = Number(el.dataset.renew), remaining = at - now, days = Math.max(0, Math.ceil(remaining / 86400000));
    el.classList.toggle('warning', remaining > 0 && days <= 3);
    textIfChanged(el, remaining <= 0 ? 'Ended ' + shortDate(at) : 'Renews ' + shortDate(at) + ' · ' + days + (days === 1 ? ' day left' : ' days left'));
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
var LOGOS = {
  claude: '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></g></svg>',
  codex: '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.6 9.8l2.6 2.2-2.6 2.2M12.6 14.4h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
var UNIT_STATE = { running: 'ACTIVE', waiting: 'STANDBY', idle: 'IDLE', done: 'DONE', failed: 'FAULT' };
function unitHtml(a, st) {
  var kind = a.kind === 'codex' ? 'codex' : 'claude', label = UNIT_STATE[st] || 'IDLE';
  if (st === 'waiting' && a.phase === 'waiting-approval') label = 'APPROVAL';
  return '<span class="unit ' + kind + '" title="' + esc(kind === 'codex' ? 'Codex agent' : 'Claude agent') + '"><span class="avatar">' + LOGOS[kind] + '</span></span>' +
    '<span class="state-pill s-' + esc(st) + '">' + label + '</span>' + (st === 'running' ? '<span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' : '');
}
function rowHtml(r, best, now, ended) {
  var a = r.a, mc = modelClass(a, best), end = a.endedAt || now, over = a.status === 'done' || a.status === 'failed';
  var doing = a.tool ? a.tool + (a.detail ? ' · ' + a.detail : '') : a.t3 ? (over ? (a.t3.result || a.status) : 'working') : a.kind === 'codex' ? (a.detail || 'starting') : a.status;
  var phases = { 'thinking': 'Thinking', 'tool': 'Using a tool', 'waiting-user': 'Waiting for you', 'waiting-approval': 'Waiting for approval', 'waiting-children': 'Waiting for children', 'idle': 'Idle' }; if (!a.tool && !over && phases[a.phase]) doing = phases[a.phase]; var fl = flagged(a), st = a.status;
  var third = a.codex && over && a.codex.summary ? a.codex.summary : a.codex ? (Array.isArray(a.codex.files) ? a.codex.files.length : 0) + ' files' + (Array.isArray(a.codex.tasks) && a.codex.tasks.length ? ' · ' + a.codex.tasks.join(', ') : '') : '';
  var line = over ? [a.kind === 'codex' && !a.codex && !a.t3 ? a.detail : '', a.t3 ? '' : (a.tools || 0) + (a.kind === 'codex' ? ' cmds' : ' tools'), a.errors ? a.errors + ' err' : '', a.tokens ? tok(a.tokens) : '', dur(end - a.startedAt)].filter(Boolean).join(' · ') : doing;
  var pct = Math.max(2, Math.min(100, Math.round((a.tokens || 0) / (a.kind === 'codex' ? 1200000 : 300000) * 100)));
  return '<div role="listitem" class="row ' + mc.cls + ' ' + esc(st) + (over ? ' done-row' : '') + '" style="--d:' + r.d + '" data-id="' + esc(a.id) + '"' + (r.parent ? ' data-p="' + esc(r.parent) + '" data-edge="' + edgeState(a) + '"' : '') + ' title="' + esc((a.label || a.id) + '\\n' + (a.healthNote || '') + (a.codex && a.codex.summary ? '\\n' + a.codex.summary : '')) + '">' +
    '<i class="dot" aria-hidden="true"></i><span class="name">' + unitHtml(a, st) + '<b>' + esc(clip(a.label || a.id, 70)) + '</b>' + (mc.label ? '<span class="badge" title="' + esc('Reported model: ' + (a.model || 'unknown')) + '">' + esc(mc.label) + '</span>' : '') + '</span>' +
    '<span class="doing">' + esc(clip(line, 140)) + '</span>' +
    (fl ? '<span class="flag' + (a.health === 'approval' ? ' wait' : '') + '">' + esc(clip(a.healthNote || a.health, 120)) + '</span>' : third && !over ? '<span class="over">' + esc(clip(third, 120)) + '</span>' : over && third ? '<span class="over">' + esc(clip(third, 120)) + '</span>' : '') +
    '<span class="nums"><span class="t">' + clockHtml(a.startedAt, a.endedAt) + '</span>' + '<span>' + (a.tokens ? tok(a.tokens) : '0') + '</span><span class="bar-tok"><i style="width:' + (a.tokens ? pct : 0) + '%"></i></span>' + '</span></div>';
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
  var main = agents.find(function (a) { return a.kind === 'main' || a.id === 'main'; });
  function newest(a, b) { return (b.startedAt || 0) - (a.startedAt || 0); }
  agents.forEach(function (a) {
    if (a === main) return;
    var parent = a.parentId && a.parentId !== a.id && byId.has(a.parentId) ? a.parentId : main && main.id;
    if (parent) kids.set(parent, (kids.get(parent) || []).concat(a));
  });
  kids.forEach(function (siblings) { siblings.sort(newest); });
  function walk(a, d, parent) { if (visited.has(a.id)) return; visited.add(a.id); out.push({ a: a, d: Math.min(d, 8), parent: parent }); (kids.get(a.id) || []).forEach(function (k) { walk(k, d + 1, a.id); }); }
  if (main) walk(main, 0, null);
  agents.filter(function (a) { return !a.parentId || a.parentId === a.id || !byId.has(a.parentId); }).sort(newest).forEach(function (a) { walk(a, 0, null); });
  agents.slice().sort(newest).forEach(function (a) { walk(a, 0, null); });
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
  var KC = { delegate: '#2de2ff', result: '#ff5fd2', quiet: '#7686a3' }, particles = 0;
  defs.innerHTML = Object.keys(KC).map(function (k) { return '<marker id="' + mid + k + '" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse" overflow="visible"><path d="M0 .5L8.5 4.5L0 8.5L2 4.5z" fill="' + KC[k] + '"/></marker>'; }).join(''); svg.appendChild(defs);
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
    var a = point(from), b = point(to), dy = kind === 'result' ? -3.5 : 3.5, bend = Math.max(6, Math.min(a.x, b.x) - (kind === 'result' ? 8 : 20));
    a.y += dy; b.y += dy;
    var x1 = a.x - 7, x2 = b.x - 8, dirY = b.y > a.y ? 1 : -1, r = Math.min(5, Math.abs(b.y - a.y) / 2), p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + x1 + ' ' + a.y + 'H' + (bend + r) + 'Q' + bend + ' ' + a.y + ' ' + bend + ' ' + (a.y + dirY * r) + 'V' + (b.y - dirY * r) + 'Q' + bend + ' ' + b.y + ' ' + (bend + r) + ' ' + b.y + 'H' + x2);
    var age = serverNow() - at, bright = !fallback && (age < 10000 || kind === 'result' && age < 60000);
    p.setAttribute('class', 'e flow-' + kind + (bright ? ' fresh' : ' quiet') + (!fallback && age >= 0 && age < 10000 ? ' traffic-live' : '') + (fallback ? ' fallback' : ''));
    p.setAttribute('marker-end', 'url(#' + mid + (fallback ? 'quiet' : kind) + ')'); var t = document.createElementNS(NS, 'title'); t.textContent = title; p.appendChild(t); svg.appendChild(p);
    if (bright && !fallback && particles < 3 && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      particles++; var pid = mid + 'p' + particles; p.setAttribute('id', pid);
      [0, 0.5].forEach(function (o) {
        var c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '2.6'); c.setAttribute('class', 'particle'); c.setAttribute('fill', KC[kind]); c.style.color = KC[kind];
        var m = document.createElementNS(NS, 'animateMotion'); m.setAttribute('dur', '1.6s'); m.setAttribute('repeatCount', 'indefinite'); m.setAttribute('begin', (-o * 1.6) + 's');
        var mp = document.createElementNS(NS, 'mpath'); mp.setAttribute('href', '#' + pid); m.appendChild(mp); c.appendChild(m); svg.appendChild(c);
      });
    }
  }
  var links = linksFor(s), hasLinks = Array.isArray(s.links) && s.links.length || links.length;
  var linked = new Set();
  if (hasLinks) links.filter(function (l) { return l.kind === 'delegate' || l.kind === 'result'; }).forEach(function (l) { var f = resolve(l.from), t = resolve(l.to); if (f && t) { linked.add(f.dataset.id); linked.add(t.dataset.id); } path(f, t, l.kind, l.at, linkTitle(l, serverNow()), false); });
  rows.forEach(function (r) {
    var parent = rows.get(r.dataset.p); if (!parent || linked.has(r.dataset.id)) return;
    var live = r.classList.contains('running') || r.classList.contains('waiting');
    path(parent, r, 'delegate', live ? serverNow() : 0, live ? 'Working: parent delegated this task and is waiting for the result' : 'Inferred relationship; no exchange data reported', !live);
  });
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
  live.forEach(function (s) { if (isDismissed(s)) return; var i = infos.get(s.sessionId); Object.keys(c).forEach(function (key) { if (filterMatch(s, i, key)) c[key]++; }); });
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
  setHtml(document.getElementById('legend'), '<span title="Recent activity or running child/tool">● Working: active work</span><span title="A person must approve the pending action">● Approval: review needed</span><span title="The agent is waiting for a reply">● Waiting for you: reply needed</span><span title="Child agents are still running">● Background: waiting for children</span><span title="Heartbeat missing while work remains running">● No heartbeat: connection uncertain</span><span title="Actual recorded exchanges; faint lines are old or inferred"><b style="color:var(--sonnet)">teal ↓ task sent</b> · <b style="color:var(--cx)">pink ↑ result returned</b> · grey = inferred</span>');
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
  if (usageOpen && e.target.isConnected && !e.target.closest('.ug')) setUsageOpen(null);
  var t = e.target.closest('button'); if (!t) return;
  if (t.dataset.usageToggle) { setUsageOpen(usageOpen === t.dataset.usageToggle ? null : t.dataset.usageToggle); return; }
  if (t.dataset.usageClose) { setUsageOpen(null, t.closest('.ug').id.replace('usage-', '')); return; }
  if (t.dataset.dismissReset) { resetDismissed[t.dataset.dismissReset] = serverNow(); resetDismissed = Object.fromEntries(Object.entries(resetDismissed).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 200)); store.set('usageResetDismissed', resetDismissed); resetNotices.delete(t.dataset.dismissReset); resetTitlePending = resetNotices.size > 0 && resetTitlePending; renderUsage(); return; }
  if (t.dataset.redeemAsk) { if (!redeemState.busy) { redeemState.pending = { provider: t.dataset.provider, id: t.dataset.redeemAsk, step: 'confirm' }; redeemState.notice = null; renderUsage(); var cancel = document.querySelector('[data-redeem-cancel]'); if (cancel) cancel.focus({ preventScroll: true }); } return; }
  if (t.dataset.redeemCancel) { if (!redeemState.busy) { var asked = redeemState.pending; redeemState.pending = null; renderUsage(); var back = asked && Array.from(document.querySelectorAll('[data-redeem-ask]')).find(function (b) { return b.dataset.redeemAsk === asked.id; }); if (back) back.focus({ preventScroll: true }); } return; }
  if (t.dataset.redeemGo) { redeemCredit(t.dataset.provider, t.dataset.redeemGo); return; }
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
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (redeemState.pending && !redeemState.busy) { redeemState.pending = null; renderUsage(); return; }
  if (usageOpen) { var group = document.getElementById('usage-' + usageOpen), inside = group.contains(document.activeElement); setUsageOpen(null, inside ? group.id.replace('usage-', '') : null); }
});
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
