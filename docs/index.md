# 文档导航与维护约定

本页提供资料导航与职责约定，索引不堆叠不同主题的正文；项目基础约束及按任务必读入口见 [AGENTS.md](../AGENTS.md)。只维护适用内容，不为目录齐全创建空文档。

## 资料导航与职责

| 资料 | 默认位置 | 正文职责 |
| --- | --- | --- |
| Product Spec | `product-specs/` | 原位维护产品方案的目标、范围、场景、业务规则、验收标准与待决问题。 |
| Exec Plan | `exec-plans/active/`，历史在 `completed/` | 承接适用 Spec／AC 的技术方案、取舍、执行与验证安排、进度及执行记录；链接详细证据。 |
| 设计材料 | [设计资料](design-docs/index.md) | 可审阅的视觉、交互及适用范围；由 Spec／Plan 引用，不复制产品规则。 |
| Repo Wiki | [知识入口](repo-wiki/) | 架构、实现、已确认领域语言与长期决策、规范、示例和指南；明确效力及实现状态。 |
| Validation | `validation/` | 实际操作、结果、日期、代码／环境范围及原始证据；区分测试、运行、部署与用户接受。 |
| 原始参考 | [参考资料](references/index.md) | 原始需求、接口手册和外部依据；Wiki 提炼并链接原件。 |
| 历史资料 | `archives/` | 停用资料及历史语境，不作为当前规则、批准或运行证明。 |

默认位置按项目实际内容与配置调整；Wiki 只保留一个权威根。个人偏好、个人 Skill、私有配置、凭据及唯一私密恢复原件保存在已忽略的本地位置，不进入共享文档。

## 身份、引用与历史

- 每项正文维护一处。Plan 引用适用 Spec／AC 和内容基线；Wiki 区分规范、示例、实现事实与已确认决定，确认决定不表示实现完成。
- 文档 ID、AC、章节和图的稳定身份独立于可读文件名；改名保留必要引用和历史可读性。Spec 变化只复核受影响的 Plan，内容指纹不产生批准。
- 新正文及主题文件名跟随项目语言，保留 README、模板名和必要技术词及日期；不批量翻译或改名已有资料。名称兼容 Windows，不得使用保留名、控制字符或 `< > : " / \ | ? *`，不得以点或空格结尾，避免大小写／Unicode 规范化重名。
- 先呈现当前结论，再展开细节与历史；省略不适用章节，完整日志通过链接访问。历史证据保持原日期、适用范围和结论，不补造批准。

## 工作方式入口

阶段就绪与确认见[阶段交接](../skills/lumine-harness/assets/skills/lumine-plan/references/stage-handoff.md)，按需追问及领域沉淀见[规划与 grill](../skills/lumine-harness/assets/skills/lumine-plan/references/grill.md)。

实施、恢复与验证见 [lumine-run](../skills/lumine-harness/assets/skills/lumine-run/SKILL.md)，知识维护与阅读器见 [lumine-knowledge](../skills/lumine-harness/assets/skills/lumine-knowledge/SKILL.md)，界面方案及呈现约定见 [lumine-design](../skills/lumine-harness/assets/skills/lumine-design/SKILL.md)。项目使用指南从 Wiki 入口进入；本页不复制 Skill 操作流程。
