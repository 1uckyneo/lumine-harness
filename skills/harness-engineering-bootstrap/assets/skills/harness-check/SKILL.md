---
name: harness-check
description: 运行 harness 硬检查，包括 docs、draft、design gate、active plan、architecture、taste、generated freshness、stale docs 和 all；用于 hooks、收尾验证、迁移后验证或排查阻断原因。
---

# Harness Check

## 命令

```bash
./harness check <docs|draft|design|plan|architecture|taste|stale-docs|all> [target]
```

## 规则

- 失败信息必须包含 remediation。
- profile 不适用的 target 应标为 not applicable。
- `docs` 检查核心文件、skills、subagent lanes、generated metadata、pending review、截断残留和旧 workflow 残留。
- `design` 检查页面级 `DESIGN.md`、prototype mode、approved、`prototypes[]`、component map 和截图。
- `taste` 扫描明显占位/开发提示文案，包括 `prototypes/**/*.html`。
