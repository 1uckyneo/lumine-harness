---
name: lumine-harness-draft
description: 多轮优化 docs/drafts/<slug>.md 中的轻量 draft，澄清上下文、决策点、验收和可选页面设计方向；尚未进入正式设计、product spec 或 exec plan 时使用。
---

# Harness Draft

## 使用流程

1. 读取 `AGENTS.md` 和 `docs/drafts/index.md`。
2. 读取当前 draft；新 draft 默认在 `docs/drafts/<slug>.md`。
3. 保留用户原意，在 `初始诉求` 或 `原始输入摘录` 中留下原话或摘要。
4. 每轮维护：`当前理解`、`待补上下文`、`待确认决策`、`UI 影响`、`设计方向草案`、`验收标准草案`、`下一轮建议提示词`。
5. 直接写回同一个 draft 文件，不生成 confirmed draft 副本。
6. 用户确认 draft 可进入下一步后，由当前模型结合上下文判断进入 design 还是 spec/plan，Agent 按阶段约定执行。

## 规则

- 不从粗 draft 直接生成 product spec 或 active exec plan。
- Draft 阶段可以讨论页面设计方向，但不生成 `DESIGN.md`、HTML、图片、spec 或 plan。
- 用户不需要说 `L2`、`ui_impact` 或 `prototype_mode`。
