import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { analyzeSource } from '../lib/analyzer/index.js'
import { SuccessfulAnalysisSchema } from '../lib/analyzer/types.js'

async function analyzed(path, source) {
  const result = await analyzeSource(path, source)
  assert.equal(result?.status, 'ok', JSON.stringify(result))
  const bytes = Buffer.from(source)
  for (const [i, scope] of result.scopes.entries()) {
    const r = scope.range
    assert.ok(r.start_byte >= 0 && r.end_byte >= r.start_byte && r.end_byte <= bytes.length)
    assert.equal(r.start_line, bytes.subarray(0, r.start_byte).toString().split('\n').length)
    assert.equal(r.end_line, bytes.subarray(0, Math.max(r.start_byte, r.end_byte - 1)).toString().split('\n').length)
    if (scope.parent !== undefined) {
      assert.ok(scope.parent < i)
      const parent = result.scopes[scope.parent]
      assert.ok(r.start_byte >= parent.range.start_byte && r.end_byte <= parent.range.end_byte)
    }
    for (const value of Object.values(scope.metrics ?? {})) assert.ok(Number.isSafeInteger(value) && value >= 0)
  }
  return result
}
const expected = {
  'functions.ts': [['plain',1,0,0],['branch',2,1,1],['nested',4,6,3],['arrow',2,1,1],['outer',4,3,1],['inner',2,2,1],['recurse',2,2,1],['read',2,1,1],['first',1,0,0],['second',2,1,1]],
  'component.tsx': [['View',2,1,1]],
  'functions.py': [['plain',1,0,0],['branch',2,1,1],['nested',4,6,3],['outer',4,2,1],['inner',2,1,1],['recurse',2,2,1],['read',2,1,1]],
  'functions.go': [['Plain',1,0,0],['Branch',2,1,1],['Nested',4,6,3],['Outer',4,3,1],['inner',2,2,1],['Recurse',2,2,1],['Shadow',1,0,0],['(*Reader).Read',2,1,1],['Choose',2,1,1]],
}
for (const [file, values] of Object.entries(expected)) test(`WASM ${file}: function totals and source ranges`, async () => {
  const source = await readFile(new URL(`./fixtures/analyzers/${file}`, import.meta.url), 'utf8')
  const result = await analyzed(file, source)
  const functions = result.scopes.filter(scope => scope.kind === 'function')
  assert.deepEqual(functions.map(s => [s.name,s.metrics.cyclomatic,s.metrics.cognitive,s.metrics.max_nesting_depth]), values)
  assert.equal(result.scopes[0].metrics.cyclomatic, { 'functions.ts': 20, 'component.tsx': 2, 'functions.py': 15, 'functions.go': 18 }[file])
  assert.deepEqual(await analyzeSource(file, source), result)
})

for (const [path, source, name] of [
  ['generics.ts', 'function id<const T>(x: T): T { return x }; const value = {a: 1} satisfies {a: number}', 'id'],
  ['generics.py', 'def identity[T](x: T) -> T:\n    return x\n', 'identity'],
]) test(`WASM ${path}: parses generic function syntax`, async () => {
  const result = await analyzed(path, source)
  assert.deepEqual(result.scopes.filter(scope => scope.kind === 'function').map(scope => scope.name), [name])
})

test('WASM containers and same-line functions keep lexical identities', async () => {
  const result = await analyzed('containers.ts', 'namespace N { export abstract class Base { abstract f():void; g(){} } } const a=()=>1,b=()=>2')
  const g = result.scopes.find(s=>s.name==='g')
  const base = result.scopes[g.parent]
  assert.equal(base.name,'Base')
  assert.equal(base.metrics,undefined)
  assert.equal(result.scopes[base.parent].name,'N')
  assert.deepEqual(result.scopes.filter(s=>s.kind==='function').map(s=>s.name),['g','a','b'])
})

for (const [path, source, fragment] of [
  ['utf.ts','// 中文 🧠\r\nfunction 你好(){return "🌲"}\r\n','function 你好(){return "🌲"}'],
  ['utf.py','# 中文 🧠\r\ndef 你好():\r\n    return "🌲"\r\n','def 你好():\r\n    return "🌲"'],
  ['utf.go','package p\r\n// 中文 🧠\r\n//line fake.go:900\r\nfunc 你好()string{return "🌲"}\r\n','func 你好()string{return "🌲"}'],
]) test(`WASM ${path}: byte ranges use UTF-8 and physical lines`, async () => {
  const result=await analyzed(path,source)
  const fn=result.scopes.find(s=>s.kind==='function')
  assert.equal(Buffer.from(source).subarray(fn.range.start_byte,fn.range.end_byte).toString(),fragment)
  assert.equal(fn.range.start_line,path.endsWith('.go')?4:2)
})

for (const [path, source] of [['bad.ts','function f( {'],['bad.tsx','const V=()=> <div>'],['bad.py','def f(:\n pass'],['bad.go','package p; func F( {']]) test(`WASM ${path}: parse errors produce no partial scores`,async()=>{
  const result=await analyzeSource(path,source)
  assert.equal(result.status,'not_analyzed')
  assert.equal(result.reason,'parse_error')
  assert.equal('scopes' in result,false)
})

test('WASM routing excludes JavaScript, declaration files and unrelated text',async()=>{
  for(const path of ['file.js','file.jsx','file.d.ts','file.d.mts','file.d.cts','file.rs','README.md','script','app.TS','dir.ts/file']) assert.equal(await analyzeSource(path,'invalid source'),undefined)
  for(const path of ['file.ts','file.mts','file.cts','file.tsx']) assert.equal((await analyzeSource(path,'const a=1')).status,'ok')
})

for (const [path, source] of [
  ['empty.ts', ''],
  ['empty.tsx', ''],
  ['white.py', '\n\n  \n'],
  ['empty.go', 'package p\n'],
]) test(`WASM ${path}: empty code retains a file node with zero metrics`, async () => {
  const result = await analyzed(path, source)
  const { status, ...analysis } = result
  assert.deepEqual(SuccessfulAnalysisSchema.parse(analysis), analysis)
  assert.equal(result.scopes.filter(scope => scope.kind === 'function').length, 0)
  assert.deepEqual(result.scopes[0].metrics, { cyclomatic: 0, cognitive: 0, max_nesting_depth: 0 })
})

test('WASM code outside functions retains its Top Level metrics', async () => {
  const result = await analyzed('top.py', 'if flag:\n    work()\n')
  assert.deepEqual(result.scopes.find(scope => scope.kind === 'top_level').metrics,
    { cyclomatic: 1, cognitive: 1, max_nesting_depth: 1 })
})

test('WASM concurrent calls and returned data remain independent', async () => {
  const reports=await Promise.all(Array.from({length:12},(_,i)=>analyzeSource(`file${i}.ts`,`function f${i}(){if(flag) return 1}`)))
  assert.deepEqual(reports.map(r=>r.scopes.find(scope=>scope.kind==='function').name),Array.from({length:12},(_,i)=>`f${i}`))
  const manifest = JSON.parse(await readFile(new URL('../lib/analyzer/grammars/manifest.json', import.meta.url), 'utf8'))
  assert.equal(reports[0].engine.runtime_version, manifest.runtime_version)
  assert.equal(reports[0].engine.grammar.version, manifest.languages.typescript.version)
})
