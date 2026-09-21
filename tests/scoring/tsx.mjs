import { TS_BINDING } from './references.mjs'
import { CC_BINARY, CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES, MAX_NESTING } from './references.mjs'

export default [
  {
    name: 'conditional expression inside JSX',
    source: `function f(ready: boolean) { return <span>{ready ? 1 : 2}</span> }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: 'JSX adds no decision; the conditional expression contributes one',
  },
  {
    name: 'short-circuit expression returning JSX',
    source: `function f(ready: boolean) { return ready && <span/> }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 0 } },
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: 'One short-circuit decision and one logical sequence',
  },

  {
    name: 'JSX preserves default initialization and nested conditional rules',
    source: `const f = (value = 1, a, b, c) => <span>{(a ? b : c) ? value : 0}</span>`,
    expected: { f: { cyclomatic: 4, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_BINARY, TS_BINDING, COG_RULES, MAX_NESTING],
    explanation: 'One default and two ternary decisions; JSX adds nothing to the two levels of conditional nesting',
  },
]
