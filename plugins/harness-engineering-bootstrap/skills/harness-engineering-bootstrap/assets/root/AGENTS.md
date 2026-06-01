# AGENTS.md - {{project_name}} 入口约定

## 适用范围

- 本文件约束当前 harness 根：`{{target_root}}`。
- `{{implementation_surface}}`
- 业务代码、业务验证和业务 Git 操作默认在实际 implementation surface 内执行；根级 harness 负责 docs、skills、hooks、subagents、generated 索引和协调规则。

## 上下文地图

以下路径是可选上下文入口，按当前任务需要选择读取。

- `README.md`：人类总览、项目使用说明、常用命令入口。
- `ARCHITECTURE.md`：详细架构地图、模块地图、实现路径、架构不变量。
- `docs/workflow-artifacts.md`：draft、design、product spec、exec plan、generated、验证记录等产物语义。
- `docs/drafts/index.md`：draft 多轮优化、设计方向讨论、设计稿生成和 plan handoff 的自然语言提示词。
- `docs/design-docs/index.md`、`docs/design-docs/core-beliefs.md`、`docs/design-docs/design-gate.md`：设计确认、HTML 原型、GPT-IMAGE-2 图片探索、页面 taste 和 design gate。
- `docs/FRONTEND.md`：页面 taste、用户可见文案和 UI 实现约束。
- `docs/generated/index.md`、`docs/generated/*.md`：静态扫描加模型复核后的导航索引；只辅助定位，不替代源码、测试或运行态验证。
- `.agents/skills/harness-*/SKILL.md`：draft、generated、design、plan、run、check 等 harness 执行规则。
- `.codex/agents/harness_*.toml`：可选 subagent lanes；只在任务适合拆分且 write set 清楚时使用。
- `.codex/hooks/`、`.codex/harness-check.mjs`、`.codex/harness-generated.mjs`：hooks、checks 和 generated refresh 实现。
- `{{repo_rules_entry}}`：进入业务实现时的真实规则来源。

## 主要目录速查

{{directory_map}}

## 事实索引目标

{{fact_index_targets}}

如果根级摘要与具体业务仓/模块规则冲突，真实业务实现阶段以目标源码、运行态、测试和目标仓自身规则为准。

## 快速路由原则

- 根级 harness 资产包括：`AGENTS.md`、`ARCHITECTURE.md`、`harness`、`.codex/`、`.agents/`、`docs/`。
- 业务实现先按“主要目录速查”定位；更细模块、业务域和跨端实现路径看 `ARCHITECTURE.md`。
- 涉及不熟悉模块时，先刷新/读取 `docs/generated/**`，再回到源码确认。

## Harness Workflow

- 新 draft 直接写在 `docs/drafts/<slug>.md`。
- draft 可多轮优化；用户确认前只更新 draft，不生成 product spec 或 active exec plan。
- 用户可以多轮补充 draft，也可以只讨论页面设计方向；设计方向讨论只写回 draft，不生成正式设计稿。
- 提示词只使用自然语言，不暴露 `L2`、`ui_impact` 或 `prototype_mode`；这些是内部字段。
- 用户确认 draft 可以进入下一步后，由 Codex 判断：不需要设计确认的事项进入 spec/plan；需要先看页面效果的事项进入 `harness-design`。
- 需要设计确认的页面事项必须先完成页面级 `DESIGN.md` 的 `design_status: approved`，并具备 `prototypes[]` HTML / hybrid handoff，再生成 product spec / active exec plan 或触碰真实页面代码。
- 设计稿可以多轮修改；只有用户确认设计稿后，才基于 draft 与 approved design 生成 product spec / active exec plan。
- product spec 放在 `docs/product-specs/<slug>.md`；active exec plan 放在 `docs/exec-plans/active/<slug>.md`；completed exec plan 放在 `docs/exec-plans/completed/<slug>.md`。
- 需要仓库事实导航时使用 `harness-generated`；generated 不能替代源码、运行态验证、测试或验证记录。
- 实施验证证据放在 `docs/validation/<slug>/<YYYY-MM-DD>/`；active exec plan 写验证摘要、证据路径、DOM、console 或 network 摘要，没有验证记录时不得声称验证通过。
- `harness-run` 收尾默认刷新并复核受影响 generated、记录验证结果并回写 active plan。

## Workspace Skills

- `harness-navigate`：判断根仓、子仓、模块和实现入口。
- `harness-draft`：把轻 draft 逐步整理为可确认 draft。
- `harness-generated`：刷新并复核 generated 导航索引。
- `harness-design`：处理需要设计确认的页面设计稿、`prototypes[]`、截图、确认和 component map。
- `harness-plan`：从 draft/design/generated 生成 spec 和 active plan。
- `harness-run`：按 active plan 执行、验证、回写验证结果。
- `harness-check`：运行 docs/draft/design/plan/architecture/taste/stale-docs/all 检查。

## Workspace Subagents

- 简单单文件、小风险任务由 main agent 直接做，不默认启动 subagent。
- `harness_repo_mapper`：只读边界探索。
- `harness_generated_reviewer`：只读复核 generated 与源码是否一致。
- `harness_doc_normalizer`：只整理已确认口径，不做产品判断。
- `harness_backend_data_worker` 与 `harness_frontend_ui_worker` 可并行，前提是 `owned_write_set` 完全互斥。
- `harness_integration_worker` 默认串行收口；`harness_runtime_verifier` 永远最后验证。
- 可写 subagent 必须拿到 task packet，且同一文件只能有一个 owner。

## 硬规则

- 不要把 generated 当事实源；事实以源码、运行态、测试和用户确认结果为准。
- 所有用户可见页面、弹窗、空态、按钮、表头、提示、导入导出结果都不得出现代码注释式、占位式、开发提示式或未清理备注式文案。
- 新业务模块默认考虑权限、租户/组织隔离、审计、导入导出和错误处理；不适用时在 spec/plan 中说明。
- 收尾或暂停时必须输出且只输出一条 `WORK_STATUS: <status>` 行。

## 状态约定

- `done`
- `continue_autonomously`
- `needs_user_decision`
- `needs_credentials`
- `needs_manual_app_step`
- `blocked_external`
