import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSource } from '../lib/analyzer/index.js'
import { compareSnapshots } from '../lib/compare.js'
import { request } from './helpers.mjs'

// Cognitive nesting and exceptions: Sonar white paper v1.7, pp. 9, 14–15
// Aggregation and anonymous-function base: docs/design.md#metric-aggregation
const cases = [
  {
    name: 'TypeScript nested functions retain source nesting while control depth resets',
    path: 'a.ts',
    source: `function outer(flag) {
      if (flag) {
        function inner() {
          if (flag) { while (flag) { break } }
        }
        inner()
      }
    }`,
    expected: { 'a.ts': [5, 8, 2], outer: [5, 8, 2], inner: [3, 7, 2] },
    own: { 'a.ts': [0, 0, 0], outer: [2, 1, 1], inner: [3, 7, 2] },
  },
  {
    name: 'named arrow functions retain cognitive context and reset control depth',
    path: 'a.ts',
    source: `function outer(x) { if (x) { const inner = () => { if (x) return 1; return 0 }; return inner() } }`,
    expected: { 'a.ts': [4, 4, 1], outer: [4, 4, 1], inner: [2, 3, 1] },
    own: { 'a.ts': [0, 0, 0], outer: [2, 1, 1], inner: [2, 3, 1] },
  },
  {
    name: 'three function levels sum contextual scores once',
    path: 'a.ts',
    source: `function outer(flag) {
      if (flag) work()
      function inner() {
        if (flag) work()
        function deeper() { if (flag) work() }
        deeper()
      }
      inner()
    }`,
    expected: { 'a.ts': [6, 6, 1], outer: [6, 6, 1], inner: [4, 5, 1], deeper: [2, 3, 1] },
    own: { 'a.ts': [0, 0, 0], outer: [2, 1, 1], inner: [2, 2, 1], deeper: [2, 3, 1] },
  },
  {
    name: 'anonymous callbacks contribute branches without another cyclomatic base',
    path: 'a.ts',
    source: `function outer(items) { items.map(item => { if (item) return 1; return 0 }) }`,
    expected: { 'a.ts': [2, 2, 1], outer: [2, 2, 1] },
    own: { 'a.ts': [0, 0, 0], outer: [2, 2, 1] },
  },
  {
    name: 'top-level anonymous callback is included in the file',
    path: 'a.ts',
    source: `items.map(item => { if (item) return 1; return 0 })`,
    expected: { 'a.ts': [1, 1, 1] },
    own: { 'a.ts': [1, 1, 1] },
  },
  {
    name: 'file includes its own decisions and named functions exactly once',
    path: 'a.py',
    source: `if ready:
    work()
def outer(flag):
    if flag:
        def inner():
            if flag:
                return 1
        return inner()
`,
    expected: { 'a.py': [5, 5, 1], outer: [4, 4, 1], inner: [2, 3, 1] },
    own: { 'a.py': [1, 1, 1], outer: [2, 1, 1], inner: [2, 3, 1] },
  },
  {
    name: 'Python decorator wrapper adds no cognitive nesting',
    path: 'a.py',
    source: `def decorator(func):
    def inner(flag):
        if flag:
            return func()
    return inner
`,
    expected: { 'a.py': [3, 1, 1], decorator: [3, 1, 1], inner: [2, 1, 1] },
    own: { 'a.py': [0, 0, 0], decorator: [1, 0, 0], inner: [2, 1, 1] },
  },
  {
    name: 'Python wrapper with another statement receives normal nesting',
    path: 'a.py',
    source: `def decorator(func):
    count = 0
    def inner(flag):
        if flag:
            return func()
    return inner
`,
    expected: { 'a.py': [3, 2, 1], decorator: [3, 2, 1], inner: [2, 2, 1] },
    own: { 'a.py': [0, 0, 0], decorator: [1, 0, 0], inner: [2, 2, 1] },
  },
  {
    name: 'TypeScript declarative wrapper adds no cognitive nesting',
    path: 'a.ts',
    source: `function namespace() { const value = 1; function inner(flag) { if (flag) return value } }`,
    expected: { 'a.ts': [3, 1, 1], namespace: [3, 1, 1], inner: [2, 1, 1] },
    own: { 'a.ts': [0, 0, 0], namespace: [1, 0, 0], inner: [2, 1, 1] },
  },
  {
    name: 'Go named closures aggregate recursively',
    path: 'a.go',
    source: `package p
func outer(flag bool) {
  if flag {
    inner := func() { if flag { work() } }
    inner()
  }
}`,
    expected: { 'a.go': [4, 4, 1], outer: [4, 4, 1], inner: [2, 3, 1] },
    own: { 'a.go': [0, 0, 0], outer: [2, 1, 1], inner: [2, 3, 1] },
  },
  {
    name: 'Go anonymous closure has independent control depth',
    path: 'a.go',
    source: `package p
func outer(flag bool) {
  if flag { run(func() { for flag { if flag { break } } }) }
}`,
    expected: { 'a.go': [4, 8, 2], outer: [4, 8, 2] },
    own: { 'a.go': [0, 0, 0], outer: [4, 8, 2] },
  },
]

const metrics = ([cyclomatic, cognitive, max_nesting_depth]) => ({ cyclomatic, cognitive, max_nesting_depth })

