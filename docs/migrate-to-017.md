# DSH 0.1.7 适配方案

## 目标

将 Noema 从 DSH `0.1.6-alpha.2` 适配到 `0.1.7-rc.2`，恢复插件加载、分析范围配置和复杂度卡片展示

本方案以 `0.1.7-rc.2` 为验证基准，新版 Noema 的最低支持版本相应提高。分析器、计分规则、结果格式和卡片交互保持现有行为

## 版本变化

`0.1.7-rc.1` 的发布说明汇总了自 `0.1.5` 以来的变更。客户端会话多实例、运行时依赖解析和插件卸载等能力已经包含在 Noema 当前使用的 `0.1.6-alpha.2` 中

| 上游变化 | Noema 的现状 | 适配要求 |
| --- | --- | --- |
| 设置保存到当前 Profile 的插件配置 | 通过 `settings.register()` 注册独立设置 | 改为从插件 Config 读取 |
| `.volatile()` 字段支持无需重载的配置更新 | 包含／排除规则需要在运行期间修改 | 声明实时字段，保持下一轮生效 |
| 前端配置服务改为 `ConfigForm` / `configForms` | 使用已移除的 `SettingsScope` | 迁移配置页的读取和保存逻辑 |
| 安装和启动检查 DSH peer 版本范围 | 当前范围为 `^0.1.6-alpha.2` | 更新版本声明并验证实际安装 |
| Session 日志升级为 V4 | 监听轮次事件，分析结果独立存储 | 验证会话恢复和历史卡片 |
| Remote 支持双向流和二进制传输 | 使用普通调用和单向订阅 | 验证读取、订阅和重连 |
| 文件读取统一为 `readBytes` | 已使用该接口 | 保留现有实现 |
| 支持插件多语言标题、描述和图标 | 管理页展示尚未使用新元数据 | 核心适配完成后补充 |

使用官方 `0.1.7-rc.2` 接口产物进行类型检查，已确认四处配置接口错误：Host 的 `settings.register()`、Client 的 `settingsScope`，以及两处 `SettingsScope` 类型导入。运行时兼容性仍需通过后续集成验证确认

## Host 配置

涉及 `src/config.ts`、`src/index.ts` 和 `src/recorder.ts` 中的配置类型与读取逻辑

- 将 `include`、`exclude` 声明为 `.volatile()` 字段，通过配置引用的 `.get()` 读取当前值
- 移除 `ctx.settings.register()`，由 DSH 将实时配置字段映射为表单并保存到 Profile 的 Cordis patch
- 保留 `cordis.patch.yml` 中的 `noema` 条目标识，作为配置表单的身份
- 文件大小、超时和队列容量等参数继续使用普通配置，本次不扩大 Web 配置页的范围
- 分析功能移除对 `settings` 服务的必需依赖；自定义配置页的展示策略通过可选注入注册，并由插件生命周期清理

### 轮次一致性

每轮开始时读取并复制包含／排除规则，前后快照始终使用这份规则。任务期间保存的配置从下一轮开始生效

沿用 `TurnRecorder` 在轮次开始时保存配置的方式，将 Host 的实时配置引用与分析使用的普通配置值在类型上区分。快照和分析代码只接收普通值

仅修改包含／排除规则时，运行中的插件实例、快照任务和分析队列应保持有效

## Web 配置

涉及 `src/client/index.ts`、`src/client/SettingsForm.tsx` 和 `src/client/settings.ts`

通过 `ctx.configForms.get('noema')` 获取共享表单，使用 `ConfigForm<FilePatterns>` 替换 `SettingsScope<FilePatterns>`，移除 `settingsScope` 服务依赖

保留包含／排除规则输入、添加常见测试排除规则、保存、恢复默认值、放弃修改、冲突提示和只读状态

### 保存行为

- 保存时以一次 `mutate()` 提交包含／排除规则，使用其返回值判断是否被 Host 接受
- 草稿保留开始编辑时的 revision，提交时携带该值，冲突时保留草稿并提示重新加载
- 恢复默认值通过 `unset` 清除字段覆盖，恢复继承值
- 删除通过反复读取并比较 `value`、`user` 来推断保存成功的逻辑
- 表单不可用或不可写时保持对应状态，不把传输失败当作保存成功

