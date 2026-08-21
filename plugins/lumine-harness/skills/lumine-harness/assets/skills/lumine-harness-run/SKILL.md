---
name: lumine-harness-run
description: 基于 docs/exec-plans/active/<slug>.md 执行、验证和回写验证结果；用于用户明确要求开始实施、继续 active plan、验证、收尾或归档判断。
---

# Harness Run

## 使用流程

1. 审计 Git 状态，读取 `AGENTS.md`、product spec 和 active exec plan。
2. 涉及实现路径时读取 `ARCHITECTURE.md`、generated 索引和目标源码规则。
3. 使用 `lumine-harness-generated` 刷新并复核任务相关 generated。
4. 需要设计确认的页面未 approved 前，不触碰真实页面代码；已 approved 的设计只能实施 `approved_scope` 覆盖的 `prototypes[]` 页面。
5. 在正确 implementation surface 实施。
6. 执行中回写 active plan 的进度、决策和意外发现。
7. 执行后按变更类型刷新并复核 generated。
8. 将验证命令、日志、逐页截图路径、DOM/console/network 摘要、`docs/validation/<slug>/<YYYY-MM-DD>/` 证据路径和未覆盖风险写回 active plan。
9. UI 改动必须验证无代码注释式、占位式、开发提示式或未清理备注式文案。
10. 运行 `./.harness/cli check all` 后收尾。

## Parallel Worker 调度

- 简单单文件任务 main agent 直接做。
- 不清楚边界时用只读 mapper worker。
- generated 复核可用只读 reviewer worker。
- 后端和前端 worker 可并行，write set 必须互斥。
- runtime verifier 永远最后运行。

## Design Handoff

- 实现页面前读取 approved `DESIGN.md` 的 `prototypes[]`。
- 读取 `prototypes[]`，按页面 `id`、`app_route`、HTML、component map、handoff、design_data 和截图逐项实现与验证；单页面也是数组里只有一个页面项。
