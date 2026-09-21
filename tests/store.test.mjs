import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as plugin from 'dsh-plugin-noema'
import { NoemaReports } from '../lib/store.js'
import { compareSnapshots } from '../lib/compare.js'
import { workspace, request } from './helpers.mjs'

test('loads only the requested session and releases its data after each operation', { timeout: 15000 }, async t => {
  const { ctx, directory } = await workspace(t)
  const opened = []
  const open = ctx.storageDomain.open.bind(ctx.storageDomain)
  t.mock.method(ctx.storageDomain, 'open', spec => {
    opened.push(spec.name)
    return open(spec)
  })
  await ctx.plugin(plugin, {})
  assert.deepEqual(opened, [])
  const first = await compareSnapshots(request({}, { 'a.ts': 'function f() {}' }, { session_id: 'first', report_id: 'shared' }))
  const second = { ...first, session_id: 'second', turn: 5 }
  await ctx.noema.save(first)
  const firstDomain = opened.at(-1)
  await ctx.noema.save(second)
  const secondDomain = opened.at(-1)
  assert.notEqual(firstDomain, secondDomain)
  assert.equal(ctx.storageDomain.get(firstDomain), undefined)
  assert.equal(ctx.storageDomain.get(secondDomain), undefined)
  assert.deepEqual(await ctx.noema.get('first', 'shared'), first)
  assert.deepEqual(await ctx.noema.get('second', 'shared'), second)

  const path = join(directory, 'storage', secondDomain, 'reports', 'shared.json')
  const original = await readFile(path, 'utf8')
  const invalid = JSON.parse(original)
  invalid.record.files[0].after.analysis.scopes = []
  await writeFile(path, JSON.stringify(invalid))
  opened.length = 0
  assert.equal((await ctx.noema.list('first')).length, 1)
  assert.deepEqual(await ctx.noema.get('first', 'shared'), first)
  assert.deepEqual(new Set(opened), new Set([firstDomain]))
  await assert.rejects(ctx.noema.list('second'), { code: 'invalid-record' })
  await writeFile(path, original)
  assert.deepEqual(await ctx.noema.get('second', 'shared'), second)
  assert.equal(ctx.storageDomain.get(firstDomain), undefined)
  assert.equal(ctx.storageDomain.get(secondDomain), undefined)
})

test('serializes same-session writes and only notifies that session', { timeout: 15000 }, async t => {
  const { ctx } = await workspace(t)
  await ctx.plugin(plugin, {})
  const abort = new AbortController()
  t.after(() => abort.abort())
  const stream = ctx.noema.watch('first', abort.signal)
  assert.deepEqual((await stream.next()).value, [])
  const report = await compareSnapshots(request({}, { 'a.ts': 'function f() {}' }, { session_id: 'first' }))
  const pending = stream.next()
  await ctx.noema.save({ ...report, session_id: 'second' })
  const writes = [
    ctx.noema.save({ ...report, report_id: 'late', start_seq: 10 }),
    ctx.noema.save({ ...report, report_id: 'early', start_seq: 1 }),
  ]
  const update = (await pending).value
  assert.ok(update.length > 0)
  assert.ok(update.every(index => ['early', 'late'].includes(index.report_id)))
  await Promise.all(writes)
  assert.deepEqual((await ctx.noema.list('first')).map(index => index.report_id), ['early', 'late'])
  assert.deepEqual((await ctx.noema.list('second')).map(index => index.report_id), [report.report_id])
  abort.abort()
  await stream.return()
})

for (const interruption of ['request', 'shutdown']) {
  test(`${interruption} during session loading releases storage and does not block another session`, { timeout: 15000 }, async t => {
    const { ctx } = await workspace(t)
    const lifetime = new AbortController()
    const requestAbort = new AbortController()
    const reports = new NoemaReports(ctx.storageDomain, lifetime.signal)
    const loading = Promise.withResolvers()
    const release = Promise.withResolvers()
    const open = ctx.storageDomain.open.bind(ctx.storageDomain)
    let blockedName
    t.mock.method(ctx.storageDomain, 'open', async spec => {
      if (!blockedName) {
        blockedName = spec.name
        loading.resolve()
        await release.promise
      }
      return open(spec)
    })
    t.after(async () => {
      lifetime.abort()
      release.resolve()
      await reports.close()
    })
    const reason = new Error('cancelled')
    const blocked = reports.list('blocked', requestAbort.signal)
    const rejected = assert.rejects(blocked, error => error === reason)
    await loading.promise
    assert.deepEqual(await reports.list('other'), [])
    const controller = interruption === 'request' ? requestAbort : lifetime
    controller.abort(reason)
    let closed = false
    const closing = reports.close().then(() => { closed = true })
    await Promise.resolve()
    assert.equal(closed, false)
    release.resolve()
    await rejected
    await closing
    assert.equal(ctx.storageDomain.get(blockedName), undefined)
    if (interruption === 'request') assert.deepEqual(await reports.list('blocked'), [])
    else await assert.rejects(reports.list('other'), error => error === reason)
  })
}
