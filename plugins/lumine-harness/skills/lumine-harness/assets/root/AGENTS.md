# AGENTS.md - {{project_name}} 工程入口

## 适用范围

- 本文件约束当前 Harness 根及其包含的 implementation surfaces。
- `{{implementation_surface}}`
- 业务代码、验证和 Git 操作在实际 implementation surface 内执行；根级 Harness 负责工程地图、阶段方法、项目记录、检查和导航。

## 工程地图

按任务需要选择入口，不要求机械读取全部文件。

- `README.md`：人类总览、启动方式和常用命令。
- `ARCHITECTURE.md`：仓库形态、模块关系、实现路径、运行面和架构不变量。
- `docs/workflow-artifacts.md`：Draft、Design、Product Spec、Exec Plan、Validation 和 generated 的职责。
- `docs/drafts/`：原始需求、问题和待确认决策。
- `docs/product-specs/`：已确认的产品目标、范围、规则和验收标准。
- `docs/exec-plans/active/`：当前执行现场；`completed/` 保存已完成计划。
- `docs/validation/`：测试、浏览器、日志、数据或人工验收证据。
- `docs/generated/`：仓库事实的导航索引；不能替代源码、测试或运行态证据。
- `.agents/skills/`：项目 Skill 的唯一内容真源。
- `.harness/`：公共 CLI、检查、索引生成和生命周期运行层。
- `{{repo_rules_entry}}`：进入具体业务实现时的真实规则来源。

只有项目启用了对应模块时，才读取 `docs/design-docs/`、`docs/FRONTEND.md` 或其他可选参考资料。

## 实现入口速查

{{directory_map}}

## 事实索引目标

{{fact_index_targets}}

根级摘要与具体业务仓、模块规则冲突时，以目标源码、运行态、测试和目标仓自身规则为准。

## Harness 阶段路由

- `.agents/skills` 是唯一 Skill 内容真源；不要维护产品级 Rules、Skill 正文副本或 Skill 投影。
- 进入阶段前必须实际读取对应文件，不能只凭目录存在或上下文提示声称已经使用：
  - Navigate：`.agents/skills/lumine-harness-navigate/SKILL.md`
  - Draft：`.agents/skills/lumine-harness-draft/SKILL.md`
  - Design：`.agents/skills/lumine-harness-design/SKILL.md`
  - Product Spec / Exec Plan：`.agents/skills/lumine-harness-plan/SKILL.md`
  - Run：`.agents/skills/lumine-harness-run/SKILL.md`
  - Generated：`.agents/skills/lumine-harness-generated/SKILL.md`
  - Check：`.agents/skills/lumine-harness-check/SKILL.md`
- 从包含 `.harness/root.json` 的 Harness 根启动；多仓工程不能只打开其中一个子仓。

## 工作流与人工确认门

```text
Draft
  ↓ 人工确认
按需 Design
  ↓ 人工确认
Product Spec
  ↓
Exec Plan
  ↓ 人工授权 Run
实现、测试与修复
  ↓
Validation 与归档
```

- 新 Draft 写入 `docs/drafts/<slug>.md`；用户确认前只更新 Draft，不生成正式 Design、Product Spec 或 Active Exec Plan。
- Design 是按需分支。需要设计确认的事项必须先完成并批准设计产物，再进入 Product Spec / Exec Plan 或真实实现。
- Product Spec 先固定产品目标、范围、规则和验收标准；Exec Plan 再记录技术路径、当前进度和验证安排。
- Draft、Design、Product Spec / Exec Plan 和 Run 开始前必须有人确认。Run 获得授权后可以自主实施、测试和修复；遇到新决策、凭据或人工操作时交还给人。
- 实施证据写入 `docs/validation/<slug>/<YYYY-MM-DD>/`，并把摘要和证据路径回写 Active Exec Plan。
- Run 收尾刷新并复核受影响的 generated，执行 Harness Check，再判断是否可以归档。

## 事实与证据层级

- 产品目标、范围和验收标准以已确认的 Product Spec 为准。
- 当前执行进度、决定和下一步以 Active Exec Plan 为准。
- 代码结构和行为以源码为准；实际结果以测试、运行态和 Validation 为准。
- `AGENTS.md` 是行动入口，`ARCHITECTURE.md` 是架构地图；两者都不是运行事实。
- generated 只辅助定位，不单独承担事实判断。
- 不能用“文件存在”代替“宿主已加载、Skill 已读取、Hook 已执行或结果已验证”。

## Git 与安全

- 保留用户已有修改，不自动 stash、reset、切换分支、改远端或改写历史。
- 父级工程和嵌套业务仓分别管理 Git；只提交当前任务明确授权的仓库和文件。
- 不把账号、Token、Cookie、私有路径或客户数据写入公开文档、日志和验证摘要。
- 高风险、不可恢复或需要外部授权的操作必须交还给人。

## WORK_STATUS

收尾或暂停时只输出一条 `WORK_STATUS: <status>`：

- `done`：目标已完成，且当前可做的工作已收口。
- `continue_autonomously`：下一步明确且不需要用户输入，可以继续。
- `needs_user_decision`：存在不能安全代替用户作出的产品或技术选择。
- `needs_credentials`：缺少继续工作所需的凭据或授权材料。
- `needs_manual_app_step`：需要用户在外部应用或界面完成操作。
- `blocked_external`：外部服务、网络、依赖或运行环境阻塞，且没有安全绕过方式。

状态只表达任务事实，不要求 Agent 判断当前使用的是哪个宿主产品。宿主需要的生命周期命令由当前 Adapter 动态提供。

## 项目扩展

{{project_specific_rules}}
