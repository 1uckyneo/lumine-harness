# AGENTS.md - {{project_name}} 入口约定

## 适用范围

- 本文件约束当前 harness 根：`{{target_root}}`。
- `{{implementation_surface}}`
- 业务代码、业务验证和业务 Git 操作默认在实际 implementation surface 内执行；根级 harness 负责 docs、公共 skills、通用 `.harness` Core、产品薄 Adapter、generated 索引和 worker 协调规则。

## 上下文地图

以下路径是可选上下文入口，按当前任务需要选择读取。

- `README.md`：人类总览、项目使用说明、常用命令入口。
- `ARCHITECTURE.md`：仓库形态、目录地图、实现路径、业务域、运行面和架构不变量。
- `docs/workflow-artifacts.md`：draft、design、product spec、exec plan、generated、验证记录等产物语义。
- `docs/drafts/index.md`：draft 多轮优化、设计方向讨论、设计稿生成和 plan handoff 的自然语言提示词。
- `docs/design-docs/index.md`、`docs/design-docs/core-beliefs.md`、`docs/design-docs/design-gate.md`：设计确认、HTML 原型、图像生成视觉探索、页面 taste 和 design gate。
- `docs/FRONTEND.md`：页面 taste、用户可见文案和 UI 实现约束。
- `docs/generated/index.md`、`docs/generated/*.md`：静态扫描加模型复核后的导航索引；只辅助定位，不替代源码、测试或运行态验证。
- `.agents/skills/lumine-harness-*/SKILL.md`：draft、generated、design、plan、run、check 等项目 Harness 执行规则。
- `.harness/cli`、`.harness/check.mjs`、`.harness/generated.mjs`：通用 harness 命令、硬检查和 generated refresh 实现。
- `.harness/root.json`、`.harness/core/`、`.harness/adapter-capabilities.json`：公共根标记、生命周期 Core 与产品能力声明。
- `.harness/adapters/`：产品薄 Adapter；公共规则和 Skills 不放入产品目录。
- `{{repo_rules_entry}}`：进入业务实现时的真实规则来源。

## 实现入口速查

{{directory_map}}

## 事实索引目标

{{fact_index_targets}}

如果根级摘要与具体业务仓/模块规则冲突，真实业务实现阶段以目标源码、运行态、测试和目标仓自身规则为准。

## 快速路由原则

- 根级 harness 资产包括：`AGENTS.md`、`ARCHITECTURE.md`、`.harness/`、`.agents/`、所选产品 Adapter 入口和 `docs/`。
- 业务实现先按“实现入口速查”定位；更细模块、业务域和跨端实现路径看 `ARCHITECTURE.md`。
- 涉及不熟悉模块时，先刷新/读取 `docs/generated/**`，再回到源码确认。

## Harness Workflow

### 唯一公共入口与阶段 Skill

- 根 `AGENTS.md` 是所有 Agent 的唯一公共工程指令入口；不要生成产品 Rules。
- `.agents/skills` 是唯一 Skill 真源；禁止创建 `.qoder/skills`、`.trae/skills`、`.kimi-code/skills` 或其他产品副本。
- 项目 Harness 阶段 Skill 固定使用 `lumine-harness-*` 前缀，不生成无前缀 `harness-*` 副本。
- 进入阶段前必须实际读取对应文件：
  - Draft：`.agents/skills/lumine-harness-draft/SKILL.md`
  - Design：`.agents/skills/lumine-harness-design/SKILL.md`
  - Product Spec / Exec Plan：`.agents/skills/lumine-harness-plan/SKILL.md`
  - Run：`.agents/skills/lumine-harness-run/SKILL.md`
  - Generated：`.agents/skills/lumine-harness-generated/SKILL.md`
  - Check：`.agents/skills/lumine-harness-check/SKILL.md`
  - Navigate：`.agents/skills/lumine-harness-navigate/SKILL.md`
- 从包含 `.harness/root.json` 的 Harness 根启动 Agent；从子仓独立启动时先要求用户打开父级 workspace。

- 新 draft 直接写在 `docs/drafts/<slug>.md`。
- draft 可多轮优化；用户确认前只更新 draft，不生成 product spec 或 active exec plan。
- 用户可以多轮补充 draft，也可以只讨论页面设计方向；设计方向讨论只写回 draft，不生成正式设计稿。
- 提示词只使用自然语言，不暴露 `L2`、`ui_impact` 或 `prototype_mode`；这些是内部字段。
- 用户确认 draft 可以进入下一步后，由 agent 判断：不需要设计确认的事项进入 spec/plan；需要先看页面效果的事项进入 `lumine-harness-design`。
- 需要设计确认的页面事项必须先完成页面级 `DESIGN.md` 的 `design_status: approved`，并具备 `prototypes[]` HTML / hybrid handoff、`handoff/*.md` 和 `handoff/*.design.json`，再生成 product spec / active exec plan 或触碰真实页面代码。
- 设计稿可以多轮修改；只有用户确认设计稿后，才基于 draft 与 approved design 生成 product spec / active exec plan。
- product spec 放在 `docs/product-specs/<slug>.md`；active exec plan 放在 `docs/exec-plans/active/<slug>.md`；completed exec plan 放在 `docs/exec-plans/completed/<slug>.md`。
- 需要仓库事实导航时使用 `lumine-harness-generated`；generated 不能替代源码、运行态验证、测试或验证记录。
- 实施验证证据放在 `docs/validation/<slug>/<YYYY-MM-DD>/`；active exec plan 写验证摘要、证据路径、DOM、console 或 network 摘要，没有验证记录时不得声称验证通过。
- `lumine-harness-run` 收尾默认刷新并复核受影响 generated、记录验证结果并回写 active plan。
- 不能从最后一条助手消息读取状态的宿主，结束前执行 `./.harness/cli work-status <status> --product <product>`。

