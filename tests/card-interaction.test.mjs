import assert from 'node:assert/strict'
import test from 'node:test'
import { Window } from 'happy-dom'
import { createElement, act } from 'react'
import { ReportCard, NoemaCard } from '../lib/client/Card.js'
import { ReportSubscriptions } from '../lib/client/reports.js'
import { compareSnapshots } from '../lib/compare.js'
import { request } from './helpers.mjs'
import { en, zh } from '../lib/client/locales.js'

const window = new Window()
globalThis.window = window
globalThis.document = window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')

async function mount(t, component) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  t.after(async () => { await act(() => root.unmount()); container.remove() })
  await act(() => root.render(component))
  return container
}

for (const locale of [en, zh]) test(`files share metric headings and start collapsed: ${locale.cognitive}`, async t => {
  const report = await compareSnapshots(request(
    { 'a.ts': 'function outer(x) { if (x) { if (y) return 1 }; return 0 }' },
    {
      'a.ts': 'function outer(x) { function inner() { return 1 }; if (x) return inner(); return 0 }',
      'b.ts': 'function b() { return 0 }',
    },
  ))
  const container = await mount(t, createElement(ReportCard, { report, t: key => locale[key] }))
  assert.deepEqual([...container.querySelectorAll('thead th')].map(cell => cell.textContent),
    [locale.title, locale.cyclomatic, locale.cognitive, locale.nesting])
  const rows = [...container.querySelectorAll('tbody tr')]
  assert.deepEqual(rows.map(row => row.querySelector('button').textContent), ['a.ts', 'b.ts'])
  for (const row of rows) {
    assert.equal(row.querySelector('button').getAttribute('aria-expanded'), 'false')
    assert.equal(row.cells.length, 4)
  }
  assert.ok(rows[0].querySelector('[aria-label="3 → 1 (-2)"]'))
  assert.doesNotMatch(container.textContent, /outer|inner/)
})

for (const locale of [en, zh]) test(`reveals unchanged code once per level and keeps nested functions collapsed: ${locale.cognitive}`, async t => {
  const source = value => `function outer() {
    function changed() { return ${value} }
    function stable() { return 0 }
    return changed()
  }
  function untouched() { return 0 }`
  const report = await compareSnapshots(request({ 'a.ts': source(1) }, { 'a.ts': source(2) }))
  const container = await mount(t, createElement(ReportCard, { report, t: key => locale[key] }))
  const click = async button => { assert.ok(button); await act(() => button.click()) }
  assert.equal(container.querySelectorAll('tbody tr').length, 1)
  await click(container.querySelector('.noema-file-title'))
  assert.equal(container.querySelector('[aria-label="outer"]').getAttribute('aria-expanded'), 'false')
  assert.doesNotMatch(container.textContent, /Top Level|untouched|stable/)
  const fileReveal = [...container.querySelectorAll('button')].find(button => button.textContent === locale.show_unchanged)
  await click(fileReveal)
  assert.match(container.textContent, /\[Top Level\]/)
  assert.match(container.textContent, /untouched/)
  assert.equal(container.querySelectorAll('.noema-reveal').length, 0)
  await click(container.querySelector('[aria-label="outer"]').closest('tr').querySelector('td'))
  assert.equal(container.querySelector('[aria-label="outer"]').getAttribute('aria-expanded'), 'true')
  assert.match(container.textContent, /changed/)
  assert.doesNotMatch(container.textContent, /stable/)
  assert.equal(container.querySelectorAll('.noema-reveal').length, 1)
  await click(container.querySelector('.noema-reveal'))
  assert.match(container.textContent, /stable/)
  assert.equal(container.querySelectorAll('.noema-reveal').length, 0)
  assert.equal(container.querySelectorAll('button[aria-label="changed"][aria-expanded]').length, 0)
  const leaf = [...container.querySelectorAll('.noema-function-name')].find(name => name.textContent === 'changed').closest('tr')
  assert.equal(leaf.querySelector('button'), null)
  const rowCount = container.querySelectorAll('tbody tr').length
  await click(leaf)
  assert.equal(container.querySelectorAll('tbody tr').length, rowCount)
  await click(container.querySelector('[aria-label="outer"]').closest('tr'))
  assert.doesNotMatch(container.textContent, /changed|stable/)
  await click(container.querySelector('[aria-label="outer"]'))
  assert.match(container.textContent, /stable/)
  assert.equal(container.querySelectorAll('.noema-reveal').length, 0)
})

