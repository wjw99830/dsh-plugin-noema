import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSource } from '../lib/analyzer/index.js'

async function analyzed(path, source) {
  const result = await analyzeSource(path, source)
  assert.equal(result?.status, 'ok')
  return result.scopes
}

const direct = [
  ['direct.ts', 'function f(n){if(n) return f(n-1); return f(0)}'],
  ['direct.tsx', 'const f = (n:number) => n ? f(n-1) : <div/>'],
  ['direct.py', 'def f(n):\n    if n: return f(n-1)\n    return f(0)\n'],
  ['direct.go', 'package p; func f(n int) int {if n>0 {return f(n-1)}; return f(0)}'],
  ['named.ts', 'const alias = function f(n){if(n) return f(n-1); return 0}'],
]
for (const [path, source] of direct) test(`recursion ${path}: repeated self calls add one cognitive point`, async () => {
  const scopes = await analyzed(path, source)
  const index = scopes.findIndex(s => s.kind === 'function')
  assert.deepEqual(scopes[index].recursion, { direct: true, cycle_members: [index] })
  assert.deepEqual(scopes[index].metrics, { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 })
})

for (const [path, source] of [
  ['mutual.ts', 'function a(){b()} function b(){c()} function c(){a();c()} function caller(){a()}'],
  ['mutual.py', 'def a(): b()\ndef b(): c()\ndef c(): a(); c()\ndef caller(): a()\n'],
  ['mutual.go', 'package p; func a(){b()}; func b(){c()}; func c(){a();c()}; func caller(){a()}'],
]) test(`recursion ${path}: marks every cycle member and excludes an outside caller`, async () => {
  const scopes = await analyzed(path, source)
  const indexes = scopes.flatMap((s,i) => ['a','b','c'].includes(s.name) ? [i] : [])
  assert.deepEqual(indexes.map(index => scopes[index].name), ['a', 'b', 'c'])
  for (const i of indexes) {
    assert.deepEqual(scopes[i].recursion, { direct: scopes[i].name === 'c', cycle_members: indexes })
    assert.deepEqual(scopes[i].metrics, { cyclomatic:1, cognitive:1, max_nesting_depth:0 })
  }
  assert.equal(scopes.find(s => s.name === 'caller').recursion, undefined)
})

const shadowed = [
  ['parameter.ts', 'function f(f:()=>void){ f() }'],
  ['parameter.py', 'def f(f): f()\n'],
  ['parameter.go', 'package p; func f(f func()){f()}'],
  ['local.ts', 'function f(){const f=other; f()}'],
  ['local.py', 'def f():\n    f=other\n    f()\n'],
  ['local.go', 'package p; func f(){ f:=other; f() }'],
  ['destructure.ts', 'function f({f}){ f() }'],
  ['destructure-local.ts', 'function f(){const {x:f}=obj; f()}'],
  ['catch.ts', 'function f(){try{work()}catch(f){f()}}'],
  ['catch.py', 'def f():\n    try: work()\n    except Error as f: f()\n'],
  ['loop.ts', 'function f(){for(const f of xs){f()}}'],
  ['loop.py', 'def f():\n    for f in xs: f()\n'],
  ['loop.go', 'package p; func f(){for f:=range xs {f()}}'],
  ['with.py', 'def f():\n    with obj as f: f()\n'],
  ['match.py', 'def f(x):\n    match x:\n        case {"x": f}: f()\n'],
  ['match-class.py', 'def f(x):\n    match x:\n        case Obj(value=f): f()\n'],
  ['comprehension.py', 'def f(xs):\n    return [f() for f in xs]\n'],
  ['reassign.ts', 'function f(){f()} f=other'],
  ['reassign.py', 'def f(): f()\nf=other\n'],
  ['global.py', 'def f():\n    global f\n    f=other\n    f()\n'],
  ['import.py', 'def f():\n    from other import f\n    f()\n'],
  ['member.ts', 'function f(obj){obj.f()}'],
  ['member.py', 'def f(obj): obj.f()\n'],
  ['member.go', 'package p; func f(){obj.f()}'],
  ['type.go', 'package p; func f(){type f func(); f(nil)}'],
  ['type-switch.go', 'package p; func f(x any){switch f:=x.(type){case func(): f()}}'],
  ['select.go', 'package p; func f(){select{case f:=<-ch: f()}}'],
  ['decorator.py', '@replace\ndef f(): f()\n'],
  ['alias.ts', 'function f(){const alias=f;alias()}'],
  ['walrus.py', 'def f(xs):\n    [(f:=other) for x in xs]\n    f()\n'],
  ['global-write.py', 'def f(): f()\ndef replace():\n    global f\n    f=other\n'],
  ['default.py', 'def f(x=f()): pass\n'],
]
for (const [path, source] of shadowed) test(`recursion ${path}: leaves shadowed or unresolved calls unmarked`, async () => {
  const scopes = await analyzed(path, source)
  assert.ok(scopes.some(scope => scope.kind === 'function' && scope.name === 'f'))
  assert.ok(scopes.every(s => s.kind !== 'function' || s.recursion === undefined), JSON.stringify(scopes))
})

