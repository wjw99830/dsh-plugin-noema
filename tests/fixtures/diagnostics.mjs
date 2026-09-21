import assert from 'node:assert/strict'
import { diagnose } from '../../lib/diagnostics.js'
import { AnalysisQueue } from '../../lib/analyzer/queue.js'
import { request } from '../helpers.mjs'

for (const level of ['error', 'warn', 'info', 'debug']) diagnose('host.probe', {}, level)
const queue = new AnalysisQueue(1, 10000)
try {
  const report = await queue.run(request({}, { 'a.ts': 'function sourceNeverLogged(){if(x)return 1}' }))
  if (report.files.length !== 1) throw new Error('Worker did not analyze the fixture')
  assert.equal(await queue.run(request({}, {})), undefined)
  assert.equal(await queue.run(request({}, { 'empty.ts': '' })), undefined)
} finally {
  await queue.close()
}
