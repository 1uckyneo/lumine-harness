# 项目合同

## 公共入口与存储

- `.lumine/root.json` 标识项目根；`.lumine/project.json` 管理语言、仓库、能力和知识配置。
- `.agents/skills/` 分发四个日常规范入口：`lumine-plan`、`lumine-run`、`lumine-knowledge`、`lumine-design`。追问与领域建模模块随规划能力内置；项目扩展按需复用或生成，不要求全局安装。初始化维护使用 `lumine-harness`。
- `AGENTS.md` 保留最小硬规则及直达规范附件、Wiki 的入口。强制规则不能只靠检索发现；业务根规则保持宿主中立，实际 Adapter 配置单独维护。
- 架构地图和详细规范进入 Wiki，不默认生成根 `ARCHITECTURE.md`。旧文件按[迁移策略](migration-policy.md)先迁移独有内容、修复引用，无法安全退休则保留并报告。
- Spec 默认 `docs/product-specs/`；Plan 默认 `docs/exec-plans/active/`，历史在 `completed/`；证据在 `docs/validation/`；Wiki 默认 `docs/repo-wiki/`，配置只指定一个权威根。不另建 `docs/domain/` 或 `docs/decisions/` 台账。
- `.lumine/wiki-state/` 保存持久知识状态；`.lumine/local/wiki/` 只保存可重建缓存／本机态，其他本地内容可能是受保护私有资料。

## 资料角色与效力

Spec 保存本次目标、业务规则、验收和待决问题；Plan 引用适用 Spec，保存技术选择、取舍、实施与验证安排。按需追问后，每轮用户回答先回写所属 Spec／Plan，明确决定、方向、假设和待决项，不把回答当成跨阶段确认。

Wiki 保存已核实实现，以及已确认、跨任务复用的领域语言、上下文边界、长期决定、规范、示例与使用指南。术语完整保留名称、含义及必要别名、关系和不变量；同词多义按上下文区分。必要 ADR 保留背景、备选、决定和后果，归入相关 Wiki 主题并关联原 Spec／Plan；本次拟议决定仍由 Plan 维护。确认的语言或政策不证明实现已落地，正文与图说明这一边界。

AGENTS 可明确授权 Wiki 规范为规则附件。规范、讲解示例、事实说明的效力分开，普通知识同步不能据遗留代码放宽规范或行动授权。规范变化显式复核相关内容；Wiki 页用正文链接和 relations 关联，不互相充当来源快照。

原始材料归参考位置，停用资料归历史位置，个人配置与私密原件归已忽略本地位置。每项现行正文只维护一处，不另建业务记忆副本。

## 身份与语言

Spec／Plan 使用稳定 `id` 和类型；Wiki 按知识接口保存稳定 ID。AC 使用显式 `AC-001` 编号，重要章节和图有稳定引用。CLI 通过 ID、路径或无歧义名称解析。

项目 locale 为 `zh-CN` 或 `en`，在提案和指纹前确定。新正文及主题文件名默认跟随 locale，保留 README、模板名及必要技术词；已有文档不批量翻译或改名。文件名兼容 Windows：不使用保留名、控制字符或 `< > : " / \ | ? *`，不以点／空格结尾，避免大小写及 Unicode 规范化重名。改名不改变稳定身份，迁移保留必要旧路径／章节转向。协议字段、状态值和 Skill 技术名不翻译。

## 工作与证据

完整产品工作按 Spec →（必要设计 → 回写 Spec）→ Exec Plan → Run 的[阶段交接](../assets/skills/lumine-plan/references/stage-handoff.md)取得人的明确确认；阶段内自主，同一范围不重复确认。只改 Spec 不强制建 Plan，Run 中或之后验证不另设确认，只验证不修复。

Runtime 负责确定性检查，四个能力负责语义判断。采用交付复用 Validation、Wiki coverage 和 `.lumine/tasks/` 的版本化 knowledge 证据，分别报告安装完成、内容完成、实际验证；不改变迁移 `complete` 含义或新增采用状态机。详见[检查与证据](runtime-checks.md)。

公共控制状态为 `done`、`continue`、`blocked`，原因与下一步另述。状态不产生授权。诊断 done 可包含失败发现；仅本轮承诺的知识同步影响本轮完成。

## 知识表达

Markdown 与 Mermaid 文本是一份真源，卡片为 HTML DOM。模型只处理文本；浏览器即时渲染图，不生成知识图片、缩略图或视觉模型输入。图与正文说明实际机制或已确认概念及其状态，文字阅读和文本复制／导出始终可用。
