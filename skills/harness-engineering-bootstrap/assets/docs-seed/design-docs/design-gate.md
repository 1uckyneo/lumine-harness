# Design Gate

## 内部等级

- `L0`：不涉及 UI。
- `L1`：小 UI 改动，不需要单独设计稿。
- `L2`：需要先生成设计稿并人工确认。

这些等级由 Codex 维护，不要求用户在提示词里使用。

## 通过条件

- 页面级 `DESIGN.md` 包含 `design_status: approved`。
- `prototype_mode: html` 有 `prototypes[]`，且每个页面都有 HTML、component map 和截图。
- `prototype_mode: hybrid` 还必须有视觉方向图和 `selected_visual_direction`。
- `prototype_mode: image` 只能作为探索态，不能直接进入 implementation。
- `approved_scope` 必须说明批准的是全部页面还是指定页面；真实实现只能覆盖已批准页面。
