import { CC_MULTIWAY, TS_BINDING, TS_ASSIGNMENT, TS_TYPES, NOEMA_MAPPING } from './references.mjs'
import { COG_SHORTHAND, MAX_NESTING, CC_BINARY, CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES, COG_EXITS, COG_CATCH, COG_RECURSION, TS_VAR } from './references.mjs'

export default [
  {
    name: 'straight-line function',
    source: `function f(value: number) { const doubled = value * 2; return doubled }`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One path and no control-flow increments',
  },
  {
    name: 'if with an else',
    source: `function f(flag: boolean) { if (flag) return 1; else return 2 }`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One binary decision; cognitive contributions from if and else',
  },
  {
    name: 'else-if chain',
    source: `function f(a: boolean, b: boolean) {
  if (a) return 1
  else /* explanation */ if (b) return 2
  else return 3
}`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; if, else-if, and else contribute one cognitive point each',
  },
  {
    name: 'three nested conditions',
    source: `function f(a: boolean, b: boolean, c: boolean) {
  if (a) { if (b) { if (c) return 1 } }
  return 0
}`,
    expected: { f: { cyclomatic: 4, cognitive: 6, max_nesting_depth: 3 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Cyclomatic 1 + 3; cognitive 1 + 2 + 3',
  },
  {
    name: 'three guard clauses',
    source: `function f(a: boolean, b: boolean, c: boolean) {
  if (!a) return 0
  if (!b) return 0
  if (!c) return 0
  return 1
}`,
    expected: { f: { cyclomatic: 4, cognitive: 3, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES, COG_EXITS],
    explanation: 'Three decisions at the same depth; early returns add no cognitive points',
  },
  {
    name: 'loop condition',
    source: `function f(n: number) { while (n > 0) { n-- } return n }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One loop decision at depth zero',
  },
  {
    name: 'do-while condition',
    source: `function f(n: number) { do { n-- } while (n > 0); return n }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'The condition creates one decision even though the body executes first',
  },
  {
    name: 'condition inside a for-of loop',
    source: `function f(values: number[]) {
  for (const value of values) { if (value > 0) return value }
  return 0
}`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; loop contributes 1 and nested if contributes 2',
  },
  {
    name: 'condition inside nested loops',
    source: `function f(values) { for (const value of values) { while (value) { if (value) break } } }`,
    expected: { f: { cyclomatic: 4, cognitive: 6, max_nesting_depth: 3 } },
    basis: [CC_BINARY, COG_RULES, COG_EXITS, MAX_NESTING],
    explanation: 'Two loops and one if above the function base; cognitive contributions 1 + 2 + 3',
  },
  {
    name: 'same-operator short-circuit chain',
    source: `function f(a: boolean, b: boolean, c: boolean) { return a && b && c }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Two short-circuit decisions form one logical sequence',
  },
  {
    name: 'parentheses preserve a same-operator chain',
    source: `function f(a: boolean, b: boolean, c: boolean) { return a && (b && c) }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Grouping preserves the two decisions and one logical sequence',
  },
  {
    name: 'negation separates logical sequences',
    source: `function f(a: boolean, b: boolean, c: boolean) { return a && !(b && c) }`,
    expected: { f: { cyclomatic: 3, cognitive: 2, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Two decisions; the negated subexpression starts a separate sequence',
  },
  {
    name: 'conditional expression',
    source: `function f(flag: boolean) { return flag ? 1 : 2 }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One decision and one cognitive increment for the conditional expression',
  },
  {
    name: 'conditional expression inside an alternative',
    source: `function f(a: boolean, b: boolean) { return a ? 1 : (b ? 2 : 3) }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; cognitive contributions 1 and 2',
  },
  {
    name: 'try and finally',
    source: `declare function work(): void
declare function finish(): void
function f() { try { work() } finally { finish() } }`,
    expected: { f: { cognitive: 0, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, COG_CATCH],
    explanation: 'Neither try nor finally contributes to cognitive complexity',
  },
  {
    name: 'condition inside catch',
    source: `declare function work(): void
function f(flag: boolean) { try { work() } catch { if (flag) return 1 } finally { work() }; return 0 }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [NOEMA_MAPPING, MAX_NESTING, COG_CATCH, COG_RULES],
    explanation: 'Catch and if each add a decision; cognitive catch 1 and nested if 2, with no contribution from finally',
  },
  {
    name: 'unlabelled break',
    source: `function f(n: number, stop: boolean) { while (n > 0) { if (stop) break; n-- } }`,
    expected: { f: { cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, COG_RULES, COG_EXITS],
    explanation: 'Loop 1 and nested if 2; unlabelled break adds no point',
  },
  {
    name: 'labelled break',
    source: `function f(n: number, stop: boolean) { outer: while (n > 0) { if (stop) break outer; n-- } }`,
    expected: { f: { cognitive: 4, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, COG_RULES, COG_EXITS],
    explanation: 'Loop 1, nested if 2, labelled break 1',
  },
  {
    name: 'self-recursion counted once',
    source: `function f(n: number): number { if (n <= 0) return 0; return f(n - 1) + f(n - 2) }`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RECURSION],
    explanation: 'One decision and one recursion increment despite two self calls',
  },
  {
    name: 'function-scoped var shadows a recursive-looking call',
    source: `function f(callbacks: Array<() => void>) {
  for (var f of callbacks) {}
  f()
}`,
    expected: { f: { cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, COG_RULES, COG_RECURSION, TS_VAR],
    explanation: 'The call targets the local variable; only the loop contributes a point',
  },
  {
    name: "logical disjunction",
    source: `function f(a: boolean, b: boolean) { return a || b }`,
    expected: {"f": {"cyclomatic": 2, "cognitive": 1, "max_nesting_depth": 0}},
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: "One short-circuit decision and one logical sequence",
  },
  {
    name: "mixed logical sequences",
    source: `function f(a: boolean, b: boolean, c: boolean, d: boolean) { return a && (b || c) && d }`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 3, "max_nesting_depth": 0}},
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: "Three short-circuit decisions and the three sequences AND, OR, AND",
  },
  {
    name: "logical sequence inside nested control",
    source: `function f(a: boolean, b: boolean, c: boolean) { if (a) { if (b && c) return 1 }; return 0 }`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 4}},
    basis: [CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES],
    explanation: "Two if decisions plus one short circuit; cognitive 1 + 2 + 1, with no nesting penalty on the logical sequence",
  },
  {
    name: "switch with several alternatives",
    source: `function f(value: number) { switch (value) { case 1: return 10; case 2: return 20; default: return 0 } }`,
    expected: {"f": {"cognitive": 1, "max_nesting_depth": 1}},
    basis: [COG_RULES, MAX_NESTING],
    explanation: "The whole switch contributes one cognitive point",
  },
  {
    name: "condition inside a switch alternative",
    source: `function f(value: number, flag: boolean) { switch (value) { case 1: if (flag) return 10; break; case 2: return 20; default: break } }`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 3, "max_nesting_depth": 2}},
    basis: [CC_MULTIWAY, CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: "Two switch decisions and one if above the function base; cognitive switch 1 and nested if 2",
  },
  {
    name: "nullish shorthand",
    source: `function f(value: { count?: number } | null) { return value?.count ?? 0 }`,
    expected: {"f": {"cognitive": 0, "max_nesting_depth": 0}},
    basis: [COG_SHORTHAND, MAX_NESTING],
    explanation: "Null-safe access and null coalescing add no cognitive point",
  },
  {
    name: "mutual recursion and an outside caller",
    source: `function f(n: number): number { return g(n) }
function g(n: number): number { return f(n) }
function caller(n: number): number { return f(n) }`,
    expected: {"f": {"cyclomatic": 1, "cognitive": 1}, "g": {"cyclomatic": 1, "cognitive": 1}, "caller": {"cyclomatic": 1, "cognitive": 0}},
    basis: [CC_BINARY, COG_RECURSION],
    explanation: "Only the two functions in the cycle receive a recursion point",
  },
  {
    name: "inner function control depth starts at zero",
    source: `function f(a: boolean, b: boolean) {
  if (a) {
    function inner() { if (a) { while (b) { b = false } } }
    inner()
  }
}`,
    expected: {"f": {"max_nesting_depth": 2}, "inner": {"max_nesting_depth": 2}},
    basis: [MAX_NESTING],
    explanation: "Inner starts at control depth zero; the enclosing function displays the maximum depth including inner",
  },
  {
    name: "comments and layout preserve measurements",
    source: `function f(
  flag: boolean, // input
) {
  /* decision */ if (flag) {
    return 1;
  }
  return 0;
}`,
    expected: {"f": {"cyclomatic": 2, "cognitive": 1, "max_nesting_depth": 1}},
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: "Comments, layout, and optional punctuation leave one if decision",
  },

  {
    name: 'case labels sharing a body form one outcome',
    source: `function f(x) { switch (x) { case 1: /* alias */ case 2: return 1; case 3: return 2 } }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, MAX_NESTING],
    explanation: 'Two case bodies and the implicit default make three outcomes',
  },
  {
    name: 'default sharing a case body supplies no extra outcome',
    source: `function f(x) { switch (x) { case 1: return 1; default: case 2: return 2 } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, MAX_NESTING],
    explanation: 'There are two destination bodies, including the default',
  },
  {
    name: 'fallthrough after an executed statement keeps distinct outcomes',
    source: `function f(x) { switch (x) { case 1: work(); case 2: return 2; default: return 0 } }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, MAX_NESTING],
    explanation: 'Entering the first case executes work before falling through; three entry paths remain',
  },
  {
    name: 'trailing empty labels share the implicit exit',
    source: `function f(x) { switch (x) { case 1: work(); break; case 2: case 3: } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, MAX_NESTING],
    explanation: 'One case body and the shared exit make two outcomes',
  },
  {
    name: 'an empty switch has no decision outcome beyond its exit',
    source: `function f(x) { switch (x) {} }`,
    expected: { f: { cyclomatic: 1, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, MAX_NESTING],
    explanation: 'One control-flow path; the written switch is still a cognitive structure',
  },
  {
    name: 'default parameter adds an undefined-value decision',
    source: `function f(value = 1) { return value }`,
    expected: { f: { cyclomatic: 2, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, TS_BINDING, COG_SHORTHAND, MAX_NESTING],
    explanation: 'The initializer executes only for undefined; the shorthand adds no cognitive nesting',
  },
  {
    name: 'parameter and destructuring defaults each contribute a decision',
    source: `function f({value = 1} = {}, [other = 2] = []) { return value + other }`,
    expected: { f: { cyclomatic: 5, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, TS_BINDING, COG_SHORTHAND, MAX_NESTING],
    explanation: 'Two parameter defaults and two nested binding defaults, plus the function base',
  },
  {
    name: 'local destructuring defaults contribute their own decisions',
    source: `function f(input) { const {value = 1} = input; const [other = 2] = input; return value + other }`,
    expected: { f: { cyclomatic: 3, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, TS_BINDING, COG_SHORTHAND, MAX_NESTING],
    explanation: 'Two conditional initializers and one function base',
  },
  {
    name: 'control expressions inside a default retain their contribution',
    source: `function f(value = ready ? 1 : 2) { return value }`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_BINARY, TS_BINDING, COG_RULES, MAX_NESTING],
    explanation: 'Default selection and ternary selection each add a decision; only the ternary adds cognitive depth',
  },
  {
    name: 'logical assignments preserve short-circuit decisions',
    source: `function f(x, y) { x &&= y; x ||= y; x ??= y; return x }`,
    expected: { f: { cyclomatic: 4, cognitive: 2, max_nesting_depth: 0 } },
    basis: [CC_SHORT_CIRCUIT, TS_ASSIGNMENT, COG_SEQUENCES, COG_SHORTHAND, MAX_NESTING],
    explanation: 'Three short-circuit assignments; AND and OR add cognitive points, null coalescing does not',
  },
  {
    name: 'optional property, element access and call each add a null-check decision',
    source: `function f(value, index) { return value?.methods?.[index]?.() ?? 0 }`,
    expected: { f: { cyclomatic: 5, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_SHORT_CIRCUIT, COG_SHORTHAND, MAX_NESTING],
    explanation: 'Three optional checks and one null-coalescing check, plus the function base',
  },
  {
    name: 'type-level conditions and assertions add no executable branches',
    source: `function f<T>(value: T) { type Choice<U> = U extends string ? 1 : 2; return value! as Choice<T> }`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, TS_TYPES, COG_RULES, MAX_NESTING],
    explanation: 'Conditional types and type assertions have no runtime control flow',
  },
  {
    name: 'bitwise operators are not logical short circuits',
    source: `function f(a, b, c) { return (a & b) | c }`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: 'Both operands are evaluated; no decision or logical sequence is introduced',
  },

  {
    name: 'conditional expression nested in the condition receives nesting',
    source: `function f(a, b, c) { return (a ? b : c) ? 1 : 2 }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: 'Both ternaries contribute a decision; the nested condition adds cognitive 2 beneath the outer ternary 1',
  },

  {
    name: 'for loop without a condition',
    source: `function f() { for (;;) { work() } }`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: ['docs/scoring.md#decisions', COG_RULES, MAX_NESTING],
    explanation: 'Noema counts each loop once even when its condition is omitted',
  },
  {
    name: 'conditional exit from a for loop without a condition',
    source: `function f(stop: boolean) { for (;;) { if (stop) break; work() } }`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: ['docs/scoring.md#decisions', CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: 'The loop and its internal decision each contribute one cyclomatic point; cognitive 1 + 2',
  },
]
