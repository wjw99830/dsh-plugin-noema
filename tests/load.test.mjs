import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile } from 'node:fs/promises'
import SessionStore from '@deepseek-ai/dsh-session'
import * as plugin from 'dsh-plugin-noema'
import { compareSnapshots } from '../lib/compare.js'
import { ReportSubscriptions } from '../lib/client/reports.js'
import { request, workspace } from './helpers.mjs'

const barrier = (ctx, session) =>
  ctx.waterfall('agent/pre-step', { agent: { session } }, () => Promise.resolve('continued'))

test(
  'official Host services capture consecutive turns, persist and restore reports',
  { timeout: 15_000 },
  async (t) => {
    const { ctx, cwd, directory } = await workspace(t)
    await ctx.plugin(SessionStore)
    const fiber = await ctx.plugin(plugin, {})
    assert.ok(ctx.noema)
    assert.ok(ctx.typert.getPackage('dsh-plugin-noema', 'host'))
    const session = ctx.sessions.create(undefined, { meta: { cwd } })
    const controller = new AbortController()
    t.after(() => controller.abort())
    const watch = ctx.noema.watch(session.id, controller.signal)
    assert.deepEqual((await watch.next()).value, [])
    const original = 'function f(x:boolean){if(x)return 1;return 0}'
    const second = 'function f(x:boolean){if(x){if(y)return 2};return 0}'
    await writeFile(`${cwd}/a.ts`, original)
    const start = session.append('turn/start', { turn: 1 })
    assert.equal(await barrier(ctx, session), 'continued')
    await writeFile(`${cwd}/a.ts`, second)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('turn/start', { turn: 2 })
    await barrier(ctx, session)
    await writeFile(`${cwd}/a.ts`, 'function f(){return 0}')
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    let indexes = []
    while (indexes.length < 2) indexes = (await watch.next()).value
    const first = await ctx.noema.get(session.id, indexes[0].report_id)
    const last = await ctx.noema.get(session.id, indexes[1].report_id)
    assert.equal(first.start_seq, start.seq)
    assert.equal(first.files[0].before.analysis.scopes[0].metrics.cyclomatic, 2)
    assert.equal(first.files[0].after.analysis.scopes[0].metrics.cyclomatic, 3)
    assert.equal(last.files[0].before.analysis.scopes[0].metrics.cyclomatic, 3)
    assert.equal(last.files[0].after.analysis.scopes[0].metrics.cyclomatic, 1)
    assert.equal(await ctx.noema.get('other-session', first.report_id), undefined)
    assert.equal(
      session.snapshotEvents().some((e) => e.type.startsWith('noema')),
      false,
    )
    controller.abort()
    await watch.return()
    await fiber.dispose()
    assert.equal(ctx.typert.getPackage('dsh-plugin-noema', 'host'), undefined)
    const again = await workspace(t, directory)
    await again.ctx.plugin(plugin, {})
    assert.deepEqual(await again.ctx.noema.get(session.id, first.report_id), first)
  },
)

test('Noema methods use the real Typert Gateway for validation, reads and streams', async (t) => {
  const { ctx } = await workspace(t)
  const { default: Gateway } = await import('@deepseek-ai/dsh-api-gateway')
  await ctx.plugin(Gateway)
  await ctx.plugin(plugin, {})
  assert.deepEqual(
    await ctx.typertGateway.invoke({ namespace: 'noema', method: 'list', args: { session_id: 'empty' } }),
    [],
  )
  const subscriptions = new ReportSubscriptions({
    async get(session_id, report_id) {
      const response = await ctx.typertGateway.dispatchRpc('noema/get', { args: { session_id, report_id } })
      return JSON.parse(JSON.stringify(response))
    },
  }, () => {})
  assert.equal(await subscriptions.load('empty', 'missing', new AbortController().signal), undefined)
  await assert.rejects(
    ctx.typertGateway.invoke({ namespace: 'noema', method: 'list', args: { session_id: 4 } }),
  )
  const report = await compareSnapshots(request(
    { 'a.ts': 'function f() {}' },
    { 'a.ts': 'function f(x) { if (x) return 1 }' },
  ))
  await ctx.noema.save(report)
  const indexes = [{ report_id: report.report_id, turn: report.turn, start_seq: report.start_seq }]
  assert.deepEqual(
    await ctx.typertGateway.invoke({ namespace: 'noema', method: 'list', args: { session_id: report.session_id } }),
    indexes,
  )
  assert.deepEqual(
    await ctx.typertGateway.invoke({
      namespace: 'noema', method: 'get', args: { session_id: report.session_id, report_id: report.report_id },
    }),
    report,
  )
  const abort = new AbortController()
  const stream = await ctx.typertGateway.stream({
    namespace: 'noema',
    method: 'watch',
    args: { session_id: report.session_id },
    signal: abort.signal,
  })
  const iterator = stream[Symbol.asyncIterator]()
  assert.deepEqual((await iterator.next()).value, indexes)
  abort.abort()
  await iterator.return()
})

test('preserves code changes from a failed turn when its continuation only presents the file', { timeout: 15_000 }, async (t) => {
  const { ctx, cwd, directory } = await workspace(t)
  await ctx.plugin(SessionStore)
  const fiber = await ctx.plugin(plugin, {})
  const session = ctx.sessions.create(undefined, { meta: { cwd } })
  await writeFile(`${cwd}/a.ts`, 'function f(x){if(x){if(y)return 1};return 0}')
  const start = session.append('turn/start', { turn: 9 })
  await barrier(ctx, session)
  await writeFile(`${cwd}/a.ts`, 'function f(x){if(x)return 1;return 0}')
  const end = session.append('turn/end', {
    turn: 9,
    reason: { kind: 'error', error: { message: 'Service is too busy', code: 'SERVER', status: 503 } },
  })
  session.append('turn/start', { turn: 10 })
  await barrier(ctx, session)
  session.append('turn/end', { turn: 10, reason: { kind: 'completed' } })
  const controller = new AbortController()
  t.after(() => controller.abort())
  const watch = ctx.noema.watch(session.id, controller.signal)
  while ((await watch.next()).value.length === 0) {}
  controller.abort()
  await watch.return()
  await barrier(ctx, session)
  await fiber.dispose()

  const restored = await workspace(t, directory)
  await restored.ctx.plugin(plugin, {})
  const indexes = await restored.ctx.noema.list(session.id)
  assert.equal(indexes.length, 1)
  assert.equal(indexes[0].turn, 9)
  assert.equal(indexes[0].start_seq, start.seq)
  const report = await restored.ctx.noema.get(session.id, indexes[0].report_id)
  assert.equal(report.end_seq, end.seq)
  assert.equal(report.files[0].before.analysis.scopes[0].metrics.cyclomatic, 3)
  assert.equal(report.files[0].after.analysis.scopes[0].metrics.cyclomatic, 2)
})
