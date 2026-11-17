import { expect, test } from 'bun:test'
import { WEB_PAGE } from './web'

function source(name: string) {
  const start = WEB_PAGE.indexOf(`function ${name}(`)
  const end = WEB_PAGE.indexOf('\nfunction ', start + 1)
  return WEB_PAGE.slice(start, end < 0 ? undefined : end)
}
const helpers = ['finiteNumber', 'validDate', 'windowReset', 'windowStale', 'windowLabel', 'clock24', 'absStamp', 'evenPace', 'stripColor', 'stripSeg'].map(source).join('\n')
const render = new Function('data', 'w', 'now', 'function esc(s) { return String(s); }\n' + helpers + '\nreturn stripSeg(data,w,now);')

test('expired and old quota readings never show current remaining percentages', () => {
  const now = 1794787200000
  for (const w of [
    { usedPct: 99, resetsAt: now / 1000 - 1, asOf: now - 1000 },
    { usedPct: 16, resetsAt: now / 1000 + 3600, asOf: now - 7 * 3600000 },
    { usedPct: 16, resetsAt: now / 1000 + 3600 },
  ]) {
    const html = render({}, { id: 'five_hour', ...w }, now)
    expect(html).toContain('class="us-pct">—')
    expect(html).toContain('>stale</span>')
    expect(html).toContain('last observed')
    expect(html).not.toContain('class="pace"')
  }
  expect(render({}, { usedPct: 16, asOf: now, resetsAt: now / 1000 + 300, windowMinutes: 300 }, now)).toContain('class="us-pct">84%')
})

test('agent usage distinguishes an observed zero from unavailable', () => {
  const row = new Function('r', `var LOGOS={claude:'',codex:''};
    function modelClass(){return {}}; function flagged(){return false}; function clockHtml(){return ''};
    function esc(s){return String(s)}; function clip(s){return s}; function dur(){return ''};
    function tok(n){return String(n)}; function unitHtml(){return ''};
    ${source('finiteNumber')}\n${source('rowHtml')}\nreturn rowHtml(r,{},100,false);`)
  const a = { id: 'child', kind: 'codex', t3: {}, status: 'running', startedAt: 1 }
  expect(row({ a: { ...a, tokens: null }, d: 0 })).toContain('—')
  expect(row({ a: { ...a, tokens: 0 }, d: 0 })).toContain('<span>0</span>')
  expect(row({ a: { ...a, tokens: 123 }, d: 0 })).toContain('<span>123</span>')
})
