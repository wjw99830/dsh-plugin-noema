import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { measureCase, summarize } from '../scripts/benchmark-analyzer.mjs'
import { cases } from '../scripts/benchmark-cases.mjs'

const script = fileURLToPath(new URL('../scripts/benchmark-analyzer.mjs', import.meta.url))
const root = fileURLToPath(new URL('../', import.meta.url))

test('benchmark statistics use the middle value or the mean of the two middle values', () => {
  assert.deepEqual(summarize([9, 1, 5]), { min_ms: 1, median_ms: 5, max_ms: 9 })
  assert.deepEqual(summarize([10, 2, 1, 8]), { min_ms: 1, median_ms: 5, max_ms: 10 })
  assert.deepEqual(summarize([3]), { min_ms: 3, median_ms: 3, max_ms: 3 })
})

test('benchmark timing excludes result validation and keeps cold and warmup calls out of warm samples', async t => {
  let clock = 0
  let calls = 0
  t.mock.method(performance, 'now', () => clock)
  const result = await measureCase(cases[0], { warmup: 2, samples: 3 }, async () => {
    calls++
    clock += 7
    return {
      status: 'ok',
      engine: {},
      get scopes() {
        clock += 1000
        return [
          { kind: 'module', metrics: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
          { kind: 'function' },
        ]
      },
    }
  })
  assert.equal(calls, 6)
  assert.equal(result.cold_ms, 7)
  assert.deepEqual(result.warm_ms, [7, 7, 7])
})

test('benchmark refuses to report timings for failed or incomplete analysis', async () => {
  for (const value of [{ status: 'not_analyzed', reason: 'parse_error' }, { status: 'ok', scopes: [] }]) {
    await assert.rejects(measureCase(cases[0], { warmup: 0, samples: 1 }, async () => value))
  }
})

test('benchmark CLI measures every workload and saves reproducible inputs and raw runs', { timeout: 60000 }, async t => {
  await mkdir(join(root, '.artifacts'), { recursive: true })
  const directory = await mkdtemp(join(root, '.artifacts/benchmark-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const output = join(directory, 'nested/result.json')
  const run = spawnSync(process.execPath, [script, '--runs', '1', '--warmup', '0', '--samples', '2', '--output', output], {
    cwd: directory, encoding: 'utf8', timeout: 55000,
  })
  assert.equal(run.status, 0, run.stderr || run.error?.message)
  const report = JSON.parse(await readFile(output, 'utf8'))
  assert.deepEqual(report.cases.map(value => value.id), cases.map(value => value.id))
  assert.equal(report.config.runs, 1)
  assert.equal(report.config.samples, 2)
  assert.match(report.code.artifact_sha256, /^[a-f0-9]{64}$/)
  assert.match(report.code.benchmark_sha256, /^[a-f0-9]{64}$/)
  assert.match(report.code.source_sha256, /^[a-f0-9]{64}$/)
  for (const [index, result] of report.cases.entries()) {
    const input = cases[index]
    assert.equal(result.source_sha256, createHash('sha256').update(input.source).digest('hex'))
    assert.equal(result.source_bytes, Buffer.byteLength(input.source))
    assert.equal(result.functions, input.functions)
    assert.equal(result.runs.length, 1)
    const [{ cold_ms, warm_ms }] = result.runs
    assert.ok(Number.isFinite(cold_ms) && cold_ms >= 0)
    assert.equal(warm_ms.length, 2)
    assert.ok(warm_ms.every(value => Number.isFinite(value) && value >= 0))
    assert.equal(result.warm.median_ms, (warm_ms[0] + warm_ms[1]) / 2)
  }
  const selectedOutput = join(directory, 'selected.json')
  const selected = spawnSync(process.execPath, [script, '--case', 'tsx-structured', '--runs', '2', '--warmup', '1', '--samples', '1', '--output', selectedOutput], {
    cwd: directory, encoding: 'utf8', timeout: 15000,
  })
  assert.equal(selected.status, 0, selected.stderr || selected.error?.message)
  const selection = JSON.parse(await readFile(selectedOutput, 'utf8'))
  assert.deepEqual(selection.cases.map(value => value.id), ['tsx-structured'])
  assert.equal(selection.cases[0].runs.length, 2)
  assert.equal(selection.cases[0].source_sha256, report.cases.find(value => value.id === 'tsx-structured').source_sha256)
  assert.equal(selection.code.artifact_sha256, report.code.artifact_sha256)
})

test('benchmark CLI rejects invalid sample counts and unknown cases before measuring', () => {
  for (const [args, message] of [
    [['--samples', '0'], /--samples must be a positive integer/],
    [['--runs', '1.5'], /--runs must be a positive integer/],
    [['--case', 'missing'], /Unknown case: missing/],
  ]) {
    const run = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 })
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, message)
  }
})