复杂度卡片继续使用 `conversation.chat.turnTail` 插槽，保持现有展开、折叠和显示未变化函数的交互

## 依赖与升级

### 依赖声明

- DSH 开发依赖统一固定为 `0.1.7-rc.2`
- DSH peer 范围从 `^0.1.7-rc.2` 开始，Cordis、Schemastery 使用目标版本要求的依赖
- 更新锁文件，检查当前工具链能否完成干净安装
- 移除 `dsh-settings-file`，测试环境改用 Loader、配置编辑器和新版 Settings 的真实组合
- 安装包测试从项目依赖声明获取版本，移除脚本中重复维护的版本号

DSH 的兼容性检查读取 `peerDependencies` 中的 DSH 版本范围。发布包应通过正常的安装和启动检查

### 旧配置

保留 `noema` 条目标识，由 DSH 的一次性导入机制将旧 `settings.yaml` 中的对应配置写入 Profile

验证旧包含／排除规则能否导入，以及重启后是否保留。另行覆盖 DSH 已执行过导入、文件已变为 `settings.yaml.imported` 的情况：此时不能依赖再次自动导入，应确认手动恢复配置的步骤

Noema 本次不增加独立的旧设置迁移器

### 分析结果

目前没有发现需要改变 Noema 结果格式的依据。保留现有结果存储，通过升级后的会话恢复测试确认会话标识、轮次关联和历史卡片读取仍然有效

Session V4 的日志迁移由 DSH 负责

## 验证

先建立新版配置环境的行为测试，再实现配置适配。保留现有计分用例及其预期结果

| 场景 | 验收条件 |
| --- | --- |
| 修改分析范围 | 保存成功，插件实例保持运行，下一轮使用新规则 |
| 任务期间保存配置 | 当前轮次的前后快照使用同一份规则 |
| 配置冲突 | 过期草稿不会覆盖较新的配置，用户可以重新加载 |
| 恢复默认值 | 清除字段覆盖，恢复继承值，重启后保持一致 |
| 配置只读或保存失败 | 明确显示状态，保留草稿，不报告保存成功 |
| 旧设置导入 | 包含／排除规则正确导入，重启后仍有效 |
| 连续轮次、失败和取消 | 按现有分析规则产生结果，并关联到正确轮次 |
| 历史会话恢复 | 已保存结果能读取，卡片关联不串轮次或会话 |
| 重连与会话切换 | 订阅正确恢复，没有重复卡片或残留监听 |
| 插件启停 | 监听、Worker、订阅和样式正确清理，重新启用后正常工作 |
| 配置页与卡片 | 使用新版接口后保留现有交互，卡片视觉由人工检查 |
| npm 安装包 | 在隔离的 DSH `0.1.7-rc.2` Profile 中通过版本检查，Host 和 Client 均能加载 |

`tests/load.test.mjs` 通过监听本次测试产生的会话事件，验证分析结果不会进入模型会话事件

完成适配后运行类型检查、全量测试和安装包测试。最终加载验证使用实际 DSH Profile，覆盖普通测试中直接挂载服务无法验证的版本检查与运行时依赖解析

## 发布

核心适配通过后，补充插件的中英文标题、描述和图标，使管理页显示为 Noema，npm 包名保持 `dsh-plugin-noema`

发布新的 Noema 版本，更新中英文 README 的最低支持版本、已验证版本和配置入口。贡献指南同步更新发生变化的开发与验证步骤

## 实施顺序

1. 更新测试依赖和配置服务组合，建立实时更新、冲突、恢复默认值及旧配置导入用例
2. 完成 Host Config 适配，验证轮次配置一致性
3. 迁移 Web 表单，简化保存结果判断
4. 验证轮次分析、历史恢复、订阅重连和插件启停，运行全量回归
5. 在隔离 Profile 中验证安装包的版本检查与 Host、Client 加载
6. 补充插件展示元数据，更新公开文档和发布版本

## 参考

- [DSH 0.1.6-alpha.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.2)
- [DSH 0.1.7-alpha.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1)
- [DSH 0.1.7-rc.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.1)
- [DSH 0.1.7-rc.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)
- [Host 配置表单](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/docs/subsystems/settings.md)
- [前端配置服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/client/ui-settings/README.md)
- [Profile 启动与版本检查](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/packages/boot/app-boot/README.md#profiles)