test('a file with only top-level code has no disclosure and displays its metrics', async t => {
  const report = await compareSnapshots(request({}, { 'a.ts': 'if (ready) run()' }))
  const container = await mount(t, createElement(ReportCard, { report, t: key => en[key] }))
  assert.equal(container.querySelectorAll('[aria-expanded]').length, 0)
  assert.equal(container.querySelector('tbody button'), null)
  assert.equal(container.querySelector('.noema-issue'), null)
  assert.deepEqual([...container.querySelectorAll('tbody strong')].map(value => value.textContent), ['1', '1', '1'])
})

test('remote read errors propagate while a missing result remains undefined', async () => {
  const error = { code: 'INTERNAL', message: 'read failed' }
  let result = { ok: false, error }
  const subscription = new ReportSubscriptions({ get: async () => result }, () => {})
  const signal = new AbortController().signal
  await assert.rejects(subscription.load('s', 'r', signal), value => value === error)
  result = { ok: true, value: undefined }
  assert.equal(await subscription.load('s', 'r', signal), undefined)
})

test('a failed card read stays silent and retries the same report after reconnect', async t => {
  const report = await compareSnapshots(request({}, { 'a.ts': 'function f() {}' }))
  let attempts = 0
  let fail = true
  const warnings = []
  const subscription = new ReportSubscriptions({
    async *watch(id, signal) {
      yield [{ report_id: report.report_id, turn: 0, start_seq: 1 }]
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
    },
    async get() { attempts++; return fail ? { ok: false, error: new Error('disconnected') } : { ok: true, value: report } },
  }, error => warnings.push(error))
  t.after(() => subscription.close())
  const container = await mount(t, createElement(NoemaCard, {
    turn: { turn: 0, start: { seq: 1 } },
    source: subscription.source('s'),
    load: (id, signal) => subscription.load('s', id, signal),
    onError: error => warnings.push(error),
    t: key => en[key],
  }))
  assert.equal(attempts, 1)
  assert.equal(warnings.length, 1)
  assert.equal(container.textContent, '')
  fail = false
  await act(async () => { subscription.reset() })
  assert.equal(attempts, 2)
  assert.match(container.textContent, /a.ts/)
  await act(async () => { subscription.reset() })
  assert.equal(attempts, 2, 'successfully loaded immutable results are retained')
})

for (const [failure, phase, locale, reason] of [
  ['function f( {', 'before', zh, '原代码无法解析，显示当前分数，无法对比'],
  [{ status: 'skipped', reason: 'read_error' }, 'before', en, 'Original file could not be read. Showing current scores without a comparison'],
  ['function f( {', 'after', en, 'Updated code could not be parsed'],
  [{ status: 'skipped', reason: 'changed_during_read' }, 'after', zh, '修改后的文件在读取时发生变化'],
]) test(`file measurement failure: ${phase}, ${reason}`, async t => {
  const source = 'function outer() { function inner(x) { if (x) return 1; return 0 } return inner(1) }'
  const report = await compareSnapshots(request(
    { 'a.ts': phase === 'before' ? failure : source },
    { 'a.ts': phase === 'after' ? failure : source },
  ))
  const container = await mount(t, createElement(ReportCard, { report, t: key => locale[key] }))
  const row = container.querySelector('.noema-file-row')
  const issue = row.querySelector('[role="img"]')
  assert.ok(issue.classList.contains(phase === 'before' ? 'noema-warning' : 'noema-danger'))
  assert.equal(issue.getAttribute('aria-label'), reason)
  assert.equal(issue.hasAttribute('title'), false)
  assert.equal(container.querySelectorAll('.noema-delta, .noema-before, .noema-arrow').length, 0)
  if (phase === 'before') {
    assert.deepEqual([...row.querySelectorAll('strong')].map(value => value.textContent), ['3', '2', '1'])
    await act(() => row.click())
    const outer = container.querySelector('[aria-label="outer"]')
    assert.ok(outer)
    await act(() => outer.click())
    assert.match(container.textContent, /inner/)
    assert.equal(container.querySelectorAll('.noema-status-unavailable, .noema-status-added, .noema-delta').length, 0)
    const inner = [...container.querySelectorAll('.noema-function-name')].find(name => name.textContent === 'inner').closest('tr')
    assert.deepEqual([...inner.querySelectorAll('strong')].map(value => value.textContent), ['2', '2', '1'])
  } else {
    assert.deepEqual([...row.querySelectorAll('strong')].map(value => value.textContent), ['-', '-', '-'])
    assert.equal(row.querySelector('[aria-expanded]'), null)
    assert.equal(row.classList.contains('noema-expandable-row'), false)
    await act(() => row.click())
    assert.equal(container.querySelectorAll('tbody tr').length, 1)
    assert.doesNotMatch(container.textContent, /outer|inner/)
  }
})

