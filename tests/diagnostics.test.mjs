import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const fixture = fileURLToPath(new URL('./fixtures/diagnostics.mjs', import.meta.url))
function run(level) {
  const env = { ...process.env }
  delete env.NOEMA_LOG_LEVEL
  if (level !== undefined) env.NOEMA_LOG_LEVEL = level
  return spawnSync(process.execPath, [fixture], { env, encoding: 'utf8', timeout: 15000 })
}

for (const [level, visible] of [
  [undefined, ['error', 'warn']],
  ['error', ['error']],
  ['warn', ['error', 'warn']],
  ['info', ['error', 'warn', 'info']],
  ['debug', ['error', 'warn', 'info', 'debug']],
]) {
  test(`diagnostic level ${level ?? 'default'} filters Host and Worker output`, () => {
    const result = run(level)
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    const records = result.stderr.trim().split('\n').map(line => {
      const match = line.match(/^\[noema:(\w+)\] (.*)$/)
      assert.ok(match, line)
      return { level: match[1], ...JSON.parse(match[2]) }
    })
    assert.deepEqual(records.filter(r => r.stage === 'host.probe').map(r => r.level), visible)
    const worker = records.filter(r => r.stage !== 'host.probe')
    assert.equal(worker.length > 0, level === 'debug')
    assert.ok(worker.every(r => r.level === 'debug'))
    assert.ok(!result.stderr.includes('sourceNeverLogged'))
  })
}

test('rejects an invalid diagnostic level at startup', () => {
  const result = run('verbose')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /NOEMA_LOG_LEVEL must be error, warn, info, or debug/)
})
