import assert from 'node:assert/strict'
import test from 'node:test'
import { compareSnapshots } from '../lib/compare.js'
import { ReportSchema } from '../lib/report.js'
import { request } from './helpers.mjs'

const original = await compareSnapshots(request(
  { 'a.ts': 'class Box { value() { return 1 } } function outer(n) { function inner(n) { if (n) return inner(n - 1); return 0 } return inner(n) } function removed() {}' },
  { 'a.ts': 'class Box { value() { return 2 } } function outer(n) { function inner(n) { if (n) return inner(n - 1); return 0 } return inner(n + 1) } function added() {}' },
))
const scopes = file => file.after.analysis.scopes
const functionIndex = file => scopes(file).findIndex(scope => scope.name === 'inner')
const pairedFunction = file => file.changes.find(change => change.after_index === functionIndex(file))

test('serialized reports preserve measurements, matching and recursion references', () => {
  const restored = ReportSchema.parse(JSON.parse(JSON.stringify(original)))
  assert.deepEqual(restored, original)
})

for (const [name, before, after] of [
  ['failed baseline', { 'a.ts': 'function (' }, { 'a.ts': 'function f() {}' }],
  ['failed update', { 'a.ts': 'function f() {}' }, { 'a.ts': 'function (' }],
  ['both sides failed', { 'a.ts': 'function (' }, { 'a.ts': 'function broken(' }],
  ['new file failed', {}, { 'a.ts': 'function (' }],
  ['file read failed', { 'a.ts': { status: 'skipped', reason: 'read_error' } }, { 'a.ts': 'function f() {}' }],
]) test(`${name} survives report serialization`, async () => {
  const report = await compareSnapshots(request(before, after))
  assert.deepEqual(ReportSchema.parse(JSON.parse(JSON.stringify(report))), report)
})

for (const [name, corrupt] of [
  ['successful analysis without scopes', file => { file.after.analysis.scopes = [] }],
  ['a function in place of the file node', file => { scopes(file)[0] = structuredClone(scopes(file)[functionIndex(file)]) }],
  ['file metrics missing', file => { delete scopes(file)[0].metrics }],
  ['file metrics null', file => { scopes(file)[0].metrics = null }],
  ['an anonymous function in aggregated output', file => { delete scopes(file)[functionIndex(file)].name }],
  ['function metrics null', file => { scopes(file)[functionIndex(file)].metrics = null }],
  ['scores assigned to a container', file => { scopes(file).find(scope => scope.kind === 'class').metrics = { cyclomatic: 0, cognitive: 0, max_nesting_depth: 0 } }],
  ['a scope referring to itself as parent', file => { scopes(file)[functionIndex(file)].parent = functionIndex(file) }],
  ['a scope referring to Top Level as parent', file => { scopes(file)[functionIndex(file)].parent = 1 }],
  ['Top Level belonging to a class', file => {
    const container = scopes(file).findIndex(scope => scope.kind === 'class')
    scopes(file).find(scope => scope.kind === 'top_level' && scope.parent > container).parent = container
  }],
  ['a recursion member outside the file', file => { scopes(file)[functionIndex(file)].recursion.cycle_members.push(scopes(file).length) }],
  ['a recursion member referring to a container', file => { scopes(file)[functionIndex(file)].recursion.cycle_members.push(scopes(file).findIndex(scope => scope.kind === 'class')) }],
  ['an addition without its updated index', file => { delete file.changes.find(change => change.change === 'added').after_index }],
  ['a removal without its original index', file => { delete file.changes.find(change => change.change === 'removed').before_index }],
  ['a matched function without its original index', file => { delete pairedFunction(file).before_index }],
  ['an updated index outside the file', file => { pairedFunction(file).after_index = scopes(file).length }],
  ['a baseline index outside the file', file => { pairedFunction(file).before_index = file.before.analysis.scopes.length }],
  ['a comparison referring to failed measurements', file => { file.before = { status: 'unavailable', reason: 'read_error' } }],
  ['a change referring to itself as parent', file => { const change = pairedFunction(file); change.parent = file.changes.indexOf(change) }],
  ['a change attached to the wrong enclosing scope', file => { pairedFunction(file).parent = 0 }],
  ['comparable function scores without a delta', file => { delete pairedFunction(file).delta }],
]) test(`rejects ${name}`, () => {
  const invalid = structuredClone(original)
  corrupt(invalid.files[0])
  assert.equal(ReportSchema.safeParse(invalid).success, false)
})