for (const before of [{}, { 'a.ts': 'function (' }]) {
  test(`renders failed updated code with ${Object.keys(before).length ? 'a failed baseline' : 'no baseline'}`, async t => {
    const report = await compareSnapshots(request(before, { 'a.ts': 'function broken(' }))
    const container = await mount(t, createElement(ReportCard, { report, t: key => en[key] }))
    const row = container.querySelector('.noema-file-row')
    assert.equal(row.querySelector('.noema-danger').getAttribute('aria-label'), en.failure_after_parse)
    assert.deepEqual([...row.querySelectorAll('strong')].map(value => value.textContent), ['-', '-', '-'])
    assert.equal(row.querySelector('[aria-expanded]'), null)
    await act(() => row.click())
    assert.equal(container.querySelectorAll('tbody tr').length, 1)
  })
}

for (const staleResult of ['success', 'failure']) {
  test(`ignores a previous session's late ${staleResult} after switching sessions`, async t => {
    const old = await compareSnapshots(request({}, { 'old.ts': 'function old() {}' }, { session_id: 'old', report_id: 'old_1' }))
    const current = await compareSnapshots(request({}, { 'current.ts': 'function current() {}' }, { session_id: 'current', report_id: 'current_1' }))
    const pending = Promise.withResolvers()
    const warnings = []
    const signals = []
    const subscriptions = new ReportSubscriptions({
      async *watch(id, signal) {
        const report = id === 'old' ? old : current
        yield [{ report_id: report.report_id, turn: report.turn, start_seq: report.start_seq }]
        await new Promise(resolve => {
          if (signal.aborted) resolve()
          else signal.addEventListener('abort', resolve, { once: true })
        })
      },
      get(id, reportId, signal) {
        signals.push(signal)
        return id === 'old' ? pending.promise : Promise.resolve({ ok: true, value: current })
      },
    }, error => warnings.push(error))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    t.after(async () => {
      await act(() => root.unmount())
      subscriptions.close()
      container.remove()
    })
    const render = id => root.render(createElement(NoemaCard, {
      turn: { turn: 0, start: { seq: 1 } },
      source: subscriptions.source(id),
      load: (reportId, signal) => subscriptions.load(id, reportId, signal),
      onError: error => warnings.push(error),
      t: key => en[key],
    }))
    await act(() => render('old'))
    await act(() => render('current'))
    assert.equal(signals[0].aborted, true)
    assert.match(container.textContent, /current.ts/)
    await act(async () => pending.resolve(staleResult === 'success'
      ? { ok: true, value: old }
      : { ok: false, error: new Error('old request failed') }))
    assert.match(container.textContent, /current.ts/)
    assert.doesNotMatch(container.textContent, /old.ts/)
    assert.deepEqual(warnings, [])
  })
}
