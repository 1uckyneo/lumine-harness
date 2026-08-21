# Harness Contract

目标仓库采用后的核心目录：

```text
AGENTS.md
ARCHITECTURE.md
docs/
  drafts/
  design-docs/
    index.md
    core-beliefs.md
    design-gate.md
  product-specs/
  exec-plans/
    active/
    completed/
    tech-debt-tracker.md
  validation/
  generated/
  references/
  templates/
  FRONTEND.md
  workflow-artifacts.md
.agents/skills/lumine-harness-*/
.harness/
  root.json
  adapter-capabilities.json
  cli
  core/
  adapter-manager.mjs
  check.mjs
  generated.mjs
  tests/
  adapters/
.codex/hooks.json
.qoder/settings.json        # when selected
.trae/hooks.json            # when selected
.cursor/hooks.json          # when selected
.opencode/plugins/harness.mjs # when selected; partial compatibility
.harness/adapters/zcode/marketplace/ # when selected; install manually in ZCode
.harness/adapters/deepseek-harness/bundle/ # when selected; install into a DSH profile
```

## Workflow

```text
draft 多轮优化
-> 可选设计方向讨论
-> draft 确认
-> 需要设计确认时生成/修改/确认设计稿
-> product spec
-> active exec plan
-> run
-> validation closeout 写回 active plan
-> completed
```

用户侧提示词保持自然语言：

- `这个 draft 需要优化。你看我还需要交代什么上下文？还有什么决策点需要确认？`
- `我补充一下：…… 你继续帮我更新 draft，并告诉我还缺什么。`
- `我们先讨论页面设计方向。先只更新 draft，不生成设计稿。`
- `这个 draft 可以进入下一步。`
- `基于这个 draft 生成设计稿，先不要生成 spec/plan。`
- `设计稿确认，可以基于 draft 和设计生成 product spec 和 active exec plan，先不要实施。`
- `按这个 active exec plan 开始实施。`

## Design Gate

- 内部 `ui_impact`：`L0 | L1 | L2`。
- 内部 `prototype_mode`：`html | image | hybrid`。
- 用户不需要说这些字段。
- 需要设计确认的页面必须在 draft 确认后、spec/plan 前生成正式设计产物。
- 进入实现必须有 approved 页面级 `DESIGN.md`、`prototypes[]`、`handoff/*.md` 和 `handoff/*.design.json`；单页面也是数组里只有一个页面项。
- 每个 `prototypes[]` 页面项必须包含 `id`、`title`、`app_route`、`prototype`、`component_map`、`handoff`、`design_data` 和 `screenshots`。
- `handoff/*.md` 和 `handoff/*.design.json` 是模型生成的实现上下文，不是用户批准源；冲突时以 `DESIGN.md`、HTML 原型和截图为准。
- `handoff/*.design.json` 必须包含 `meta.authority: implementation_context`、reviewStatus、sourceRefs 和 deviationPolicy；业务字段可按页面需要扩展或留空。
- `visual-directions/` 只用于 `image` / `hybrid` 的视觉方向探索，不是旧 harness 兼容目录。
- `image` 只能探索视觉方向；进入实现必须转成 `html` 或 `hybrid` 的 `prototypes[]` handoff。

## Status

收尾或暂停只输出一条：

- `WORK_STATUS: done`
- `WORK_STATUS: continue_autonomously`
- `WORK_STATUS: needs_user_decision`
- `WORK_STATUS: needs_credentials`
- `WORK_STATUS: needs_manual_app_step`
- `WORK_STATUS: blocked_external`

## Shared Instructions And Skills

- 根 `AGENTS.md` 是唯一公共工程指令入口。
- `.agents/skills` 是唯一 Skill 真源。
- 项目 Harness 阶段 Skill 固定使用 `lumine-harness-*` 前缀。
- 不生成产品 Rules，也不生成 `.qoder/skills`、`.trae/skills`、`.kimi-code/skills` 等副本。
- Draft、Design、Product Spec / Exec Plan、Run、Generated、Check、Navigate 开始前必须实际读取对应公共 `SKILL.md`。
- `.harness/root.json` 决定 Harness 根；最近的 Git 根不能替代它。

## Adapter Capability

- Codex：SessionStart 与 Stop Gate。
- Qoder：`UserPromptSubmit` 上下文回退、Skill 实际读取门禁、Stop Gate；公共 Skill 不进入其原生列表。
- Trae：SessionStart 与 Stop Gate；AGENTS、共享 Skills 和 Hooks 开关需要人工启用。
- Kimi Code：根 AGENTS / `.agents/skills` + 用户级 Hook 安装器；Hooks fail-open，不是唯一安全门。
- Cursor：SessionStart、`afterAgentResponse`、Stop follow-up；需要 Workspace Trust。
- OpenCode：上下文、工具、压缩和 idle 审计；当前 `stopGate: unsupported`，不得用 `session.idle` 伪造。
- ZCode：Hook-only 本地 Marketplace Plugin 提供 SessionStart、阶段读取门禁与 Stop；项目级 Hook 当前不执行，`.agents/skills` 不进入其原生 Skill 列表。
- DeepSeek Harness：原生 AGENTS/Skills + 官方 Codex Hook bridge；宿主/bridge 锁定 `0.1.0-rc.7`，SessionStart 与 Stop 为 partial，整体为 developer-preview。

## Validation

设计确认截图保留在 `docs/design-docs/<slug>/screenshots/`。实施后的运行证据统一放入 `docs/validation/<slug>/<YYYY-MM-DD>/`，包括浏览器截图、DOM snapshot、console/network log、SQL 日志和接口返回 JSON。active exec plan 写验证摘要、命令、结果、未覆盖风险和证据链接，不承载大量证据文件。