for (const example of cases) test(example.name, async () => {
  const result = await analyzeSource(example.path, example.source)
  assert.equal(result.status, 'ok')
  const named = result.scopes.filter(scope => ['module', 'function'].includes(scope.kind))
  assert.deepEqual(named.map(scope => scope.name), Object.keys(example.expected))
  for (const scope of named) {
    assert.deepEqual(scope.metrics, metrics(example.expected[scope.name]), scope.name)
    const index = result.scopes.indexOf(scope)
    const own = result.scopes.find(child => child.parent === index && child.kind === 'top_level')
    assert.ok(own, `${scope.name} has Top Level measurements`)
    assert.deepEqual(own.metrics, metrics(example.own[scope.name]), `${scope.name} Top Level`)
  }
})

test('anonymous callback edits stay within the enclosing function', async () => {
  const source = body => `function f(items) { items.map(item => { ${body} }) }`
  const report = await compareSnapshots(request(
    { 'a.ts': source('return item') },
    { 'a.ts': source('if (item) return 1; return 0') },
  ))
  const file = report.files[0]
  assert.ok(file.changes.every(change => change.change !== 'added' && change.change !== 'removed'))
  const functions = file.after.analysis.scopes.filter(scope => scope.kind === 'function')
  assert.deepEqual(functions.map(scope => scope.name), ['f'])
  assert.deepEqual(functions[0].metrics, { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 })
})

test('editing a child body preserves the enclosing Top Level', async () => {
  const source = value => `function outer() { function inner() { return ${value} }; return inner() }`
  const report = await compareSnapshots(request({ 'a.ts': source(1) }, { 'a.ts': source(2) }))
  const file = report.files[0]
  const scopes = file.after.analysis.scopes
  const outer = scopes.findIndex(scope => scope.name === 'outer')
  const own = scopes.findIndex(scope => scope.parent === outer && scope.kind === 'top_level')
  assert.ok(own >= 0)
  assert.equal(file.changes.find(change => change.after_index === own).change, 'unchanged')
})

test('deleted files are omitted while removed functions remain comparable', async () => {
  assert.equal(await compareSnapshots(request({ 'a.ts': 'function f() {}' }, {})), undefined)
  const report = await compareSnapshots(request(
    { 'a.ts': 'function keep() {} function remove() {}' },
    { 'a.ts': 'function keep() {}' },
  ))
  assert.ok(report.files[0].changes.some(change => change.change === 'removed'))
})

for (const [path, before, after] of [
  ['a.ts', 'function f(){return 1}', 'function f() { return 1; }'],
  ['a.ts', 'const xs = [1, 2]; function f(a, b) { return xs }', 'const xs = [1, 2,]; function f(a, b,) { return xs; }'],
  ['a.py', 'def f(a, b):\n    return [a, b]\n', 'def f(a, b,):\n    return [a, b,]\n'],
]) test(`optional punctuation preserves syntax in ${path}: ${before}`, async () => {
  assert.equal(await compareSnapshots(request({ [path]: before }, { [path]: after })), undefined)
})

test('punctuation with syntactic meaning remains a change', async () => {
  const report = await compareSnapshots(request(
    { 'a.ts': 'const items = [1, 2]' }, { 'a.ts': 'const items = [1,, 2]' },
  ))
  assert.ok(report)
  const tuple = await compareSnapshots(request({ 'a.py': 'value = (1)\n' }, { 'a.py': 'value = (1,)\n' }))
  assert.ok(tuple)
})

test('parentheses around a named function preserve its identity and score', async () => {
  assert.equal(await compareSnapshots(request(
    { 'a.ts': 'const f = () => 1' },
    { 'a.ts': 'const f = (() => 1)' },
  )), undefined)
})

for (const [before, after] of [
  ['function f(){ return 1 }', 'function f(){ return 1; };'],
  ['function f(){ return (value) }', 'function f(){ return (/* note */ value) }'],
]) test(`formatting-only changes remain silent: ${after}`, async () => {
  assert.equal(await compareSnapshots(request({ 'a.ts': before }, { 'a.ts': after })), undefined)
})

test('a wrapped named function keeps its recursive binding', async () => {
  const result = await analyzeSource('a.ts', 'const f = (function(n) { if (n) return f(n - 1) })')
  const f = result.scopes.find(scope => scope.name === 'f')
  assert.deepEqual(f.metrics, { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 })
  assert.equal(f.recursion.direct, true)
})

test('moving an unchanged function into deeper control changes its cognitive score', async () => {
  const report = await compareSnapshots(request(
    { 'a.ts': 'function outer(flag) { if (flag) work(); function inner() { if (flag) work() }; inner() }' },
    { 'a.ts': 'function outer(flag) { if (flag) { function inner() { if (flag) work() }; inner() } }' },
  ))
  const file = report.files[0]
  const change = file.changes.find(change => file.after.analysis.scopes[change.after_index]?.name === 'inner')
  assert.equal(change.change, 'modified')
  assert.equal(file.before.analysis.scopes[change.before_index].code_hash, file.after.analysis.scopes[change.after_index].code_hash)
  assert.deepEqual(change.delta, { cyclomatic: 0, cognitive: 1, max_nesting_depth: 0 })
})
