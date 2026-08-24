# Workflow Artifacts

本文件解释 harness 中每个产物“为什么存在、谁读取、什么时候通过”。

## 总体规则

- 每个产物都应该回答一个明确问题；回答不了就不应该成为 gate。
- Gate 只拦真正会造成返工或错误实施的点，例如需要设计确认的页面未确认、draft 仍有关键决策、验证结果未写回 active plan。
- `generated` 和截图都是导航或验证记录，不是业务事实源；业务事实仍以源码、运行态、测试和用户确认结果为准。

## Draft

`docs/drafts/<slug>.md` 解决“当前到底要做什么、哪些还没想清楚”。Draft 阶段可以多轮讨论业务，也可以讨论页面设计方向，但不生成正式设计产物。

## Design Gate

本节只在项目启用 Design 模块时生成。需要设计确认的页面产物只能在 draft 确认后生成，并且必须早于 product spec / active exec plan。

- `docs/design-docs/<slug>/DESIGN.md`：设计说明、prototype mode、`prototypes[]` 原型索引、截图清单和 gate 状态。
- `prototypes/*.html`：页面设计稿预览和视觉确认材料；单页面也是 `prototypes[]` 中只有一个页面项。
- `visual-directions/`：当前可用图像生成能力产出的视觉方向探索，只用于 image/hybrid；能力不可用时退化为 HTML 原型或记录人工步骤。
- `screenshots/`：人工确认材料；按页面 id 分目录存放。
- `component-maps/*.md`：原型到真实组件、API、状态和权限的 handoff；单页和多页都按页面 id 拆分。
- `handoff/*.md`：给实现 agent / 开发者读的设计到实现说明；属于模型生成的实现上下文，不是用户批准源。
- `handoff/*.design.json`：给大模型读的结构化上下文；必须有 `meta.authority: implementation_context`、reviewStatus、sourceRefs 和 deviationPolicy，业务字段按页面需要扩展或留空。

## Spec / Plan

Product spec 回答“做什么和做到什么程度”；active exec plan 回答“按什么顺序做、在哪里做、怎么证明做完”。

## Run / Verification

设计确认截图保留在 `docs/design-docs/<slug>/screenshots/`。实施后的浏览器截图、DOM snapshot、console/network log、SQL 日志和接口返回 JSON 放入 `docs/validation/<slug>/<YYYY-MM-DD>/`。Run closeout 把测试命令、结果摘要、证据路径、未覆盖风险和 generated refresh/review 写回 active plan。
