import assert from 'node:assert/strict'
import test from 'node:test'
import { compareSnapshots } from '../lib/compare.js'
import { scopeChildren } from '../lib/client/presentation.js'
import { request } from './helpers.mjs'

for (const [path, before, after] of [
  ['a.ts', 'function f(x:boolean){return x}', '// note\nfunction f( x : boolean ) { return x }'],
  ['a.py', 'def f(x):\n    return x\n', '# note\ndef f( x ):\n    return x\n'],
  [
    'a.go',
    'package p\nfunc F(x bool) bool {return x}',
    'package p\n// note\nfunc F(x bool) bool { return x }',
  ],
])
  test(`ignores comments and layout in ${path}`, async () =>
    assert.equal(await compareSnapshots(request({ [path]: before }, { [path]: after })), undefined))

for (const [name, before, after] of [
  ['no files', {}, {}],
  ['unchanged code', { 'a.ts': 'function f() {}' }, { 'a.ts': 'function f() {}' }],
]) test(`${name} produces no report`, async () => {
  assert.equal(await compareSnapshots(request(before, after)), undefined)
})

test('silences blank and comment-only additions', async () => {
  for (const path of ['empty.ts', 'empty.py'])
    for (const source of ['', path.endsWith('.py') ? '# comment\n' : '// comment\n']) {
      assert.equal(await compareSnapshots(request({}, { [path]: source })), undefined)
    }
})
test('preserves zero deltas for changed code', async () => {
  const report = await compareSnapshots(
    request(
      { 'a.ts': 'function f(){return "secret before"}' },
      { 'a.ts': 'function f(){return "secret after"}' },
    ),
  )
  const file = report.files[0],
    change = file.changes.find(change => file.after.analysis.scopes[change.after_index]?.name === "f")
  assert.equal(change.change, 'modified')
  assert.deepEqual(change.delta, { cognitive: 0, cyclomatic: 0, max_nesting_depth: 0 })
})
test('retains class and nested function parents and displays removed subtrees', async () => {
  const report = await compareSnapshots(
    request(
      { 'a.ts': 'class A {f(){ function inner(){if(x)return 1} return inner() }} function g(){return 1}' },
      { 'a.ts': 'class A {f(){return 1}} function g(){return 2}' },
    ),
  )
  const file = report.files[0]
  const named = (name) =>
    file.changes.findIndex(
      (c) =>
        (c.after_index === undefined
          ? file.before.analysis.scopes[c.before_index]
          : file.after.analysis.scopes[c.after_index]
        ).name === name,
    )
  assert.equal(file.changes[named('inner')].parent, named('f'))
  assert.equal(file.changes[named('f')].parent, named('A'))
  assert.equal(file.changes[named('A')].parent, 0)
  assert.equal(file.changes[named('g')].parent, 0)
  assert.equal(file.changes[named('inner')].change, 'removed')
  const children = scopeChildren(file)
  assert.deepEqual(new Set(children.get(undefined)), new Set([named('f'), named('g')]))
  assert.deepEqual(children.get(named('f')).map(index => (file.changes[index].after_index === undefined ? file.before.analysis.scopes[file.changes[index].before_index] : file.after.analysis.scopes[file.changes[index].after_index]).name), ['Top Level', 'inner'])
  assert.equal(children.has(named('A')), false)
  assert.equal(children.has(0), false)
})
test('shows methods beneath the file or enclosing function while hiding unchanged siblings', async () => {
  const source = (value) => `namespace N {
    class A { changed() { return ${value} } stable() { return 0 } }
    function outer() {
      class Local { method() { function inner() { return ${value} } return inner() } }
      return Local
    }
  }`
  const report = await compareSnapshots(request({ 'a.ts': source(1) }, { 'a.ts': source(2) }))
  const file = report.files[0]
  const names = file.changes.map((change) => file.after.analysis.scopes[change.after_index].name)
  const children = scopeChildren(file)
  const childNames = (parent) => (children.get(parent) ?? []).map((index) => names[index])
  assert.deepEqual(new Set(childNames(undefined)), new Set(['changed', 'outer']))
  assert.deepEqual(childNames(names.indexOf('outer')), ['method'])
  assert.deepEqual(childNames(names.indexOf('method')), ['inner'])
  assert.deepEqual(
    new Set([...children.values()].flat().map((index) => names[index])),
    new Set(['changed', 'outer', 'method', 'inner', 'Top Level']),
  )
})
test('retains current scores when the baseline cannot be parsed', async () => {
  const report = await compareSnapshots(
    request(
      { 'a.ts': 'function broken(', 'bad.py': 'def :' },
      { 'a.ts': 'function fixed(){if(x)return 1}', 'bad.py': 'def :' },
    ),
  )
  assert.equal(report.files.length, 1)
  assert.equal(report.files[0].before.reason, 'parse_error')
  assert.deepEqual(report.files[0].after.analysis.scopes[0].metrics, { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 })
  assert.ok(report.files[0].changes.length > 0)
  assert.ok(report.files[0].changes.every((c) => c.change === 'unavailable' && c.delta === undefined))
})
test('measures syntax structure changes in Python indentation', async () => {
  const report = await compareSnapshots(
    request(
      { 'a.py': 'def f(x):\n    if x:\n        if x: return 1\n' },
      { 'a.py': 'def f(x):\n    if x: pass\n    if x: return 1\n' },
    ),
  )
  const file = report.files[0]
  const change = file.changes.find(change => file.after.analysis.scopes[change.after_index]?.name === "f")
  assert.equal(change.delta.cognitive, -1)
})
test('persists only measurements, without source snapshots or textual diffs', async () => {
  const report = await compareSnapshots(
    request(
      { 'a.ts': 'function f(){return "private before"}' },
      { 'a.ts': 'function f(){if(x)return "private after";return 0}' },
    ),
  )
  assert.equal(report.files[0].after.analysis.scopes[0].metrics.cyclomatic, 2)
  assert.doesNotMatch(JSON.stringify(report), /private before|private after|"source"|"diff"/)
})

for (const before of [{}, { 'a.ts': 'function (' }]) {
  test(`keeps an unparseable updated file with ${Object.keys(before).length ? 'an unparseable baseline' : 'no baseline'}`, async () => {
    const report = await compareSnapshots(request(before, { 'a.ts': 'function broken(' }))
    assert.equal(report.files.length, 1)
    assert.equal(report.files[0].after.reason, 'parse_error')
    assert.deepEqual(report.files[0].changes, [])
  })
}

test('omits an unchanged file even when its code cannot be parsed', async () => {
  const files = { 'a.ts': 'function broken(' }
  assert.equal(await compareSnapshots(request(files, files)), undefined)
})
