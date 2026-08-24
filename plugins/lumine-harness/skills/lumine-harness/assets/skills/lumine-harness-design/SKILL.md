---
name: lumine-harness-design
description: 为需要设计确认的页面事项生成、修改和确认页面级 DESIGN.md、prototypes[] HTML 原型、图像生成视觉方向图、截图、component map、handoff 和 design_data；用于 draft 已确认后、product spec/exec plan 之前。
---

# Harness Design

## 使用流程

1. 读取 `AGENTS.md`；再读取项目已经启用并实际存在的 `docs/FRONTEND.md`、`docs/design-docs/core-beliefs.md` 和 `docs/design-docs/index.md`。缺少可选设计模块时先返回明确的采用或人工步骤，不能假定所有项目都有这些文件。
2. 读取已确认 draft。
3. 只在 draft 已确认且需要设计确认时创建或更新 `docs/design-docs/<slug>/`。
4. 默认 `prototype_mode: html`；风格不明确或客户高审美时使用 `hybrid`；只探索视觉时可临时 `image`。
5. `html` 产出 `DESIGN.md`、`prototypes/*.html`、`component-maps/*.md`、`handoff/*.md`、`handoff/*.design.json` 和截图；所有页面都必须在 `DESIGN.md` 的 `prototypes[]` 中逐页登记 `id`、`title`、`app_route`、`prototype`、`component_map`、`handoff`、`design_data` 和 `screenshots`。
6. `hybrid` 在当前宿主具备图像生成能力时先产出 1-3 张视觉方向图，用户选定后再补 `prototypes[]` HTML、component map、handoff 和 design_data；能力不可用时退化为 `html`，或记录明确的人工补充步骤。
7. 设计稿可多轮修改；用户确认前不生成 spec/plan。

## Gate

- `design_status: approved` 是进入真实页面实现的 gate。
- `image` 不能直接 approved 作为实现输入。
- 截图路径由 `prototypes[].screenshots` 决定；实现交接说明由 `prototypes[].handoff` 和 `prototypes[].design_data` 决定。
- `handoff` 和 `design_data` 是 agent 生成的实现上下文，不是用户批准源；冲突时以 `DESIGN.md`、HTML 原型和截图为准。
- `design_data` 至少包含 `meta.authority: implementation_context`、reviewStatus、sourceRefs 和 deviationPolicy；业务字段可按页面需要扩展或留空。
- 设计稿确认时，`approved_scope` 必须说明批准的是全部页面还是指定页面；单页面就是只批准一个页面项。