### Product Adapters

- Codex：SessionStart 与 Stop Gate。
- Qoder：`UserPromptSubmit` 上下文注入、公共 Skill 实际读取门禁和 Stop Gate；不是原生 Skill 列表集成。
- Trae：SessionStart 与 Stop Gate；产品设置中的 AGENTS、共享 Skills 和 Hooks 开关需要人工确认。
- Kimi Code：用户级 Hook 由显式安装器配置，不使用 Plugin；Hooks fail-open。
- Cursor：SessionStart、响应缓存和 Stop follow-up；需要 Workspace Trust。
- OpenCode：只补充上下文、工具、压缩和 idle 审计；当前没有等价 Stop Gate。
- ZCode：根 `AGENTS.md` 原生可读；公共 Skills 通过 Hook-only 本地 Marketplace Plugin 路由并审计实际文件读取，项目级 Hook 配置不会执行。
- DeepSeek Harness：原生读取根 `AGENTS.md` 与项目 `.agents/skills`；通过本地 profile bundle 对接官方 Codex Hook bridge，当前保持 developer-preview 与 partial 能力声明。

## Workspace Skills

- `lumine-harness-navigate`：判断根仓、子仓、模块和实现入口。
- `lumine-harness-draft`：把轻 draft 逐步整理为可确认 draft。
- `lumine-harness-generated`：刷新并复核 generated 导航索引。
- `lumine-harness-design`：处理需要设计确认的页面设计稿、`prototypes[]`、截图、component map、handoff 和确认。
- `lumine-harness-plan`：从 draft/design/generated 生成 spec 和 active plan。
- `lumine-harness-run`：按 active plan 执行、验证、回写验证结果。
- `lumine-harness-check`：运行 docs/draft/design/plan/architecture/taste/stale-docs/all 检查。

## Parallel Workers

- 根据实际任务复杂度、风险、并行收益和验证需要，main agent 自行决定是否开启 parallel worker，不需要等待用户显式要求。
- worker 不绑定具体 agent 产品；确实适合拆分时按任务组织只读或可写 task packet。
- 需求同时涉及后端、前端、SQL、文档、generated、运行态验证等互相独立工作面时，可以拆给不同 worker。
- 不清楚仓库 owner、实现入口或 generated 是否可信时，先启动只读 mapper/reviewer，而不是直接写代码。
- 实施完成前需要独立复核 UI、运行态、generated、权限或安全边界时，优先使用只读 verifier/reviewer。
- 启动多个可写 worker 前必须明确 task packet、owned_write_set、验收命令和回写边界。
- mapper worker：只读边界探索。
- reviewer worker：只读复核 generated 与源码是否一致。
- doc normalizer worker：只整理已确认口径，不做产品判断。
- backend/data worker 与 frontend/UI worker 可并行，前提是 `owned_write_set` 完全互斥。
- integration worker 默认串行收口；runtime verifier 永远最后验证。
- 可写 worker 必须拿到 task packet，且同一文件只能有一个 owner。

## 硬规则

- 不要把 generated 当事实源；事实以源码、运行态、测试和用户确认结果为准。
- 所有用户可见页面、弹窗、空态、按钮、表头、提示、导入导出结果都不得出现代码注释式、占位式、开发提示式或未清理备注式文案。
- 新业务模块默认考虑权限、租户/组织隔离、审计、导入导出和错误处理；不适用时在 spec/plan 中说明。
- 收尾或暂停时必须输出且只输出一条 `WORK_STATUS: <status>` 行。

## 状态约定

`WORK_STATUS` 是机器状态码，不是由 skill 自动决定。公共 `.harness/core/stop-policy.mjs` 解析状态，各产品薄 Adapter 只负责把宿主输入输出转换为公共决策。状态码保持英文是为了脚本稳定，文档必须给中文解释。

- `done`（已完成）：本轮目标已完成，或当前能做的工作都已收口；hook 不再触发自动续跑。
- `continue_autonomously`（可以自动继续）：下一步明确、无需用户输入，允许具备 Stop Gate 的宿主最多再自动继续一轮；下一轮结束仍必须重新输出状态。
- `needs_user_decision`（需要用户决策）：存在业务或技术取舍，agent 不能安全替用户决定；暂停时只问一个明确问题，并给推荐方案。
- `needs_credentials`（需要凭据）：缺少密码、Token、API key、Cookie、验证码、登录授权等材料；没有这些不能继续。
- `needs_manual_app_step`（需要人工操作）：需要用户在外部应用、浏览器、管理后台、Gitee、微信、WPS 等界面手工完成一步。
- `blocked_external`（外部阻塞）：外部服务、远程仓库、网络、依赖系统或运行环境不可用，且当前没有安全的本地绕过方式。
