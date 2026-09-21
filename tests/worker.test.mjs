import assert from 'node:assert/strict'
import test from 'node:test'
import threads from 'node:worker_threads'
import { syncBuiltinESMExports } from 'node:module'
import { AnalysisQueue } from '../lib/analyzer/queue.js'
import { compareSnapshots } from '../lib/compare.js'
import { request } from './helpers.mjs'

test('Worker measures three languages and enforces queue admission', async (t) => {
  const queue = new AnalysisQueue(1, 10000)
  t.after(() => queue.close())
  const input = request(
    {},
    {
      'a.ts': 'function f(){if(x)return 1}',
      'b.py': 'def f(x):\n    if x: return 1\n',
      'c.go': 'package p; func F(x bool) int {if x{return 1};return 0}',
    },
  )
  const running = queue.run(input)
  await assert.rejects(queue.run(input), /full/)
  const report = await running
  assert.equal(report.files.length, 3)
  assert.ok(report.files.every((file) => file.after.analysis.engine.name === 'noema-tree-sitter'))
  assert.equal(await queue.run(request({}, {})), undefined)
})
test('Worker rejects invalid input and a queued close without retaining active Workers', async () => {
  const queue = new AnalysisQueue(2, 10000)
  await assert.rejects(queue.run({}), Error)
  const pending = queue.run(request({}, {}))
  const rejected = assert.rejects(pending, /disposed/)
  await queue.close()
  await rejected
  await assert.rejects(queue.run(request({}, {})), /disposed/)
})

for (const interruption of ['close', 'timeout']) {
  test(`${interruption} terminates a started Worker and settles queued requests`, { timeout: 15000 }, async t => {
    const Worker = threads.Worker
    const started = Promise.withResolvers()
    const deadline = new AbortController()
    const workers = []
    let terminated = 0
    let hold = true
    t.mock.method(threads, 'Worker', class extends Worker {
      constructor(url, options) {
        super(hold ? 'require("node:worker_threads").parentPort.on("message", () => {})' : url,
          hold ? { eval: true } : options)
        workers.push(this)
        this.once('online', started.resolve)
        this.once('exit', () => terminated++)
      }
    })
    syncBuiltinESMExports()
    t.mock.method(AbortSignal, 'timeout', () => deadline.signal)
    const queue = new AnalysisQueue(2, 10000)
    t.after(async () => {
      await queue.close()
      await Promise.all(workers.map(worker => worker.terminate()))
      t.mock.restoreAll()
      syncBuiltinESMExports()
    })
    const running = queue.run(request({}, {}))
    const firstRejected = assert.rejects(running, interruption === 'close' ? /disposed/ : { name: 'TimeoutError' })
    await started.promise
    assert.equal(terminated, 0)
    if (interruption === 'close') {
      const queuedRejected = assert.rejects(queue.run(request({}, {})), /disposed/)
      await queue.close()
      await Promise.all([firstRejected, queuedRejected])
      assert.equal(workers.length, 1)
      await assert.rejects(queue.run(request({}, {})), /disposed/)
    } else {
      deadline.abort(new DOMException('analysis timed out', 'TimeoutError'))
      await firstRejected
    }
    assert.equal(terminated, 1)
    if (interruption === 'timeout') {
      hold = false
      t.mock.method(AbortSignal, 'timeout', () => new AbortController().signal)
      const report = await queue.run(request({}, { 'a.ts': 'function f() {}' }))
      assert.equal(report.files[0].path, 'a.ts')
      assert.equal(terminated, 2)
    }
  })
}


test('rejects a Worker result marked successful without a file node', async t => {
  const invalid = await compareSnapshots(request({}, { 'a.ts': 'function f() {}' }))
  invalid.files[0].after.analysis.scopes = []
  const Worker = threads.Worker
  t.mock.method(threads, 'Worker', class extends Worker {
    constructor() {
      super('const { parentPort, workerData } = require("node:worker_threads"); parentPort.postMessage(workerData)',
        { eval: true, workerData: invalid })
    }
  })
  syncBuiltinESMExports()
  const queue = new AnalysisQueue(1, 10000)
  t.after(async () => {
    await queue.close()
    t.mock.restoreAll()
    syncBuiltinESMExports()
  })
  await assert.rejects(queue.run(request({}, {})), { name: 'ZodError' })
})
