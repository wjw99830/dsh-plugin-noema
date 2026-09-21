import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { analyzeSource } from '../lib/analyzer/index.js';
import { cases } from './benchmark-cases.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(import.meta.url);

export function summarize(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    min_ms: sorted[0],
    median_ms: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    max_ms: sorted.at(-1),
  };
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rss_bytes: memory.rss,
    heap_total_bytes: memory.heapTotal,
    heap_used_bytes: memory.heapUsed,
    external_bytes: memory.external,
    array_buffers_bytes: memory.arrayBuffers,
  };
}

export async function measureCase(scenario, { warmup, samples }, analyze = analyzeSource) {
  const memoryBefore = memorySnapshot();
  const warmTimes = [];
  let coldTime;
  let engine;
  let metrics;
  for (let iteration = 0; iteration < 1 + warmup + samples; iteration++) {
    const start = performance.now();
    const result = await analyze(scenario.path, scenario.source);
    const elapsed = performance.now() - start;

    assert.equal(result?.status, 'ok', `${scenario.id}: analysis failed`);
    const scopes = result.scopes;
    assert.equal(scopes.filter((scope) => scope.kind === 'function').length, scenario.functions, scenario.id);
    if (iteration === 0) {
      coldTime = elapsed;
      engine = result.engine;
      metrics = scopes[0].metrics;
    } else {
      assert.deepEqual(scopes[0].metrics, metrics, `${scenario.id}: inconsistent measurements`);
      if (iteration > warmup) warmTimes.push(elapsed);
    }
  }
  return {
    source_sha256: createHash('sha256').update(scenario.source).digest('hex'),
    engine,
    metrics,
    cold_ms: coldTime,
    warm_ms: warmTimes,
    memory_before: memoryBefore,
    memory_after: memorySnapshot(),
  };
}

async function hashFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths.toSorted()) {
    const content = await readFile(resolve(root, path));
    hash.update(JSON.stringify([path, content.length]));
    hash.update(content);
  }
  return hash.digest('hex');
}

async function codeIdentity() {
  const sourceFiles = (await readdir(resolve(root, 'src/analyzer'), { recursive: true }))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => `src/analyzer/${path}`);
  const artifactFiles = (await readdir(resolve(root, 'lib/analyzer'), { recursive: true }))
    .filter((path) => /\.(js|wasm|json)$/.test(path))
    .map((path) => `lib/analyzer/${path}`);
  return {
    git_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    git_dirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).length > 0,
    source_sha256: await hashFiles(['src/languages.ts', ...sourceFiles]),
    artifact_sha256: await hashFiles(['lib/languages.js', ...artifactFiles]),
    benchmark_sha256: await hashFiles(['scripts/benchmark-analyzer.mjs', 'scripts/benchmark-cases.mjs']),
    lockfile_sha256: await hashFiles(['pnpm-lock.yaml']),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      output: { type: 'string' },
      case: { type: 'string', multiple: true },
      runs: { type: 'string', default: '5' },
      warmup: { type: 'string', default: '5' },
      samples: { type: 'string', default: '20' },
      help: { type: 'boolean', short: 'h' },
      child: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(`Usage: pnpm benchmark:analyzer [options]

  --case ID       Select a workload; repeat to select several (default: all)
  --runs N        Fresh processes per workload (default: 5)
  --warmup N      Discarded calls after the first analysis (default: 5)
  --samples N     Measured warm calls per process (default: 20)
  --output PATH   Save JSON here (default: a timestamped file in .artifacts)

Cases: ${cases.map((scenario) => scenario.id).join(', ')}`);
    return;
  }
  const config = {};
  for (const name of ['runs', 'warmup', 'samples']) {
    const value = Number(values[name]);
    const minimum = name === 'warmup' ? 0 : 1;
    assert.ok(
      Number.isSafeInteger(value) && value >= minimum,
      `--${name} must be a ${minimum ? 'positive' : 'non-negative'} integer`,
    );
    config[name] = value;
  }
  for (const id of values.case ?? []) {
    assert.ok(
      cases.some((scenario) => scenario.id === id),
      `Unknown case: ${id}`,
    );
  }
  const selected = values.case ? cases.filter((scenario) => values.case.includes(scenario.id)) : cases;
  if (values.child) {
    assert.equal(selected.length, 1, 'Child process requires exactly one case');
    console.log(JSON.stringify(await measureCase(selected[0], config)));
    return;
  }

  const report = {
    checked_at: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: platform(),
      architecture: arch(),
      os_release: release(),
      cpu: cpus()[0].model,
    },
    config,
    code: await codeIdentity(),
    cases: [],
    wasm_bytes: {},
    memory_note: 'Process snapshots before and after analysis; not peak or per-file memory usage',
  };
  for (const scenario of selected) {
    const runs = [];
    let engine;
    let metrics;
    const sourceHash = createHash('sha256').update(scenario.source).digest('hex');
    for (let run = 0; run < config.runs; run++) {
      console.error(`${scenario.id}: run ${run + 1}/${config.runs}`);
      const result = JSON.parse(
        execFileSync(
          process.execPath,
          [
            script,
            '--child',
            '--case',
            scenario.id,
            '--warmup',
            String(config.warmup),
            '--samples',
            String(config.samples),
          ],
          { cwd: root, encoding: 'utf8', timeout: 120_000 },
        ),
      );
      assert.equal(result.source_sha256, sourceHash, `${scenario.id}: workload changed during measurement`);
      if (run === 0) {
        engine = result.engine;
        metrics = result.metrics;
      } else {
        assert.deepEqual(result.engine, engine, `${scenario.id}: analyzer changed during measurement`);
        assert.deepEqual(result.metrics, metrics, `${scenario.id}: inconsistent measurements`);
      }
      const { cold_ms, warm_ms, memory_before, memory_after } = result;
      runs.push({ cold_ms, warm_ms, memory_before, memory_after });
    }
    report.cases.push({
      id: scenario.id,
      path: scenario.path,
      source_sha256: sourceHash,
      source_bytes: Buffer.byteLength(scenario.source),
      functions: scenario.functions,
      engine,
      metrics,
      cold: summarize(runs.map((run) => run.cold_ms)),
      warm: summarize(runs.flatMap((run) => run.warm_ms)),
      runs,
    });
  }
  for (const mode of ['typescript', 'tsx', 'python', 'go']) {
    report.wasm_bytes[mode] = (await stat(resolve(root, `lib/analyzer/grammars/tree-sitter-${mode}.wasm`))).size;
  }
  report.wasm_bytes.runtime = (
    await stat(fileURLToPath(import.meta.resolve('web-tree-sitter/web-tree-sitter.wasm')))
  ).size;
  assert.deepEqual(await codeIdentity(), report.code, 'Code changed during measurement; rerun with a stable checkout');
  const output = values.output
    ? resolve(values.output)
    : resolve(root, `.artifacts/analyzer-benchmark-${report.checked_at.replaceAll(':', '-')}-${process.pid}.json`);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.table(
    report.cases.map((result) => ({
      case: result.id,
      bytes: result.source_bytes,
      functions: result.functions,
      cold_median_ms: Number(result.cold.median_ms.toFixed(2)),
      warm_median_ms: Number(result.warm.median_ms.toFixed(2)),
    })),
  );
  console.log(`Results: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === script) await main();
