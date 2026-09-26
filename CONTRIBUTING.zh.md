# 贡献指南

[English](CONTRIBUTING.md) | 中文

[设计说明](docs/design.zh.md)介绍分析流程和计分约定

## 开发

使用 Node.js `^22.19.0 || >=24.0.0` 和 pnpm `11.7.0`

```sh
pnpm install
pnpm format
pnpm typecheck
pnpm test
```

安装通过 `prepare` 构建 Host、Client 和解析资源。语法包提供预编译 WASM，未使用的原生绑定构建已禁用

如果使用同级目录中的 DSH 源码仓库，在 DSH 仓库中运行：

```sh
pnpm dsh plugin --profile web add ../dsh-plugin-noema
pnpm dsh web
```

修改 Noema 后，在插件目录运行 `pnpm build`，重启 DSH 并刷新浏览器

## 界面开发

优先复用 DSH 官方 UI 组件和现有界面功能，参考官方界面中的使用实例。仅在现有组件无法满足需求时实现自定义组件或引入额外 UI 依赖，并在变更说明中解释原因。布局、主题颜色、交互和键盘操作应与 DSH 原生界面保持一致

## 验证

| 命令 | 覆盖范围 |
| --- | --- |
| `pnpm format` | 格式化 `src/` 与 `scripts/` 中支持的文件 |
| `pnpm clean` | 删除 `lib/` 中的生成文件 |
| `pnpm build` | 清理 `lib/`，编译 Host 与 Client、复制解析资源并打包 Web 入口 |
| `pnpm typecheck` | Host 与 Client 类型检查 |
| `pnpm test` | 构建、计分、快照、比较、存储、Profile 配置、Remote API、Worker 生命周期和 Client 行为测试 |
| `pnpm test:scoring` | 使用真实 WASM 运行计分规范用例，核对明确预期与规则依据 |
| `pnpm test:package` | 打包并在独立目录安装生产依赖，检查全部解析模式和 Host 激活 |
| `pnpm benchmark:analyzer` | 不同场景下的分析器冷热运行耗时、原始采样和资源大小 |

源码修改需要运行类型检查和测试。导出、构建资源、依赖或发布内容变化时运行产物验证

计分用例放在 `tests/scoring/`，每个用例记录源码、明确的预期指标、计分说明和规则依据，在修改计分代码前确定预期。`tests/hierarchy.test.mjs` 覆盖嵌套函数、指标汇总和语法比较，`pnpm test:scoring` 通过打包的 WASM 解析器运行这两组用例，`pnpm test` 也包含它们

产物检查通过 npm 安装依赖，随后清空 `PATH` 并在检查进程中禁用网络获取。实际 Web 交互需要另行运行 DSH

## 性能测量

`pnpm benchmark:analyzer` 重新构建分析器，测量 TypeScript、TSX、Python 和 Go 的 12 组样本：小文件、包含嵌套函数、回调和递归的文件，以及包含 1,000 个函数的文件。TSX 样本包含 JSX

每组样本依次运行 5 个独立进程。每个进程记录第一次分析的耗时，再预热 5 次，最后记录 20 次热运行的耗时。计时覆盖 `analyzeSource()` 中的解析、计分与汇总，第一次调用还包含解析器和语法加载。进程启动和结果校验在计时范围外；工作区快照、变更比较和界面渲染不在这项测量的范围内

可以分别保存修改前后的结果，也可以选择样本并调整采样次数：

```sh
pnpm benchmark:analyzer --output before.json
pnpm benchmark:analyzer --output after.json
pnpm benchmark:analyzer --case tsx-structured --runs 3 --warmup 5 --samples 20
```

重复使用 `--case` 可以选择多组样本。省略 `--output` 时，每次运行会创建带时间戳的结果文件，并打印保存位置。JSON 结果包含原始耗时、最小值、中位数、最大值、输入与源码及构建产物的哈希、依赖和计分规则版本，以及机器信息。比较时应保持输入、采样设置和环境一致，测量期间避免同时构建或运行其他高负载任务

内存快照和 WASM 大小用于了解资源占用。内存快照包含整个子进程的开销，无法反映峰值。基准脚本只记录测量结果，没有设置性能通过阈值

## 打包

```sh
pnpm pack
dsh plugin --profile web add ./dsh-plugin-noema-0.1.0-alpha.1.tgz
```

`pnpm pack` 通过 `prepare` 执行构建，将发布压缩包写入仓库根目录。每次构建都会重新生成 `lib/` 中的编译代码和解析资源。包内包含编译后的 Host 与 Client、类型声明、WASM 语法与许可证、DSH bundle patch、插件展示元数据和公开文档，内容由 `package.json` 的 `files` 列表控制

## 提交修改

保持改动范围明确，同步更新相关测试和文档。依赖变化时提交 `pnpm-lock.yaml`，提交说明包含最终行为和执行过的验证

公开文档以英文为默认版本，中文对应文件使用 `.zh.md` 后缀。同步更新两种语言，保持命令和示例一致，并检查相互链接。README 说明使用和配置，设计文档定义分析行为和指标含义

贡献内容遵循 [MIT License](LICENSE)
