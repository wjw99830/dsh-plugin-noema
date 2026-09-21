# Noema

[English](README.md) | 中文

在 AI 编程中保持自己的代码品味

Noema 是一个 DeepSeek Harness 插件，面向希望持续掌控交付代码的开发者。每轮编程任务结束后，它展示代码结构复杂度的变化，帮助你把审查范围缩小到值得关注的文件和函数

## 审查一轮改动

1. 查看变更文件的圈复杂度、认知复杂度和最大嵌套深度
2. 展开文件或函数，查看 `[Top Level]` 中的自身代码和单独列出的具名子函数
3. 点击可展开的文件或函数行，展开或折叠内部内容

文件和函数的复杂度包含内部全部代码。匿名函数计入 `[Top Level]`，具名函数单独列出。可展开的文件和函数默认折叠

未变化的代码默认隐藏，点击“显示未出现变化的函数”可在当前文件或函数下显示这些代码，按钮随即消失。指标下降使用绿色，上升使用琥珀色，新增函数使用默认文字颜色。递归标记表示识别出的直接递归或互相递归

文件名后的黄色圆形图标表示修改前测量失败，仍显示当前分数并支持展开，但不显示变化量。红色图标表示修改后测量失败，指标显示 `-`，文件无法展开。悬停图标可查看具体原因

Noema 支持 TypeScript、TSX、Python 和 Go，对应 `.ts`、`.mts`、`.cts`、`.tsx`、`.py` 和 `.go`，跳过 JavaScript 和 TypeScript 声明文件

受支持的文件没有代码变化时不显示卡片，包括纯聊天、只修改注释或格式的情况。整个删除的文件不显示，代码变化但分数相同时仍会展示

分析比较轮次开始与结束时的工作区，包含期间发生的其他编辑，结果不进入模型上下文

## 安装

接入面向 DSH `0.1.6-alpha.2` 和 Cordis `4.0.2`，需要 Node.js `^22.19.0 || >=24.0.0`。DSH API 尚未稳定，试用时请使用已验证的版本

在 Noema 源码目录中，使用 pnpm `11.7.0` 构建并安装到 Web profile：

```sh
pnpm install
dsh plugin --profile web add "$PWD"
dsh --profile web
```

`pnpm install` 通过 `prepare` 构建插件。本地安装会链接源码目录，修改后运行 `pnpm build`，重启 DSH 并刷新浏览器。安装和启动使用同一个 profile 与 `DSH_HOME`

安装后的新轮次开始生成报告。可以让 DSH 修改一个受支持的源码文件来试用。DSH 源码仓库接入和压缩包安装方式见[贡献指南](CONTRIBUTING.zh.md)

## 选择分析文件

在 Web 侧边栏打开 **插件 → plugin-noema → 分析范围**

- **包含文件**：每行一个 glob 模式，例如 `**/*` 或 `src/**`
- **排除文件**：优先于包含规则
- **添加常见测试文件排除规则**：在已有列表中添加 TypeScript、Python 和 Go 的测试文件模式
- **保存**：同时保存两份列表，从下一轮开始生效，重启后保留
- **恢复默认**：预览 profile 的默认规则，保存后生效

规则对使用同一份 DSH 设置的工作区生效。正在运行的轮次沿用开始时的规则，离开页面会放弃未保存的修改

模式匹配相对工作区的路径，区分大小写，使用 `/` 分隔目录。`**` 跨目录匹配，花括号表示多个候选，点号开头的文件也参与匹配。列表内任意模式匹配即可。包含列表为空时停止分析；排除列表为空时仍遵循 `.gitignore` 和支持的文件类型。排除条件写入排除列表

默认包含模式为 `**/*`，默认排除模式为：

```text
**/{.git,node_modules,.artifacts,dist,build,coverage,.venv,__pycache__,.next}/**
```

### Profile 配置

Web 设置优先于 profile 中的 `include` 和 `exclude`，恢复默认并保存会清除这些覆盖值。例如，以下 profile patch 将范围限定在 `src/` 并排除测试文件：

```yaml
- id: noema
  config:
    include: ["src/**"]
    exclude:
      - "**/{.git,node_modules,.artifacts,dist,build,coverage,.venv,__pycache__,.next}/**"
      - "**/*.{test,spec}.{ts,tsx,mts,cts}"
      - "**/{test,tests,__tests__}/**"
      - "**/test_*.py"
      - "**/*_test.py"
      - "**/*_test.go"
```

设置 `exclude` 会替换默认列表，修改 profile 后需要重启 DSH

资源限制在同一个 `noema` 条目中配置：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `max_file_bytes` | 2097152 | 单份源码或 ignore 文件的字节上限 |
| `max_snapshot_bytes` | 33554432 | 每份快照捕获的源码字节总量 |
| `max_files` | 2000 | 每份快照的候选源码文件数量 |
| `snapshot_timeout_ms` | 10000 | 每次快照的时间上限 |
| `analysis_timeout_ms` | 15000 | 每个分析 Worker 的时间上限，包含启动 |
| `max_pending_reports` | 3 | 正在分析和排队中的报告总数 |

扫描不完整时跳过该轮报告。队列满或超时可能跳过分析，编程任务继续执行

## 诊断日志

`NOEMA_LOG_LEVEL` 控制主进程和分析 Worker 的终端日志级别，默认为 `warn`

| 级别 | 输出内容 |
| --- | --- |
| `error` | 分析失败、结果保存失败 |
| `warn` | 错误，以及文件采集被跳过的警告 |
| `info` | 警告，以及插件就绪、结果保存成功 |
| `debug` | 全部级别，以及轮次事件、快照、文件比较和跳过原因 |

排查问题时开启详细日志：

```sh
NOEMA_LOG_LEVEL=debug dsh --profile web
```

日志以 `[noema:<level>]` 开头，包含会话和轮次标识、文件路径、计数、筛选规则及错误信息，省略采集到的源码和会话消息。修改级别后重启 DSH；启动时不设置该变量即可恢复 `warn`

## 进一步了解

- [设计说明](docs/design.zh.md)：数据流、计分规则和模块职责
- [贡献指南](CONTRIBUTING.zh.md)：开发、测试和打包

Noema 使用 [MIT License](LICENSE) 开源
