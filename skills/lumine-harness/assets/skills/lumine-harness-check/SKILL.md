---
name: lumine-harness-check
description: 运行 harness 硬检查，包括 docs、draft、design gate、active plan、architecture、taste、generated freshness、stale docs 和 all；用于 hooks、收尾验证、迁移后验证或排查阻断原因。
---

# Harness Check

## 命令

```bash
./.harness/cli check <docs|draft|design|plan|architecture|taste|stale-docs|all> [target]
```

## 规则

- 失败信息必须包含 remediation。
- profile 不适用的 target 应标为 not applicable。
- `docs` 检查核心文件、`.harness` 资产、skills、worker coordination、generated metadata、pending review、截断残留和旧 workflow 残留。
- `docs` 检查 `AGENTS.md` 是否说明 parallel worker 由 main agent 按任务复杂度、风险、并行收益和验证需要决定。
- `docs` 检查 `AGENTS.md` 是否说明 worker 必须保留 task packet、owned_write_set、验收和回写边界。
- `docs` 检查 `WORK_STATUS` 是否说明 Codex adapter 由 `.harness/adapters/codex/hooks/lib/stop-gate.mjs` 消费，并为每个英文状态码提供中文解释。
- `design` 检查页面级 `DESIGN.md`、prototype mode、approved、`prototypes[]`、component map、handoff、design_data 和截图。
- `design_data` 只校验 JSON 可解析、`meta.authority` 不是 approval source，并包含 reviewStatus、sourceRefs、deviationPolicy；不强制完整业务字段。
- `architecture` 检查 `ARCHITECTURE.md` 是否包含中文架构章节：仓库形态、目录地图、实现路径、架构不变量；旧英文标题仅为迁移兼容。
- `architecture` 不允许 `ARCHITECTURE.md` 出现“上下文入口”章节；上下文导航应放在 `AGENTS.md`。
- `taste` 扫描明显占位/开发提示文案，包括 `prototypes/**/*.html`。
