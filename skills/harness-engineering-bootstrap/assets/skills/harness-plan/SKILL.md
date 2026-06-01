---
name: harness-plan
description: 从已确认 draft、generated 索引和可选 approved design 生成或更新 docs/product-specs/<slug>.md 与 docs/exec-plans/active/<slug>.md；只做 planning handoff，不执行实现。
---

# Harness Plan

## 使用流程

1. 读取 `AGENTS.md` 和 `docs/workflow-artifacts.md`；需要架构边界时读 `ARCHITECTURE.md`。
2. 读取 ready draft。
3. draft 仍有待确认决策时停止回到 `harness-draft`。
4. 需要设计确认但 `DESIGN.md` 未 approved，或已批准页面没有完整 `prototypes[]` 时，停止回到 `harness-design`。
5. 使用 `harness-generated` 刷新并复核任务相关索引。
6. 创建或更新 product spec 和 active exec plan。
7. 除非用户明确要求 implementation，否则停在 planning handoff。

## Exec Plan 必须包含

- 进度、决策记录、意外与发现、任务清单、验证与验收、Run Closeout、结果与复盘、归档判断。
- 需要设计确认时链接 `DESIGN.md`，并列出 `prototypes[]` 中已批准页面的 prototype、screenshots 和 component map；按页面拆分实施和验收。
- 写清 generated refresh/review 状态和 run 后需刷新的 targets。
