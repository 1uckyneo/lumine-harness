# Migration Policy

Lumine Harness 的采用与升级都必须先检查、再提案、最后按批准范围写入。已有冲突 AI workflow 可以迁移，但不能以“目标有 Git”为理由覆盖尚未提交或不可恢复的内容。

## 写入前

- 先审计 tracked、staged、untracked、嵌套 Git 和 worktree 状态。
- Migration Proposal 列出精确 write set、冲突、备份方案和唯一 Proposal ID；没有经用户确认的 ID 不得写入。
- 与现有工作树修改重叠时默认暂停，不自动合并、stash、reset 或覆盖。
- Git 无法恢复的未跟踪文件和非 Git 目标中被替换的内容，先备份到 `.harness/local/harness-backup/<timestamp>/`。
- Adopt 过程中发现提案外冲突时停止并重新提案。

## AGENTS.md

- 目标形态是“上下文地图 + 实现入口速查 + 事实索引目标 + 快速路由 + harness workflow + skills/parallel workers + 硬规则 + 状态约定”。
- `AGENTS.md` 只做短入口、导航和硬规则；不要写成百科。
- `ARCHITECTURE.md` 只做架构地图，包含仓库形态、目录地图、实现路径、业务域、运行面和架构不变量；不要放“上下文入口”。
- 不使用旧式包裹块。
- 旧内容中仍有效的项目事实、业务硬规则、启动命令、关键目录说明要迁移进新结构。
- 旧 AI 流程、旧 draft/spec/plan 口径、旧强加载顺序、与新 harness 冲突的规则要删除或改写。

## Skills / Harness / Adapters

- 项目 Harness Skills 以 `lumine-harness-*` 新模板为准；旧无前缀 `harness-*` 必须迁出公共 Skill 目录。
- 旧 workspace 前缀 skill、旧 draft planner lane、旧 implementation worker lane、旧 verifier lane 替换为通用 worker coordination。
- 非冲突的项目业务 skills 可以保留，并在 AGENTS 地图中索引。
- `.harness/` 承载 root marker、公共 Core、CLI、checks、generated、tests 和全部产品薄 Adapter 脚本。
- `.codex/` 只保留 `hooks.json`；不创建 `.codex/agents/`、`.codex/hooks/` 或 `.codex/tests/` 作为 harness 必备资产。
- `AGENTS.md` 和 `.agents/skills` 是唯一公共内容真源；禁止产品 Rules、Skill 正文副本和产品级 Skill 投影。不能原生发现 `.agents/skills` 的宿主由 Adapter 按需路由真实文件。
- 根据用户明确选择生成 `.codex/hooks.json`、`.qoder/settings.json`、`.trae/hooks.json`、`.cursor/hooks.json`、`.opencode/plugins/harness.mjs` 或 `.codebuddy/settings.json`；ZCode 与 DeepSeek Harness 的分发资产位于 `.harness/adapters/`，仅在被选择时报告人工安装步骤。
- Kimi Code 的 `~/.kimi-code/config.toml` 是用户环境配置，普通 Adopt 只报告安装命令，必须另行授权后才执行。

## Product Surfaces

- `CLAUDE.md`、`.claude/skills`、`.claude/docs` 默认作为索引目标，不改写。
- Qoder Hook 能力按具体产品形态和版本复核，不能长期硬编码“没有 SessionStart”；没有真实事件证据时保持 runtime pending。
- Trae 的 AGENTS / `.agents/skills` / Hooks 开关与 Cursor Workspace Trust 由 Doctor 报告为人工步骤。
- OpenCode 当前只交付部分兼容；`session.idle` 只能用于结束后审计。
- ZCode 项目级 Hook 当前不执行，不能生成 `.zcode/config.json` 冒充已安装；必须让用户在 ZCode 中安装本地 Marketplace Plugin。
- CodeBuddy 公共 Skill 使用 Adapter 路由，不生成 `.codebuddy/skills`。产品端仍需通过 `/hooks` 审核仓库配置；若 `CODEBUDDY.md` 或 `.codebuddy/CODEBUDDY.md` 存在但没有导入根 `AGENTS.md`，Doctor 必须报错而不是假定回退生效。
- DeepSeek Harness 使用原生 AGENTS/Skills 和官方 Codex Hook bridge；安装 profile bundle 属于用户环境操作，必须单独确认，并锁定经过验证的宿主/bridge 版本组合。

## Fail Closed

以下情况暂停并报告一个明确问题：

- 目标没有 git，且备份目录无法创建。
- 旧 AGENTS 含有业务安全/合规硬规则，但无法判断如何迁移。
- 现有 docs 中 specs/plans 与新 contract 同名但语义冲突，且自动迁移会丢失内容。
- hooks 或 scripts 涉及外部秘密、生产部署或破坏性操作，无法判断是否安全替换。
