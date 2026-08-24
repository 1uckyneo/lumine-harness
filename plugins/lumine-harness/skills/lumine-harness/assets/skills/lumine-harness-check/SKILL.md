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
- `docs` 检查核心文件、`.harness` 资产、skills、generated metadata、pending review、截断残留和旧 workflow 残留；可选模块只在项目清单启用时检查。
- `docs` 检查目标 `AGENTS.md` 是否保持宿主中立，不包含产品兼容矩阵、产品条件命令或绝对本机路径。
- `docs` 检查 `WORK_STATUS` 六种状态是否都有项目可理解的解释；具体宿主命令不得写进目标 `AGENTS.md`。
- `docs` 检查 `.agents/skills` 是唯一 Skill 内容真源，产品目录不存在 Rules、Skill 正文副本或 Skill 投影。
- `design` 检查页面级 `DESIGN.md`、prototype mode、approved、`prototypes[]`、component map、handoff、design_data 和截图。
- `design_data` 只校验 JSON 可解析、`meta.authority` 不是 approval source，并包含 reviewStatus、sourceRefs、deviationPolicy；不强制完整业务字段。
- `architecture` 检查 `ARCHITECTURE.md` 是否包含中文架构章节：仓库形态、目录地图、实现路径、架构不变量；旧英文标题仅为迁移兼容。
- `architecture` 不允许 `ARCHITECTURE.md` 出现“上下文入口”章节；上下文导航应放在 `AGENTS.md`。
- `taste` 扫描明显占位/开发提示文案，包括 `prototypes/**/*.html`。
