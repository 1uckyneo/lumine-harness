# Design Gate

## 内部等级

- `L0`：不涉及 UI。
- `L1`：小 UI 改动，不需要单独设计稿。
- `L2`：需要先生成设计稿并人工确认。

这些等级由当前模型判断、由 Agent 写回和维护，不要求用户在提示词里使用。

## 通过条件

- 页面级 `DESIGN.md` 包含 `design_status: approved`。
- `prototype_mode: html` 有 `prototypes[]`，且每个页面都有 HTML、component map、handoff、design_data 和截图。
- `handoff` 和 `design_data` 是模型生成的实现上下文，不是用户批准源；冲突时以 `DESIGN.md`、HTML 原型和截图为准。
- `design_data` 必须包含 `meta.authority: implementation_context`、reviewStatus、sourceRefs 和 deviationPolicy；业务字段可按页面需要扩展或留空。
- `prototype_mode: hybrid` 还必须有视觉方向图和 `selected_visual_direction`。
- `prototype_mode: image` 只能作为探索态，不能直接进入 implementation。
- `approved_scope` 必须说明批准的是全部页面还是指定页面；真实实现只能覆盖已批准页面。
