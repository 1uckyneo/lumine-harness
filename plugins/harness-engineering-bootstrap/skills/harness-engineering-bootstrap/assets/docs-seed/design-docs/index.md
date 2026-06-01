# Design Docs

`docs/design-docs/` 用于需要设计确认的页面设计信念、HTML 原型、GPT-IMAGE-2 视觉方向探索和 design gate。

正式设计产物只能在 draft 确认后、product spec / active exec plan 之前生成。

每个任务目录：

```text
docs/design-docs/<slug>/
  DESIGN.md
  visual-directions/
  prototypes/
  component-maps/
  screenshots/<page-id>/
```

所有 HTML handoff 都使用 `DESIGN.md` 的 `prototypes[]`。单页面任务就是数组里只有一个页面项，目录里只有一个 HTML、一个 component map 和对应截图。每个页面项必须记录 `id`、`title`、`app_route`、`prototype`、`component_map` 和 `screenshots`。

页面级 `DESIGN.md` 未 `design_status: approved` 前不得进入真实页面实现。
