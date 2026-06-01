# Migration Policy

新 bootstrap 的默认目标是采用这套 harness。已有冲突 AI workflow 可以被迁移掉，不再与新 harness 并行触发。

## 写入前

- 先审计 `git status --short`。
- 有 git：依靠 git diff 回看被替换内容。
- 无 git：覆盖前把被替换的 `AGENTS.md`、`.codex/`、`.agents/skills/harness-*`、冲突 hooks 和冲突 agent 文件备份到 `.codex/local/harness-backup/<timestamp>/`。

## AGENTS.md

- 目标形态是“上下文地图 + 主要目录速查 + 事实索引目标 + 快速路由 + harness workflow + skills/subagents + 硬规则 + 状态约定”。
- 不使用旧式包裹块。
- 旧内容中仍有效的项目事实、业务硬规则、启动命令、关键目录说明要迁移进新结构。
- 旧 AI 流程、旧 draft/spec/plan 口径、旧强加载顺序、与新 harness 冲突的规则要删除或改写。

## Skills / Hooks / Agents

- `harness-*` workspace skills 以新模板为准。
- 旧 workspace 前缀 skill、旧 draft planner lane、旧 implementation worker lane、旧 verifier lane 替换为通用 lanes。
- 非冲突的项目业务 skills 可以保留，并在 AGENTS 地图中索引。
- `.codex/hooks.json`、hooks 脚本和 tests 以新模板为准；不保留会重复注入旧流程的 hook。

## Non-Codex Surfaces

- `CLAUDE.md`、`.claude/skills`、`.claude/docs` 默认作为索引目标，不改写。
- 只有用户明确要求多 agent 统一迁移时，才改写非 Codex agent 文件。

## Fail Closed

以下情况暂停并报告一个明确问题：

- 目标没有 git，且备份目录无法创建。
- 旧 AGENTS 含有业务安全/合规硬规则，但无法判断如何迁移。
- 现有 docs 中 specs/plans 与新 contract 同名但语义冲突，且自动迁移会丢失内容。
- hooks 或 scripts 涉及外部秘密、生产部署或破坏性操作，无法判断是否安全替换。
