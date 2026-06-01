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
.agents/skills/harness-*/
.codex/agents/harness_*.toml
.codex/hooks/
.codex/tests/
harness
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
- 进入实现必须有 approved 页面级 `DESIGN.md` 和 `prototypes[]` handoff；单页面也是数组里只有一个页面项。
- 每个 `prototypes[]` 页面项必须包含 `id`、`title`、`app_route`、`prototype`、`component_map` 和 `screenshots`。
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

## Validation

设计确认截图保留在 `docs/design-docs/<slug>/screenshots/`。实施后的运行证据统一放入 `docs/validation/<slug>/<YYYY-MM-DD>/`，包括浏览器截图、DOM snapshot、console/network log、SQL 日志和接口返回 JSON。active exec plan 写验证摘要、命令、结果、未覆盖风险和证据链接，不承载大量证据文件。
