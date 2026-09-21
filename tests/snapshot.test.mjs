import assert from 'node:assert/strict'
import test from 'node:test'
import { writeFile, mkdir, symlink } from 'node:fs/promises'
import { captureSnapshot } from '../lib/snapshot.js'
import { Config } from '../lib/config.js'
import { workspace, config } from './helpers.mjs'

test('captures supported extensions with frozen nested ignore files and skips links', async (t) => {
  const { ctx, cwd } = await workspace(t)
  await mkdir(`${cwd}/nested`)
  await writeFile(`${cwd}/.gitignore`, 'ignored.ts\nnested/*.ts\n')
  await writeFile(`${cwd}/nested/.gitignore`, '!keep.ts\n')
  for (const path of ['a.ts', 'ignored.ts', 'x.js', 'types.d.ts', 'nested/drop.ts', 'nested/keep.ts'])
    await writeFile(`${cwd}/${path}`, 'function f(){}')
  await symlink(`${cwd}/a.ts`, `${cwd}/link.ts`)
  const before = await captureSnapshot(ctx.fs, cwd, config, new AbortController().signal)
  assert.deepEqual(Object.keys(before.files).sort(), ['a.ts', 'link.ts', 'nested/keep.ts'])
  assert.equal(before.files['link.ts'].reason, 'not_regular_file')
  await writeFile(`${cwd}/.gitignore`, 'a.ts\n')
  const after = await captureSnapshot(ctx.fs, cwd, config, new AbortController().signal, before.ignore_rules)
  assert.deepEqual(Object.keys(after.files).sort(), Object.keys(before.files).sort())
})
test('reports file failures and aborts an incomplete scan at the total cap', async (t) => {
  const { ctx, cwd } = await workspace(t)
  await writeFile(`${cwd}/a.ts`, 'function f(){}')
  const result = await captureSnapshot(
    ctx.fs,
    cwd,
    { ...config, max_file_bytes: 2 },
    new AbortController().signal,
  )
  assert.equal(result.files['a.ts'].reason, 'file_too_large')
  await assert.rejects(
    captureSnapshot(ctx.fs, cwd, { ...config, max_snapshot_bytes: 2 }, new AbortController().signal),
    /byte limit/,
  )
  await writeFile(`${cwd}/b.ts`, Buffer.from([0xff, 0xfe]))
  const invalid = await captureSnapshot(ctx.fs, cwd, config, new AbortController().signal)
  assert.equal(invalid.files['b.ts'].reason, 'not_text')
  await assert.rejects(
    captureSnapshot(ctx.fs, cwd, { ...config, max_files: 1 }, new AbortController().signal),
    /file limit/,
  )
})

test('filters file globs before reading sources while retaining nested includes and default exclusions', async (t) => {
  const { ctx, cwd } = await workspace(t)
  const files = [
    'root.ts',
    'src/main.ts',
    'src/main.test.ts',
    'src/view.spec.tsx',
    'src/__tests__/view.tsx',
    'src/test_main.py',
    'src/main_test.go',
    'src/nested/main.go',
    'src/.hidden.py',
    'src/ignored.py',
    'src/node_modules/lib/index.ts',
    'src/.artifacts/temp.ts',
    'src/view.js',
    'src/types.d.ts',
    'outside/other.ts',
  ]
  for (const path of files) {
    await mkdir(`${cwd}/${path.slice(0, path.lastIndexOf('/') + 1)}`, { recursive: true })
    await writeFile(`${cwd}/${path}`, 'code')
  }
  await writeFile(`${cwd}/.gitignore`, 'src/ignored.py\n')
  const options = Config({
    include: ['root.ts', 'src/**/*.{ts,tsx,py,go,js}'],
    exclude: [
      ...config.exclude,
      '**/*.{test,spec}.{ts,tsx}',
      '**/__tests__/**',
      '**/test_*.py',
      '**/*_test.go',
    ],
    max_files: 4,
  })
  const snapshot = await captureSnapshot(ctx.fs, cwd, options, new AbortController().signal)
  assert.deepEqual(Object.keys(snapshot.files).sort(), [
    'root.ts',
    'src/.hidden.py',
    'src/main.ts',
    'src/nested/main.go',
  ])
  const empty = await captureSnapshot(ctx.fs, cwd, { ...options, include: [] }, new AbortController().signal)
  assert.deepEqual(empty.files, {})
})

for (const interruption of ['cancel', 'timeout']) {
  test(`snapshot ${interruption} rejects an in-progress read instead of returning a partial scan`, { timeout: 15000 }, async t => {
    const { ctx, cwd } = await workspace(t)
    await writeFile(`${cwd}/a.ts`, 'function f() {}')
    const controller = new AbortController()
    t.after(() => controller.abort())
    const deadline = new AbortController()
    t.mock.method(AbortSignal, 'timeout', () => deadline.signal)
    const started = Promise.withResolvers()
    t.mock.method(ctx.fs, 'readBytes', async (target, signal) => {
      started.resolve()
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    const reason = interruption === 'cancel' ? new Error('capture cancelled') : new DOMException('capture timed out', 'TimeoutError')
    const scan = captureSnapshot(ctx.fs, cwd, config, controller.signal)
    const rejected = assert.rejects(scan, error => error === reason)
    await started.promise
    ;(interruption === 'cancel' ? controller : deadline).abort(reason)
    await rejected
  })
}

test('discards a file changed during reading and keeps the remaining files', async t => {
  const { ctx, cwd } = await workspace(t)
  await writeFile(`${cwd}/a.ts`, 'function f() {}')
  await writeFile(`${cwd}/b.ts`, 'function stable() {}')
  const readBytes = ctx.fs.readBytes.bind(ctx.fs)
  t.mock.method(ctx.fs, 'readBytes', async (...args) => {
    const bytes = await readBytes(...args)
    if (new TextDecoder().decode(bytes) === 'function f() {}')
      await writeFile(`${cwd}/a.ts`, 'function changed() { if (ready) run() }')
    return bytes
  })
  const result = await captureSnapshot(ctx.fs, cwd, config, new AbortController().signal)
  assert.deepEqual(result.files['a.ts'], { status: 'skipped', reason: 'changed_during_read' })
  assert.equal(result.files['b.ts'].source, 'function stable() {}')
})
