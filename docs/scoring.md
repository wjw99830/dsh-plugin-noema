# Scoring

English | [中文](scoring.zh.md)

This document defines Noema's syntax rules and their test coverage. See [Design](design.md) for function ownership, `[Top Level]`, and metric aggregation

## Sources

Cyclomatic complexity uses the decision-counting model in [NIST SP 500-235, §4.1](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-235.pdf#page=43). Cognitive complexity follows the [Sonar white paper v1.7](https://www.sonarsource.com/docs/CognitiveComplexity.pdf), including Appendix A's exceptions

Language specifications determine execution semantics. The mappings below define Noema's treatment of syntax that the metric specifications do not enumerate

## Decisions

A named function starts with cyclomatic complexity 1. Each binary decision adds 1; a multiway decision with k outcomes adds k − 1. Short-circuit evaluation contributes its conditional execution paths. Noema adds 1 for each loop, including loops with an omitted condition

For a switch, labels that lead directly to the same statement share an outcome. An explicit default replaces the implicit default. Statements executed before falling through retain a distinct entry path

Noema measures written control structures without constant folding or reachability analysis. Ordinary calls, assignments, returns, and unconditional jumps add no decision by themselves

## Cognitive score

Let d be the enclosing cognitive nesting depth

| Construct | Contribution |
| --- | --- |
| `if`, loop, conditional expression, switch, exception handler | 1 + d |
| `else if`, `elif`, `else` | 1 |
| A sequence of the same logical operator | 1 |
| A labelled jump | 1 |
| A function participating in a detected recursion cycle | 1 per function |
| Null-safe shorthand, ordinary calls, early returns, `try`, `finally` | 0 |

Control bodies increase nesting. All parts of a conditional expression, including its condition, increase nesting for enclosed conditional expressions. Nested functions retain their source context; declarative wrappers and Python decorators use Appendix A's exceptions

## Control depth

Maximum nesting depth counts control structures within each function. It resets at every function, including anonymous functions. Consecutive `else if` branches stay at the same level. Logical operators, default values, assertions, and ordinary blocks add no depth themselves

## Language mappings

### TypeScript and TSX

| Syntax | Cyclomatic contribution | Cognitive treatment |
| --- | --- | --- |
| Parameter or destructuring default | 1 per default | Shorthand, 0 |
| `&&`, `||`, `&&=`, `||=` | 1 per short circuit | Logical sequences |
| `?.`, `??`, `??=` | 1 per conditional check | Shorthand, 0 |
| `catch` | 1 per handler | Exception handler |
| Conditional expression | 1 | Includes nesting in its condition and both alternatives |
| Conditional types, type assertions, non-null assertions | 0 | 0 |
| JSX markup | 0 | Its embedded expressions retain their scores |

Default initialization follows [ECMAScript binding semantics](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-runtime-semantics-keyedbindinginitialization); logical assignments follow [assignment semantics](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-assignment-operators-runtime-semantics-evaluation)

### Python

| Syntax | Cyclomatic contribution | Cognitive treatment |
| --- | --- | --- |
| `assert` | 1, with assertions enabled | The statement adds 0; its expressions retain their scores |
| A plain default parameter value | 0 | 0 |
| `for` / `while` with `else` | The loop adds 1; `else` adds 0 | The loop and `else` each contribute; their bodies increase nesting |
| `except`, `except*` | 1 per handler | Exception handler |
| Comprehension `for` and `if` clauses | 1 per clause | Nested loops and conditions in evaluation order |
| `match` | 1 per tested case body | One switch structure |
| A wildcard or capture pattern that always matches | 0 | No extra case increment |
| A case guard | 1 | A condition nested in the match |

Comprehensions and pattern matching use Noema's language mapping. Alternatives in one case share a body. Wildcards, captures, and their unconditional grouped, `as`, or OR forms supply the default outcome; sequence patterns still require a match

The Python reference defines [assertion execution](https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement), [compound statements and matching](https://docs.python.org/3/reference/compound_stmts.html), and [comprehension evaluation](https://docs.python.org/3/reference/expressions.html#displays-for-lists-sets-and-dictionaries)

### Go

| Syntax | Cyclomatic contribution | Cognitive treatment |
| --- | --- | --- |
| Expression or type switch | Case-body outcomes, including default | One switch structure |
| Multiple values or types in one case | One shared outcome | No extra case increment |
| `select` | max(0, number of communication and default clauses − 1) | One switch structure |
| Comma-ok type assertion | 0 by itself | 0 |
| `goto` | 0 by itself | 1 |

Noema maps `select` to a cognitive switch. A select without default waits for a communication; waiting adds no implicit fallthrough outcome. The [Go specification](https://go.dev/ref/spec#Select_statements) defines this distinction from an ordinary switch

## Tests

[Scoring fixtures](../tests/scoring/) contain explicit expectations, calculation notes, and source references. [Hierarchy tests](../tests/hierarchy.test.mjs) cover source nesting, aggregation, and syntax changes

Run `pnpm test:scoring` to evaluate these cases with the packaged WASM grammars. Add a case from the rule definition before changing its implementation
