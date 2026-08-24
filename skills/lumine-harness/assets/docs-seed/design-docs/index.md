# Design Docs

本目录属于可选 Design 模块；只有 Migration Proposal 已启用 Design 时生成。

`docs/design-docs/` 用于需要设计确认的页面设计信念、HTML 原型、图像生成视觉方向探索和 design gate。

正式设计产物只能在 draft 确认后、product spec / active exec plan 之前生成。

每个任务目录：

```text
docs/design-docs/<slug>/
  DESIGN.md
  visual-directions/
  prototypes/
  component-maps/
  handoff/
  screenshots/<page-id>/
  assets/
```

所有 HTML handoff 都使用 `DESIGN.md` 的 `prototypes[]`。单页面任务就是数组里只有一个页面项，目录里只有一个 HTML、一个 component map、一个 handoff md、一个 design json 和对应截图。每个页面项必须记录 `id`、`title`、`app_route`、`prototype`、`component_map`、`handoff`、`design_data` 和 `screenshots`。

用户确认源是 `DESIGN.md`、`prototypes/*.html` 和截图；`component-maps/`、`handoff/` 和 `handoff/*.design.json` 是实现上下文，冲突时不能覆盖用户确认源。

页面级 `DESIGN.md` 未 `design_status: approved` 前不得进入真实页面实现。
