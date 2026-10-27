import { expect, test } from 'bun:test'
import { WEB_PAGE } from './web'

function helpers(names: string[]) {
  return names.map(name => {
    const start = WEB_PAGE.indexOf(`function ${name}(`)
    if (start < 0) throw new Error(`Missing helper: ${name}`)
    const next = WEB_PAGE.slice(start + 1).search(/\n(?:async )?function /)
    return WEB_PAGE.slice(start, next < 0 ? WEB_PAGE.indexOf('</script>', start) : start + 1 + next)
  }).join('\n')
}

test('the entire generated browser script compiles', () => {
  const script = WEB_PAGE.split('<script>')[1].split('</script>')[0]
  expect(() => new Function(script)).not.toThrow()
})

const card = new Function('provider', 'data', 'now', helpers([
  'finiteNumber', 'validDate', 'windowReset', 'windowStale', 'windowLabel', 'clock24',
  'resetEvents', 'resetUsed', 'resetDescription', 'resetWindowLabel', 'usageCard',
]) + `
  var html='', worstRemaining=null, resetNotices=new Map();
  function serverNow(){return now}
  function esc(s){return String(s)}
  function projection(){return ''}
  function setHtml(el,s){html=s}
  var document={getElementById:()=>({querySelector:()=>null,classList:{toggle:()=>{}}})};
  usageCard(provider,data);return {html,worstRemaining};
`)

test('expired and three-hour-old usage stays unknown for both providers and windows', () => {
  const now = Date.UTC(2026, 9, 27, 10)
  for (const provider of ['claude', 'codex']) {
    for (const resetsAt of [(now - 1000) / 1000, (now + 86400000) / 1000]) {
      const { html, worstRemaining } = card(provider, { asOf: now - 3 * 3600000, windows: [
        { id: 'five_hour', usedPct: 87, resetsAt, asOf: now - 3 * 3600000 },
        { id: 'weekly', usedPct: 42, resetsAt, asOf: now - 3 * 3600000 },
      ] }, now)
      expect(html).toContain('Old reading')
      expect(html.match(/Current usage unknown/g)?.length).toBe(2)
      expect(html).toContain('Last observed 87% used')
      expect(html).not.toContain('100% remaining')
      expect(html).not.toContain('Reset ✓')
      expect(html).not.toContain('data-fresh-until')
      expect(worstRemaining).toBeNull()
    }
  }
})

test('a passed deadline expires even a recent observation and missing usage never becomes zero used', () => {
  const now = Date.UTC(2026, 9, 27, 10)
  const expired = card('codex', { asOf: now - 1000, windows: [
    { id: 'five_hour', usedPct: 50, resetsAt: now / 1000 },
  ] }, now)
  expect(expired.html).toContain('Scheduled reset passed · awaiting a new usage reading')
  expect(expired.worstRemaining).toBeNull()
  const missing = card('codex', { asOf: now, windows: [{ id: 'five_hour' }] }, now)
  expect(missing.html).toContain('Current usage unknown')
  expect(missing.html).not.toContain('100% remaining')
})

test('mixed-age windows show their own freshness and fresh observed usage remains available', () => {
  const now = Date.UTC(2026, 9, 27, 10)
  const data = { asOf: now, windows: [
    { id: 'five_hour', usedPct: 80, asOf: now - 3 * 3600000 },
    { id: 'weekly', usedPct: 25, asOf: now, resetsAt: (now + 60000) / 1000 },
  ] }
  const mixed = card('claude', data, now)
  expect(mixed.html).toContain('Old reading')
  expect(mixed.html).toContain('75%<small>remaining')
  expect(mixed.html).toContain(`data-asof="${data.windows[0].asOf}"`)
  expect(mixed.worstRemaining).toBe(75)
  const fresh = card('claude', { ...data, windows: [data.windows[1]] }, now)
  expect(fresh.html).toContain('Available')
  expect(fresh.html).toContain(`data-fresh-until="${now + 60000}"`)
})

test('clock ticks expire an observation at its deadline without waiting for another poll', () => {
  const run = new Function('now', helpers(['tickUsage']) + `
    var rendered=0;
    function observeResets(){return false}
    function renderUsage(){rendered++}
    var document={querySelectorAll:selector=>selector==='[data-fresh-until]'?[{dataset:{freshUntil:'10000'}}]:[]};
    tickUsage(now);return rendered;
  `)
  expect(run(9999)).toBe(0)
  expect(run(10000)).toBe(1)
})

test('browser children sort newest first within each parent, independent of activity and status', () => {
  const order = new Function('agents', helpers(['order']) + ';return order(agents)')
  const agents = [
    { id: 'old', parentId: 'main', startedAt: 10, activityAt: 999 },
    { id: 'main', kind: 'codex', startedAt: 0 },
    { id: 'nested-old', parentId: 'new', startedAt: 30 },
    { id: 'new', parentId: 'main', startedAt: 20, status: 'done' },
    { id: 'nested-new', parentId: 'new', startedAt: 40 },
    { id: 'tie', parentId: 'main', startedAt: 20 },
    { id: 'orphan', parentId: 'missing', startedAt: 5 },
  ]
  const before = agents.map(a => a.id)
  expect(order(agents).map(r => [r.a.id, r.d, r.parent])).toEqual([
    ['main', 0, null], ['new', 1, 'main'], ['nested-new', 2, 'new'],
    ['nested-old', 2, 'new'], ['tie', 1, 'main'], ['old', 1, 'main'], ['orphan', 1, 'main'],
  ])
  expect(agents.map(a => a.id)).toEqual(before)
  expect(order([{ id: 'root', startedAt: 10 }, { id: 'child', parentId: 'root', startedAt: 20 }])
    .map(r => [r.a.id, r.d])).toEqual([['root', 0], ['child', 1]])
})
