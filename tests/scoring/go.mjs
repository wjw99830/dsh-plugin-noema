import { GO_SELECT, NOEMA_MAPPING } from './references.mjs'
import { CC_MULTIWAY, GO_SWITCH } from './references.mjs'
import { MAX_NESTING, CC_BINARY, CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES, COG_EXITS, COG_RECURSION, GO_INSTANTIATION } from './references.mjs'

export default [
  {
    name: 'straight-line function',
    source: `package sample
func f(value int) int { doubled := value * 2; return doubled }`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One path and no control-flow increments',
  },
  {
    name: 'if with an else',
    source: `package sample
func f(flag bool) int { if flag { return 1 } else { return 2 } }`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One binary decision; cognitive contributions from if and else',
  },
  {
    name: 'else-if chain',
    source: `package sample
func f(a, b bool) int { if a { return 1 } else if b { return 2 } else { return 3 } }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; if, else-if, and else contribute one cognitive point each',
  },
  {
    name: 'three nested conditions',
    source: `package sample
func f(a, b, c bool) int { if a { if b { if c { return 1 } } }; return 0 }`,
    expected: { f: { cyclomatic: 4, cognitive: 6, max_nesting_depth: 3 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Cyclomatic 1 + 3; cognitive 1 + 2 + 3',
  },
  {
    name: 'three guard clauses',
    source: `package sample
func f(a, b, c bool) int {
  if !a { return 0 }
  if !b { return 0 }
  if !c { return 0 }
  return 1
}`,
    expected: { f: { cyclomatic: 4, cognitive: 3, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES, COG_EXITS],
    explanation: 'Three decisions at the same depth; early returns add no cognitive points',
  },
  {
    name: 'condition-only for loop',
    source: `package sample
func f(n int) int { for n > 0 { n-- }; return n }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One loop decision at depth zero',
  },
  {
    name: 'condition inside a range loop',
    source: `package sample
func f(values []int) int {
  for _, value := range values { if value > 0 { return value } }
  return 0
}`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; loop contributes 1 and nested if contributes 2',
  },
  {
    name: 'same-operator short-circuit chain',
    source: `package sample
func f(a, b, c bool) bool { return a && b && c }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Two short-circuit decisions form one logical sequence',
  },
  {
    name: 'negation separates logical sequences',
    source: `package sample
func f(a, b, c bool) bool { return a && !(b && c) }`,
    expected: { f: { cyclomatic: 3, cognitive: 2, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Two decisions; the negated subexpression starts a separate sequence',
  },
  {
    name: 'unlabelled break',
    source: `package sample
func f(n int, stop bool) { for n > 0 { if stop { break }; n-- } }`,
    expected: { f: { cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, COG_RULES, COG_EXITS],
    explanation: 'Loop 1 and nested if 2; unlabelled break adds no point',
  },
  {
    name: 'labelled break',
    source: `package sample
func f(n int, stop bool) { outer: for n > 0 { if stop { break outer }; n-- } }`,
    expected: { f: { cognitive: 4, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, COG_RULES, COG_EXITS],
    explanation: 'Loop 1, nested if 2, labelled break 1',
  },
  {
    name: 'labelled exit from a for loop without a condition',
    source: `package sample
func f(ready bool) { outer: for { if ready { break outer } } }`,
    expected: { f: { cyclomatic: 3, cognitive: 4, max_nesting_depth: 2 } },
    basis: ['docs/scoring.md#decisions', CC_BINARY, COG_RULES, COG_EXITS, MAX_NESTING],
    explanation: 'Loop and if above the function base; cognitive loop 1, nested if 2, labelled break 1',
  },
  {
    name: 'self-recursion counted once',
    source: `package sample
func f(n int) int { if n <= 0 { return 0 }; return f(n - 1) + f(n - 2) }`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RECURSION],
    explanation: 'One decision and one recursion increment despite two self calls',
  },
  {
    name: 'generic self-recursion',
    source: `package sample
func f[T ~int](n T) T { if n <= 0 { return 0 }; return f[T](n - 1) }`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RECURSION, GO_INSTANTIATION],
    explanation: 'Type instantiation preserves the self-call; one decision and one recursion increment',
  },
  {
    name: "logical disjunction",
    source: `package sample
func f(a, b bool) bool { return a || b }`,
    expected: {"f": {"cyclomatic": 2, "cognitive": 1, "max_nesting_depth": 0}},
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: "One short-circuit decision and one logical sequence",
  },
  {
    name: "mixed logical sequences",
    source: `package sample
func f(a, b, c, d bool) bool { return a && (b || c) && d }`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 3, "max_nesting_depth": 0}},
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: "Three short-circuit decisions and the three sequences AND, OR, AND",
  },
  {
    name: "logical sequence inside nested control",
    source: `package sample
func f(a, b, c bool) int { if a { if b && c { return 1 } }; return 0 }`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 4}},
    basis: [CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES],
    explanation: "Two if decisions plus one short circuit; cognitive 1 + 2 + 1, with no nesting penalty on the logical sequence",
  },
  {
    name: "switch with several alternatives",
    source: `package sample
func f(value int) int { switch value { case 1: return 10; case 2: return 20; default: return 0 } }`,
    expected: {"f": {"cognitive": 1, "max_nesting_depth": 1}},
    basis: [COG_RULES, MAX_NESTING],
    explanation: "The whole switch contributes one cognitive point",
  },
  {
    name: "condition inside a switch alternative",
    source: `package sample
func f(value int, flag bool) int { switch value { case 1, 2: if flag { return 10 }; case 3: return 20; default: return 0 }; return 0 }`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 3, "max_nesting_depth": 2}},
    basis: [CC_MULTIWAY, CC_BINARY, GO_SWITCH, COG_RULES, MAX_NESTING],
    explanation: "Two switch decisions and one if above the function base; cognitive switch 1 and nested if 2",
  },
  {
    name: "mutual recursion and an outside caller",
    source: `package sample
func f(n int) int { return g(n) }
func g(n int) int { return f(n) }
func caller(n int) int { return f(n) }`,
    expected: {"f": {"cyclomatic": 1, "cognitive": 1}, "g": {"cyclomatic": 1, "cognitive": 1}, "caller": {"cyclomatic": 1, "cognitive": 0}},
    basis: [CC_BINARY, COG_RECURSION],
    explanation: "Only the two functions in the cycle receive a recursion point",
  },
  {
    name: "inner function control depth starts at zero",
    source: `package sample
func f(a, b bool) {
  if a {
    inner := func() { if a { for b { b = false } } }
    inner()
  }
}`,
    expected: {"f": {"max_nesting_depth": 2}, "inner": {"max_nesting_depth": 2}},
    basis: [MAX_NESTING],
    explanation: "Inner starts at control depth zero; the enclosing function displays the maximum depth including inner",
  },
  {
    name: "comments and layout preserve measurements",
    source: `package sample
// Function documentation
func f(flag bool) int {
  // decision
  if flag {
    return 1
  }
  return 0
}
`,
    expected: {"f": {"cyclomatic": 2, "cognitive": 1, "max_nesting_depth": 1}},
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: "Comments and layout leave one if decision",
  },

  {
    name: 'several case values select one body',
    source: `package sample
func f(x int) { switch x { case 1, 2: work(); case 3: finish() } }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, GO_SWITCH, COG_RULES, MAX_NESTING],
    explanation: 'Two case bodies and an implicit default, independent of the number of values in a case',
  },
  {
    name: 'an explicit default replaces the implicit default',
    source: `package sample
func f(x int) { switch x { case 1: work(); default: finish() } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, GO_SWITCH, COG_RULES, MAX_NESTING],
    explanation: 'Two outcomes; writing the default does not add another decision',
  },
  {
    name: 'type switch counts case bodies rather than listed types',
    source: `package sample
func f(x any) { switch x.(type) { case int, string: work(); case bool: finish(); default: other() } }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, GO_SWITCH, COG_RULES, MAX_NESTING],
    explanation: 'Three outcomes and one cognitive switch structure',
  },
  {
    name: 'goto contributes cognitive complexity without another predicate',
    source: `package sample
func f() { goto done; done: return }`,
    expected: { f: { cyclomatic: 1, cognitive: 1, max_nesting_depth: 0 } },
    basis: [CC_BINARY, COG_EXITS, MAX_NESTING],
    explanation: 'An unconditional jump creates no decision; goto contributes one cognitive point',
  },
  {
    name: 'comma-ok type assertion does not branch by itself',
    source: `package sample
func f(x any) { value, ok := x.(int); use(value, ok) }`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: 'Returning a success flag creates no explicit control-flow decision',
  },
  {
    name: 'bitwise operators have no short-circuit contribution',
    source: `package sample
func f(a, b, c int) int { return (a & b) | c }`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: 'Bitwise operators evaluate both operands',
  },

  {
    name: 'one select communication without a default has one outcome',
    source: `package sample
func f(ch chan int) { select { case <-ch: work() } }`,
    expected: { f: { cyclomatic: 1, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, GO_SELECT, COG_RULES, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Waiting does not add a fallthrough outcome; Noema treats select as one cognitive switch',
  },
  {
    name: 'select without default counts only communication outcomes',
    source: `package sample
func f(a, b chan int) { select { case <-a: work(); case <-b: finish() } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, GO_SELECT, COG_RULES, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Two communication outcomes contribute one decision above the function base',
  },
  {
    name: 'select default adds an immediate outcome',
    source: `package sample
func f(a, b chan int) { select { case <-a: work(); case <-b: finish(); default: other() } }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, GO_SELECT, COG_RULES, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Two communication outcomes plus the default make three outcomes',
  },
  {
    name: 'control inside select receives cognitive nesting',
    source: `package sample
func f(ch chan int, ready bool) { select { case <-ch: if ready { work() }; default: finish() } }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_MULTIWAY, GO_SELECT, COG_RULES, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Select decision and inner if; cognitive select 1 and nested if 2',
  },
  {
    name: 'empty select blocks without selecting an outcome',
    source: `package sample
func f() { select {} }`,
    expected: { f: { cyclomatic: 1, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_BINARY, GO_SELECT, COG_RULES, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'No selected branch; the written select still counts as a cognitive structure',
  },

  {
    name: 'for loop without a condition',
    source: `package sample
func f() { for { work() } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: ['docs/scoring.md#decisions', COG_RULES, MAX_NESTING],
    explanation: 'Noema counts each loop once even when its condition is omitted',
  },
  {
    name: 'for clause with all three parts omitted',
    source: `package sample
func f() { for ;; { work() } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: ['docs/scoring.md#decisions', COG_RULES, MAX_NESTING],
    explanation: 'The empty three-part clause has the same score as for without a clause',
  },
  {
    name: 'conditional exit from a for loop without a condition',
    source: `package sample
func f(stop bool) { for { if stop { break }; work() } }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: ['docs/scoring.md#decisions', CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: 'The loop and its internal decision each contribute one cyclomatic point; cognitive 1 + 2',
  },
]