test('recursion block shadows do not hide an outer binding in sibling code', async () => {
  for (const [path,source] of [
    ['block.ts', 'function f(){ {const f=other;f()} f() }'],
    ['block.go', 'package p; func f(){ {f:=other;f()}; f() }'],
  ]) {
    const scopes = await analyzed(path,source)
    assert.equal(scopes.find(s=>s.name==='f').recursion.direct,true)
  }
})

test('recursion lexical parents retain a tree independently of call cycles', async () => {
  const scopes = await analyzed('tree.ts', 'function outer(){function inner(){outer()} return inner()} function other(){function inner(){inner()} return inner()}')
  const [outer, inner, other, secondInner] = scopes.filter(s=>s.kind==='function')
  assert.equal(scopes[inner.parent], outer)
  assert.equal(scopes[secondInner.parent], other)
  const cycle = [scopes.indexOf(outer),scopes.indexOf(inner)]
  assert.deepEqual(outer.recursion, {direct:false,cycle_members:cycle})
  assert.deepEqual(inner.recursion, {direct:false,cycle_members:cycle})
  assert.equal(other.recursion,undefined)
  assert.deepEqual(secondInner.recursion,{direct:true,cycle_members:[scopes.indexOf(secondInner)]})
  assert.equal(outer.metrics.cognitive,2)
  assert.equal(other.metrics.cognitive,1)
})

test('recursion named function expression resolves its own name after the outer variable changes', async () => {
  const scopes=await analyzed('named.ts','let alias=function internal(){internal()};alias=other')
  assert.equal(scopes.find(s=>s.name==='internal').recursion.direct,true)
})

test('recursion removing the cycle changes cognitive complexity without changing branches', async () => {
  for (const [path,before,after] of [
    ['delta.ts','function f(n){if(n) return f(n-1);return 0}','function f(n){if(n) return other(n-1);return 0}'],
    ['delta.py','def f(n):\n    if n: return f(n-1)\n    return 0\n','def f(n):\n    if n: return other(n-1)\n    return 0\n'],
    ['delta.go','package p; func f(n int) int {if n>0{return f(n-1)};return 0}','package p; func f(n int) int {if n>0{return other(n-1)};return 0}'],
  ]) {
    const a=(await analyzed(path,before)).find(s=>s.kind==='function')
    const b=(await analyzed(path,after)).find(s=>s.kind==='function')
    assert.equal(b.metrics.cognitive-a.metrics.cognitive,-1)
    assert.equal(b.metrics.cyclomatic,a.metrics.cyclomatic)
    assert.equal(b.metrics.max_nesting_depth,a.metrics.max_nesting_depth)
    assert.equal(b.recursion,undefined)
  }
})

test('recursion a long acyclic call chain does not mark callers or overflow traversal', async () => {
  const source=Array.from({length:1500},(_,i)=>`function f${i}(){${i<1499?`f${i+1}()` : ''}}`).join('\n')
  const scopes=await analyzed('chain.ts',source)
  assert.equal(scopes.filter(scope => scope.kind === 'function').length,1500)
  assert.ok(scopes.every(s=>s.kind!=='function'||s.recursion===undefined))
})
