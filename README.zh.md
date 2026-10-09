# Noema

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/wjw99830/dsh-plugin-noema)
[![dshfind](https://dshfind.com/api/badge/wjw99830/dsh-plugin-noema?lang=zh)](https://dshfind.com/zh/plugins/wjw99830/dsh-plugin-noema?ref=badge)

[English](README.md) | 中文

在 AI 编程中保持自己的代码品味

Noema 是一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，面向在意代码质量与风格的开发者。每轮编程任务结束后，它展示复杂度变化，帮助你确定哪些文件和函数值得仔细阅读

![Noema 展示文件及函数修改前后的复杂度变化](https://raw.githubusercontent.com/wjw99830/dsh-plugin-noema/main/docs/assets/demo.png)

## 审查改动

Noema 对比每轮任务前后的三个指标：

| 指标 | 衡量内容 |
| --- | --- |
| 圈复杂度 | 代码中独立路径的数量 |
| 认知复杂度 | 理解控制流程的难度，考虑分支、嵌套和递归 |
| 最大嵌套深度 | 函数内控制结构的最大嵌套层数 |

展开文件或函数，可以查看内部的变化。文件和函数的指标包含内部代码，`[Top Level]` 展示其自身代码的指标，具名子函数单独列出。未变化的代码默认隐藏，需要时可以显示

这些指标帮助你确定审查重点。具体改动仍需结合代码判断，分数下降本身并不代表代码质量提高

分析在本地运行，对比每轮任务开始与结束时的工作区，包含期间的人工修改。分析结果不进入模型上下文

## 支持语言

支持 TypeScript（含 TSX）、Python 和 Go，跳过 JavaScript 和 TypeScript 声明文件

没有受支持的代码变化时不显示卡片，包括只修改注释或格式的情况。代码发生变化但分数相同时，仍会展示

## 安装

支持 DSH `^0.1.7-rc.2 || ^0.2.0-rc.2 || ^0.2.1-alpha.1`，需要 Node.js `^22.19.0 || >=24.0.0`

将 npm 包安装到 Web profile，然后启动 DSH：

```sh
dsh plugin --profile web add dsh-plugin-noema
dsh web
```

如果 DSH 已在运行，重启并刷新浏览器。Noema 从安装后的新一轮任务开始分析，可以让 DSH 修改一个受支持的源码文件来试用

## 选择文件

在 Web 侧边栏打开 **插件 → Noema → 分析范围**，设置相对工作区的包含和排除模式，例如 `src/**` 和 `**/*.test.ts`，也可以点击“添加常见测试文件排除规则”。设置作用于当前 Profile，排除规则优先，保存后从下一轮任务生效

Noema 遵循 `.gitignore`，默认排除常见依赖和构建目录

## 进一步了解

- [设计说明](docs/design.zh.md)：分析行为和指标汇总
- [计分规则](docs/scoring.zh.md)：各语言的规则及依据
- [贡献指南](CONTRIBUTING.zh.md)：本地开发、测试和打包

Noema 使用 [MIT License](LICENSE) 开源
