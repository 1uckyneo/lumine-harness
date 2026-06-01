---
name: harness-design
description: 为需要设计确认的页面事项生成、修改和确认页面级 DESIGN.md、prototypes[] HTML 原型、GPT-IMAGE-2 视觉方向图、截图和 component map；用于 draft 已确认后、product spec/exec plan 之前。
---

# Harness Design

## 使用流程

1. 读取 `AGENTS.md`、`docs/FRONTEND.md`、`docs/design-docs/core-beliefs.md`、`docs/design-docs/index.md`。
2. 读取已确认 draft。
3. 只在 draft 已确认且需要设计确认时创建或更新 `docs/design-docs/<slug>/`。
4. 默认 `prototype_mode: html`；风格不明确或客户高审美时使用 `hybrid`；只探索视觉时可临时 `image`。
5. `html` 产出 `DESIGN.md`、`prototypes/*.html`、`component-maps/*.md` 和截图；所有页面都必须在 `DESIGN.md` 的 `prototypes[]` 中逐页登记 `id`、`title`、`app_route`、`prototype`、`component_map` 和 `screenshots`。
6. `hybrid` 先产出 1-3 张 GPT-IMAGE-2 方向图，用户选定后再补 `prototypes[]` HTML handoff。
7. 设计稿可多轮修改；用户确认前不生成 spec/plan。

## Gate

- `design_status: approved` 是进入真实页面实现的 gate。
- `image` 不能直接 approved 作为实现输入。
- 截图路径由 `prototypes[].screenshots` 决定。
- 设计稿确认时，`approved_scope` 必须说明批准的是全部页面还是指定页面；单页面就是只批准一个页面项。
