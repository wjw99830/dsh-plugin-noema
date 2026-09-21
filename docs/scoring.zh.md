# 计分规则

[English](scoring.md) | 中文

本文定义 Noema 的语法计分规则及测试范围。函数归属、`[Top Level]` 和指标汇总见[设计说明](design.zh.md)

## 计分依据

圈复杂度采用 [NIST SP 500-235 第 4.1 节](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication500-235.pdf#page=43)的分支计数定义。认知复杂度采用 [Sonar 白皮书 v1.7](https://www.sonarsource.com/docs/CognitiveComplexity.pdf)，包含附录 A 的例外

语言规范决定语法的执行语义。复杂度规范没有逐项列出的语法，由下文明确 Noema 的计分规则

## 分支计数

具名函数的圈复杂度起始分为 1。二选一的分支加 1，具有 k 个出口的多路分支加 k − 1。短路求值按条件执行产生的路径计分。Noema 对每个循环加 1，省略条件的循环也一样

switch 中直接进入同一条语句的多个标签共用一个出口。显式 default 替代隐式 default。先执行语句、再进入下一个 case 的情况保留独立入口

Noema 按源码中的控制结构计分，不进行常量求值和可达性分析。普通调用、赋值、return 和无条件跳转本身不增加分支

## 认知计分

d 表示所在位置的认知嵌套层数

| 语法 | 分数 |
| --- | --- |
| `if`、循环、条件表达式、switch、异常处理分支 | 1 + d |
| `else if`、`elif`、`else` | 1 |
| 一段连续使用同一种逻辑运算符的表达式 | 1 |
| 带标签的跳转 | 1 |
| 属于已识别递归环的函数 | 每个函数加 1 |
| 空值处理简写、普通调用、提前 return、`try`、`finally` | 0 |

控制结构的内部代码增加嵌套。条件表达式的条件部分和两个结果部分，都会增加内部条件表达式的嵌套层数。嵌套函数保留源码中的嵌套关系，声明式外层函数和 Python 装饰器遵循附录 A 的例外

## 控制深度

最大嵌套深度统计函数内部控制结构的层数。进入任意函数时从 0 开始，匿名函数也一样。连续的 `else if` 保持同层。逻辑运算、默认值、断言和普通代码块本身不增加深度

## 语言规则

### TypeScript 与 TSX

| 语法 | 圈复杂度增量 | 认知复杂度规则 |
| --- | --- | --- |
| 参数或解构默认值 | 每个默认值加 1 | 简写，本身加 0 |
| `&&`、`||`、`&&=`、`||=` | 每次短路求值加 1 | 按逻辑运算序列计分 |
| `?.`、`??`、`??=` | 每次条件检查加 1 | 简写，本身加 0 |
| `catch` | 每个处理分支加 1 | 按异常处理分支计分 |
| 条件表达式 | 加 1 | 条件部分和两个结果部分均计入嵌套 |
| 条件类型、类型断言、非空断言 | 加 0 | 加 0 |
| JSX 标签 | 加 0 | 内部表达式正常计分 |

默认值的执行规则见 [ECMAScript 绑定语义](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-runtime-semantics-keyedbindinginitialization)，逻辑赋值见[赋值语义](https://tc39.es/ecma262/multipage/ecmascript-language-expressions.html#sec-assignment-operators-runtime-semantics-evaluation)

### Python

| 语法 | 圈复杂度增量 | 认知复杂度规则 |
| --- | --- | --- |
| `assert` | 按启用断言计算，加 1 | 语句本身加 0，内部表达式正常计分 |
| 普通参数默认值 | 加 0 | 加 0 |
| 带 `else` 的 `for` / `while` | 循环加 1，`else` 加 0 | 循环和 `else` 分别计分，内部代码增加嵌套 |
| `except`、`except*` | 每个处理分支加 1 | 按异常处理分支计分 |
| 推导式中的 `for` 和 `if` | 每个子句加 1 | 按求值顺序视为嵌套循环和条件 |
| `match` | 每个需要匹配的 case 主体加 1 | 整体视为一个 switch |
| 一定匹配成功的通配或捕获模式 | 加 0 | case 本身不额外加分 |
| case 的守卫条件 | 加 1 | 视为 match 内嵌套的条件 |

推导式和模式匹配采用 Noema 的语言映射。同一 case 中的多个候选共用一个主体。通配模式、捕获模式及保持无条件匹配的括号、`as`、OR 组合充当默认出口；序列模式仍需要匹配

执行语义见 Python 的[断言](https://docs.python.org/3/reference/simple_stmts.html#the-assert-statement)、[复合语句与模式匹配](https://docs.python.org/3/reference/compound_stmts.html)和[推导式求值](https://docs.python.org/3/reference/expressions.html#displays-for-lists-sets-and-dictionaries)文档

### Go

| 语法 | 圈复杂度增量 | 认知复杂度规则 |
| --- | --- | --- |
| 表达式 switch、类型 switch | 按包含默认出口在内的 case 主体数量计算 | 整体视为一个 switch |
| 同一 case 中的多个值或类型 | 共用一个出口 | case 本身不额外加分 |
| `select` | max(0, 通信与 default 子句总数 − 1) | 整体视为一个 switch |
| 返回值和成功标志的类型断言 | 本身加 0 | 加 0 |
| `goto` | 本身加 0 | 加 1 |

Noema 将 `select` 映射为认知复杂度中的 switch。没有 default 的 select 会等待通信，等待不构成额外的默认出口。这一点与普通 switch 的区别见 [Go 规范](https://go.dev/ref/spec#Select_statements)

## 计分测试

[计分用例](../tests/scoring/)包含明确的预期值、计算说明和规范来源。[分层测试](../tests/hierarchy.test.mjs)覆盖源码嵌套、汇总和语法变化

运行 `pnpm test:scoring`，通过随包分发的 WASM 语法运行这些用例。修改规则实现前，先按规则定义补充用例
