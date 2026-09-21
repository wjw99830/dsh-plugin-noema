import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSource } from '../lib/analyzer/index.js'
import typescript from './scoring/typescript.mjs'
import tsx from './scoring/tsx.mjs'
import python from './scoring/python.mjs'
import go from './scoring/go.mjs'

for (const [extension, cases] of [['ts', typescript], ['tsx', tsx], ['py', python], ['go', go]]) {
  for (const example of cases) {
    test(`scoring ${extension}: ${example.name}`, async () => {
      const context = `${example.explanation}\n${example.basis.join('\n')}\n${example.source}`
      const result = await analyzeSource(`example.${extension}`, example.source)
      assert.equal(result?.status, 'ok', context)
      for (const [name, expected] of Object.entries(example.expected)) {
        const functions = result.scopes.filter(scope => scope.kind === 'function' && scope.name === name)
        assert.equal(functions.length, 1, `Expected one function named ${name}\n${context}`)
        for (const [metric, value] of Object.entries(expected)) {
          assert.equal(functions[0].metrics[metric], value, `${name}.${metric}\n${context}`)
        }
      }
    })
  }
}
