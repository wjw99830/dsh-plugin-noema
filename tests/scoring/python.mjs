import { CC_MULTIWAY, PY_MATCH, PY_COMPREHENSION, NOEMA_MAPPING } from './references.mjs'
import { PY_ASSERT, PY_LOOPS, PY_DEFAULTS } from './references.mjs'
import { MAX_NESTING, CC_BINARY, CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES, COG_EXITS, COG_CATCH, COG_RECURSION } from './references.mjs'

export default [
  {
    name: 'straight-line function',
    source: `def f(value):
    doubled = value * 2
    return doubled
`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One path and no control-flow increments',
  },
  {
    name: 'if with an else',
    source: `def f(flag):
    if flag:
        return 1
    else:
        return 2
`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One binary decision; cognitive contributions from if and else',
  },
  {
    name: 'elif chain',
    source: `def f(a, b):
    if a:
        return 1
    elif b:
        return 2
    else:
        return 3
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; if, elif, and else contribute one cognitive point each',
  },
  {
    name: 'three nested conditions',
    source: `def f(a, b, c):
    if a:
        if b:
            if c:
                return 1
    return 0
`,
    expected: { f: { cyclomatic: 4, cognitive: 6, max_nesting_depth: 3 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Cyclomatic 1 + 3; cognitive 1 + 2 + 3',
  },
  {
    name: 'three guard clauses',
    source: `def f(a, b, c):
    if not a:
        return 0
    if not b:
        return 0
    if not c:
        return 0
    return 1
`,
    expected: { f: { cyclomatic: 4, cognitive: 3, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES, COG_EXITS],
    explanation: 'Three decisions at the same depth; early returns add no cognitive points',
  },
  {
    name: 'while condition',
    source: `def f(n):
    while n > 0:
        n -= 1
    return n
`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One loop decision at depth zero',
  },
  {
    name: 'condition inside a for loop',
    source: `def f(values):
    for value in values:
        if value > 0:
            return value
    return 0
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; loop contributes 1 and nested if contributes 2',
  },
  {
    name: 'same-operator short-circuit chain',
    source: `def f(a, b, c):
    return a and b and c
`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Two short-circuit decisions form one logical sequence',
  },
  {
    name: 'negation separates logical sequences',
    source: `def f(a, b, c):
    return a and not (b and c)
`,
    expected: { f: { cyclomatic: 3, cognitive: 2, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, CC_SHORT_CIRCUIT, COG_SEQUENCES],
    explanation: 'Two decisions; the negated subexpression starts a separate sequence',
  },
  {
    name: 'conditional expression',
    source: `def f(flag):
    return 1 if flag else 2
`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'One decision and one cognitive increment for the conditional expression',
  },
  {
    name: 'conditional expression inside an alternative',
    source: `def f(a, b):
    return 1 if a else (2 if b else 3)
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RULES],
    explanation: 'Two decisions; cognitive contributions 1 and 2',
  },
  {
    name: 'try and finally',
    source: `def f():
    try:
        work()
    finally:
        finish()
`,
    expected: { f: { cognitive: 0, max_nesting_depth: 0 } },
    basis: [MAX_NESTING, COG_CATCH],
    explanation: 'Neither try nor finally contributes to cognitive complexity',
  },
  {
    name: 'one handler for multiple exception types',
    source: `def f():
    try:
        work()
    except (ValueError, TypeError):
        return 0
`,
    expected: { f: { cognitive: 1, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, COG_CATCH],
    explanation: 'One handler contributes one point regardless of its number of exception types',
  },
  {
    name: 'separate exception handlers',
    source: `def f():
    try:
        work()
    except ValueError:
        return 0
    except TypeError:
        return 1
`,
    expected: { f: { cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, COG_CATCH],
    explanation: 'Each handler contributes one point',
  },
  {
    name: 'condition inside an exception handler',
    source: `def f(flag):
    try:
        work()
    except ValueError:
        if flag:
            return 1
    finally:
        work()
    return 0
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [NOEMA_MAPPING, MAX_NESTING, COG_CATCH, COG_RULES],
    explanation: 'Handler and if each add a decision; cognitive handler 1 and nested if 2, with no contribution from finally',
  },
  {
    name: 'unlabelled break',
    source: `def f(n, stop):
    while n > 0:
        if stop:
            break
        n -= 1
`,
    expected: { f: { cognitive: 3, max_nesting_depth: 2 } },
    basis: [MAX_NESTING, COG_RULES, COG_EXITS],
    explanation: 'Loop 1 and nested if 2; unlabelled break adds no point',
  },
  {
    name: 'self-recursion counted once',
    source: `def f(n):
    if n <= 0:
        return 0
    return f(n - 1) + f(n - 2)
`,
    expected: { f: { cyclomatic: 2, cognitive: 2, max_nesting_depth: 1 } },
    basis: [MAX_NESTING, CC_BINARY, COG_RECURSION],
    explanation: 'One decision and one recursion increment despite two self calls',
  },
  {
    name: "logical disjunction",
    source: `def f(a, b):
    return a or b
`,
    expected: {"f": {"cyclomatic": 2, "cognitive": 1, "max_nesting_depth": 0}},
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: "One short-circuit decision and one logical sequence",
  },
  {
    name: "mixed logical sequences",
    source: `def f(a, b, c, d):
    return a and (b or c) and d
`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 3, "max_nesting_depth": 0}},
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: "Three short-circuit decisions and the three sequences AND, OR, AND",
  },
  {
    name: "logical sequence inside nested control",
    source: `def f(a, b, c):
    if a:
        if b and c:
            return 1
    return 0
`,
    expected: {"f": {"cyclomatic": 4, "cognitive": 4}},
    basis: [CC_SHORT_CIRCUIT, COG_RULES, COG_SEQUENCES],
    explanation: "Two if decisions plus one short circuit; cognitive 1 + 2 + 1, with no nesting penalty on the logical sequence",
  },
  {
    name: "mutual recursion and an outside caller",
    source: `def f(n):
    return g(n)
def g(n):
    return f(n)
def caller(n):
    return f(n)
`,
    expected: {"f": {"cyclomatic": 1, "cognitive": 1}, "g": {"cyclomatic": 1, "cognitive": 1}, "caller": {"cyclomatic": 1, "cognitive": 0}},
    basis: [CC_BINARY, COG_RECURSION],
    explanation: "Only the two functions in the cycle receive a recursion point",
  },
  {
    name: "inner function control depth starts at zero",
    source: `def f(a, b):
    if a:
        def inner():
            if a:
                while b:
                    break
        inner()
`,
    expected: {"f": {"max_nesting_depth": 2}, "inner": {"max_nesting_depth": 2}},
    basis: [MAX_NESTING],
    explanation: "Inner starts at control depth zero; the enclosing function displays the maximum depth including inner",
  },
  {
    name: "comments and layout preserve measurements",
    source: `def f(
    flag, # input
):
    # decision
    if flag:
        return 1

    return 0
`,
    expected: {"f": {"cyclomatic": 2, "cognitive": 1, "max_nesting_depth": 1}},
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: "Comments, blank lines, and layout leave one if decision",
  },

  {
    name: 'assert adds a failure decision',
    source: `def f(value):
    assert value
    return value
`,
    expected: { f: { cyclomatic: 2, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, PY_ASSERT, COG_RULES, MAX_NESTING],
    explanation: 'Assert has success and failure paths in normal execution; it is not a cognitive increment target',
  },
  {
    name: 'assert retains short-circuit conditions and message expressions',
    source: `def f(a, b):
    assert a and b, ('a' if a else 'b')
`,
    expected: { f: { cyclomatic: 4, cognitive: 2, max_nesting_depth: 1 } },
    basis: [CC_BINARY, CC_SHORT_CIRCUIT, PY_ASSERT, COG_RULES, COG_SEQUENCES, MAX_NESTING],
    explanation: 'Assert, AND, and the message ternary contribute three decisions; AND and ternary contribute two cognitive points',
  },
  {
    name: 'for-else adds no decision beyond iteration and the inner condition',
    source: `def f(values, ready):
    for value in values:
        use(value)
    else:
        if ready:
            finish()
`,
    expected: { f: { cyclomatic: 3, cognitive: 4, max_nesting_depth: 2 } },
    basis: [CC_BINARY, PY_LOOPS, COG_RULES, MAX_NESTING],
    explanation: 'Loop 1, else 1, nested if 2 cognitively; else adds no independent decision',
  },
  {
    name: 'while-else and an early exit retain explicit decisions',
    source: `def f(ready, stop):
    while ready:
        if stop:
            break
    else:
        finish()
`,
    expected: { f: { cyclomatic: 3, cognitive: 4, max_nesting_depth: 2 } },
    basis: [CC_BINARY, PY_LOOPS, COG_RULES, COG_EXITS, MAX_NESTING],
    explanation: 'Loop 1, nested if 2, else 1; unlabelled break adds no separate point',
  },
  {
    name: 'a Python default value adds no branch to the function body',
    source: `def f(value=1):
    return value
`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_BINARY, PY_DEFAULTS, COG_RULES, MAX_NESTING],
    explanation: 'Python evaluates this default when defining the function; there is no per-call initializer branch',
  },
  {
    name: 'an exception group handler contributes one catch',
    source: `def f():
    try:
        work()
    except* (ValueError, TypeError):
        recover()
`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_BINARY, COG_CATCH, MAX_NESTING],
    explanation: 'One handler regardless of the number of listed exception types',
  },
  {
    name: 'bitwise operators have no short-circuit contribution',
    source: `def f(a, b, c):
    return (a & b) | c
`,
    expected: { f: { cyclomatic: 1, cognitive: 0, max_nesting_depth: 0 } },
    basis: [CC_SHORT_CIRCUIT, COG_SEQUENCES, MAX_NESTING],
    explanation: 'Bitwise operators evaluate both operands',
  },

  {
    name: 'conditional expression nested in the condition receives nesting',
    source: `def f(a, b, c):
    return a if (b if c else a) else b
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_BINARY, COG_RULES, MAX_NESTING],
    explanation: 'Two decisions; cognitive 1 for the outer expression and 2 for its nested condition',
  },
  {
    name: 'filtered list comprehension follows nested for and if',
    source: `def f(values):
    return [x for x in values if x > 0]
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_BINARY, COG_RULES, PY_COMPREHENSION, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Noema maps the generator to a loop and the filter to a nested condition: 1 + 2 cognitive points',
  },
  {
    name: 'multiple comprehension generators retain evaluation nesting',
    source: `def f(groups):
    return [y if y else 0 for group in groups if group for y in group if y]
`,
    expected: { f: { cyclomatic: 6, cognitive: 15, max_nesting_depth: 5 } },
    basis: [CC_BINARY, COG_RULES, PY_COMPREHENSION, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Two generators, two filters, and the result ternary form five levels: 1 + 2 + 3 + 4 + 5',
  },
  {
    name: 'dictionary comprehension scores its value after its clauses',
    source: `def f(values):
    return {x: (1 if x else 0) for x in values}
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_BINARY, COG_RULES, PY_COMPREHENSION, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Generator 1 and value ternary nested beneath it 2',
  },
  {
    name: 'set and generator comprehensions each add one loop',
    source: `def f(values):
    result = {x for x in values}
    return (x for x in result)
`,
    expected: { f: { cyclomatic: 3, cognitive: 2, max_nesting_depth: 1 } },
    basis: [CC_BINARY, COG_RULES, PY_COMPREHENSION, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Two independent comprehensions each contribute one loop at the same depth',
  },
  {
    name: 'match alternatives sharing a case body form one outcome',
    source: `def f(value):
    match value:
        case 1 | 2:
            return 1
        case 3:
            return 2
        case _:
            return 0
`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Two tested case bodies plus the wildcard; Noema treats match as one cognitive switch',
  },
  {
    name: 'a match guard adds its own condition',
    source: `def f(value, ready):
    match value:
        case 1 if ready:
            return 1
        case _:
            return 0
`,
    expected: { f: { cyclomatic: 3, cognitive: 3, max_nesting_depth: 2 } },
    basis: [CC_BINARY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'One pattern decision plus one guard; match 1 and nested guard 2 cognitively',
  },
  {
    name: 'capture pattern is an unconditional match outcome',
    source: `def f(value):
    match value:
        case captured:
            return captured
`,
    expected: { f: { cyclomatic: 1, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'A bare capture matches every value and contributes no case decision',
  },
  {
    name: 'an as-pattern preserves an unconditional wildcard',
    source: `def f(value):
    match value:
        case _ as captured:
            return captured
`,
    expected: { f: { cyclomatic: 1, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Binding a name to a wildcard introduces no failed-match path',
  },
  {
    name: 'qualified value patterns still test a value',
    source: `def f(value):
    match value:
        case Color.RED:
            return 1
        case captured:
            return 0
`,
    expected: { f: { cyclomatic: 2, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'A qualified value can fail to match; the final capture supplies the default outcome',
  },

  {
    name: 'sequence captures still require the sequence to match',
    source: `def f(value):
    match value:
        case left, right:
            return left
        case (only,):
            return only
`,
    expected: { f: { cyclomatic: 3, cognitive: 1, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Each sequence pattern can fail; binding its elements does not make the whole pattern unconditional',
  },
  {
    name: 'grouped capture and wildcard alternative remain unconditional',
    source: `def f(value):
    match value:
        case (captured):
            return captured
    match value:
        case 1 | _:
            return 1
`,
    expected: { f: { cyclomatic: 1, cognitive: 2, max_nesting_depth: 1 } },
    basis: [CC_MULTIWAY, COG_RULES, PY_MATCH, NOEMA_MAPPING, MAX_NESTING],
    explanation: 'Both matches accept every value; their two switch structures still contribute cognitive points',
  },
]
