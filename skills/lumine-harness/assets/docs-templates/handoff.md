# {{title}} Design Handoff

## 本文件用途

每个 `handoff/<page-id>.md` 是给实现 agent / 开发者阅读的设计到实现说明。它通常由 agent 根据已确认设计材料生成，属于模型可读解释层，不是用户直接批准的事实源，也不替代 HTML 预览、截图、`DESIGN.md` 或 product spec。

## 权威性与冲突规则

- 用户确认源是 `DESIGN.md`、`prototypes/*.html` 和 `screenshots/`。
- 本文件和 `handoff/<page-id>.design.json` 只提供实现上下文，权威性低于用户确认源。
- 如果 handoff 与 `DESIGN.md`、HTML 原型或截图冲突，以用户确认源为准。
- 如果实现发现 handoff 缺失、不合理或与真实组件/API 能力冲突，可以修正 handoff，并在 active plan 记录偏差原因。
- handoff 约束信息层级、关键交互、状态、权限、数据依赖和验收引用，不约束最终技术实现细节。

## 来源

- DESIGN.md：
- prototype：
- component map：
- design data：
- screenshots：
- source draft：
- product spec：
- review status：generated_unreviewed

## 实现说明

- 页面目标：
- 首屏优先级：
- 主要区块：
- 关键字段：
- 关键操作：
- 权限规则：
- 数据依赖：
- 异步状态：
- 文案规则：
- 可调整范围：
- 假设：
- 未确认问题：
- 偏差处理：

## 状态与交互

- 加载：
- 空状态：
- 错误：
- 权限不可见/不可用：
- 危险操作确认：
- 批量操作：

## 通过标准

- 实现保留 `approved_scope` 内的信息层级、关键交互和状态反馈。
- 真实组件、API、权限和数据来源与 `component-maps/<page-id>.md` 对齐。
- `handoff/<page-id>.design.json` 已同步更新，结构化上下文与本文一致；业务字段允许按页面需要扩展或留空。
