---
name: lumine-harness
description: Use when adopting or migrating a single- or multi-repository project into a recoverable, constrained, and verifiable Agent engineering environment with persistent context, staged workflow artifacts, checks, and host adapters.
---

# Lumine Harness

Lumine Harness 是一套面向 Agent 的项目级工程工作流，用于将单仓或多仓 workspace 建设为可恢复、可约束、可验证的研发环境。Lumine 中文写作“[卢米安](https://weibo.com/u/3316905545)”。默认语义是 `adopt / migrate`，不是保守增量补丁。

本 skill 必须自包含：不要读取或依赖任何特定 workspace 的文件来决定模板内容。

## 触发场景

- 目标项目没有 AI workflow，需要落地 harness。
- 目标项目已有 `AGENTS.md`、skills、hooks、docs 或其他 AI workflow，但用户希望以这套 harness 为准重构。
- 目标可能是 workspace + 业务子仓，也可能是单个业务仓、纯后端、纯前端或传统项目。
- 用户希望引入 draft 多轮收敛、按需设计确认、spec/plan handoff、run closeout、generated 索引和 checks。

不用于：在已经完成迁移的 harness 内写单个 draft/spec/plan，或只做业务功能实现。

## 必读资产

- `references/target-topology.md`：拓扑和技术栈识别。
- `references/migration-policy.md`：冲突 AI workflow 的迁移与备份规则。
- `references/harness-contract.md`：目标仓库落地后的目录、文档和状态约定。
- `references/generated-and-checks.md`：generated 可信度、check 和 not applicable 规则。
- `references/worker-coordination.md`：通用 parallel worker 和冲突控制。

需要确定目标项目状态时，先运行：

```bash
scripts/inspect-target.sh <target-root>
```

需要落地默认资产时，使用 `assets/` 中模板；不要从某个已有项目复制。

## 固定流程

### Phase 1：Inspect

- 审计目标 git 状态；如果不是 git 仓库，记录 `HAS_GIT=0`。
- 识别 topology：`workspace-with-child-repos`、`single-fullstack`、`backend-only`、`frontend-only`、`library-or-cli`、`unknown-traditional`。
- 识别已有 `AGENTS.md`、`CLAUDE.md`、`CODEBUDDY.md`、`.agents/skills`、`.harness/`、Codex、Qoder、Trae、Kimi Code、Cursor、OpenCode、ZCode、CodeBuddy、DeepSeek Harness 配置、docs/spec/plan 结构和冲突 AI workflow。
- 识别技术栈信号：后端、前端、移动端、SQL、API、router/component、测试和启动命令。
- 识别可选模块：Design、Frontend、Browser、Database、Mobile 和 Worker Coordination；只有项目事实或用户目标需要时才进入提案。

### Phase 2：Migration Proposal

写入前先给出明确迁移提案：

- 检测到的 topology、证据和适配 profile。
- 将重写、创建、替换、保留、备份的文件。
- `AGENTS.md` 如何成为上下文地图，`ARCHITECTURE.md` 如何成为架构地图；上下文入口只能留在 `AGENTS.md`。
- 哪些旧 AI workflow 会被替换，哪些非冲突项目 skills/docs 会被索引保留。
- 哪些 check 对当前 profile 标记为 not applicable。
- 用户选择哪些 Agent Adapter；逐项说明完整兼容、需要人工设置或明确降级，不能把“目录存在”写成产品端已验证。
- 精确 write set、不可通过 Git 恢复的备份方案和 Proposal ID；没有经用户确认的 Proposal ID 不得进入 Adopt。

生成可审阅 Proposal 时使用：

```bash
node scripts/harness-manager.mjs proposal <target-root> --adapters <product-list|none> --output <proposal.json>
```

### Phase 3：Adopt Harness

- 将根级 `AGENTS.md` 改造为上下文地图、入口约定和硬规则，不保留并行旧主流程。
- 创建或重写 `ARCHITECTURE.md` 为架构地图，包含仓库形态、目录地图、实现路径、业务域、运行面和架构不变量；不写上下文入口。
- 补齐核心 docs contract、templates、generated docs、`.harness` Core / CLI / checks / generated refresh 和公共阶段 Skills；Design、Frontend、Browser、Database、Mobile 和 Worker Coordination 按批准的模块清单生成。
- 始终只生成根 `AGENTS.md` 与 `.agents/skills` 作为公共内容真源；不生成产品 Rules、Skill 正文副本或产品级 Skill 投影。不能原生发现 `.agents/skills` 的宿主由 Adapter 按需路由真实文件，并在首次修改前验证规范文件已经读取。
- 生成的七个项目 Harness 阶段 Skill 必须命名为 `lumine-harness-navigate`、`lumine-harness-draft`、`lumine-harness-generated`、`lumine-harness-design`、`lumine-harness-plan`、`lumine-harness-run`、`lumine-harness-check`；禁止生成旧的无前缀 `harness-*` 名称。
- 根据用户批准的产品列表生成薄 Adapter：Codex、Qoder、Trae、Cursor、CodeBuddy 使用仓库配置；OpenCode 使用明确降级的本地 Plugin；Kimi Code 只生成公共分发能力，不在普通 Adopt 中修改用户级配置；ZCode 交付 Hook-only 本地 Marketplace；DeepSeek Harness 交付锁定仓库测试版本的开发预览 profile bundle，不能据此宣称真实宿主已验证。
- 无论是否存在 Git，都不能覆盖与当前工作树修改重叠的文件。不可通过 Git 恢复的被替换文件必须先备份到 `.harness/local/harness-backup/<timestamp>/`。
- Adopt 只允许写已确认 Proposal 的精确 write set；发现新冲突时立即停止并重新提案。

用户确认 Proposal 后，必须携带原 Proposal 文件执行：

```bash
node scripts/harness-manager.mjs adopt --proposal <proposal.json>
```

已有 Lumine Harness 工程的升级也必须先计划、再应用：

```bash
node scripts/harness-manager.mjs upgrade --plan <target-root> --output <proposal.json>
node scripts/harness-manager.mjs upgrade --apply --proposal <proposal.json>
```

### Phase 4：Generate And Review Indexes

- 运行 `./.harness/cli generated refresh all`。
- 初始 `Review status: pending` 不是完成态；必须抽样源码复核并写回 review metadata。
- 禁止留下 `... N more` 这类截断索引。
- generated 只是导航索引，不替代源码、测试、运行态验证或用户确认。

### Phase 5：Run Checks

- 运行 `./.harness/cli check all`。
- profile 不适用的检查必须返回 not applicable，而不是失败。
- 如果有 Node tests，运行生成的 `.harness/tests/*.test.mjs`。
- 运行 `./.harness/cli adapter status selected` 汇总普通用户需要知道的接入状态；`adapter doctor` 只检查仓库配置、安装和缺失设置，`adapter verify` 只供真实宿主证据验证。Trae 产品设置、Kimi 用户配置、ZCode Plugin、CodeBuddy `/hooks` 审核、DeepSeek Harness profile bundle，以及 Cursor 处于受限状态时的项目授权，都必须明确报告，不能由配置文件存在推断为已生效。
- 收尾报告 topology、改动、未改动、not applicable 项、剩余人工决策点。

## 关键口径

- `AGENTS.md` 是 agent 入口地图；不要把它写成百科或固定加载顺序。
- `.agents/skills` 是唯一 Skill 内容真源；每个 Harness 阶段必须由 `AGENTS.md` 指向并实际读取对应 `SKILL.md`。Adapter 路由只定位真实文件，不生成产品级 Skill 投影。新增或修改项目 Skill 后运行 Harness Check。
- `.harness/root.json` 是 Harness 根标记；不能使用最近的 Git 根代替，Adapter 必须从父级 Harness workspace 启动。
- `ARCHITECTURE.md` 是架构地图；generated 不替代它，`AGENTS.md` 才是上下文入口地图。
- 新 draft 直接写 `docs/drafts/<slug>.md`。
- draft 可多轮优化；用户确认前只更新 draft，不生成 design/spec/plan。
- 页面设计方向可在 draft 阶段讨论，但正式设计产物只在 draft 确认后、product spec / exec plan 前生成。
- 用户不需要说 `L2`、`ui_impact` 或 `prototype_mode`；这些是内部字段。
- 需要设计确认的页面必须有 approved 页面级 `DESIGN.md`，并且 `html` 或 `hybrid` 模式具备 `prototypes[]`、`handoff/*.md` 和 `handoff/*.design.json` 后才允许实现；单页面也是 `prototypes[]` 里一个页面项。
- `visual-directions/` 只用于 `image` / `hybrid` 的视觉方向探索，不是旧 harness 兼容目录，也不能单独作为实现输入。
- run closeout 默认刷新并复核 generated，把实施验证证据放入 `docs/validation/<slug>/<YYYY-MM-DD>/`，写回 active plan 的验证摘要和证据路径，运行 checks。
- 所有用户可见 UI 文案不得出现代码注释式、占位式、开发提示式或未清理备注式文案。
- Qoder 的 Hook 能力必须按产品形态和版本复核，不能长期硬编码“没有 SessionStart”；公共 Skill 采用 Adapter 路由并接受写前读取门禁。OpenCode 当前没有等价的完整 Stop Gate，必须标记部分兼容。
- Kimi Code 用户级 Hook 安装必须单独取得授权，再运行 `./.harness/cli adapter install kimi`；不使用 Plugin，不静默写 `~/.kimi-code/config.toml`。
- ZCode 项目级 Hook 当前不会执行，必须通过 `.harness/adapters/zcode/marketplace` 安装 Hook-only Plugin；Adapter 路由公共 Skill，完整规则只从项目 `.agents/skills` 读取并审计。
- CodeBuddy 使用 `.codebuddy/settings.json` 对接生命周期；公共 Skill 由 Adapter 路由，不生成 `.codebuddy/skills`。若存在 `CODEBUDDY.md` 或 `.codebuddy/CODEBUDDY.md`，必须用正确相对路径显式导入根 `AGENTS.md`，并在新会话中通过 `/hooks` 审核配置。没有真实 Hook 日志前保持 `needs_manual_app_step`。
- DeepSeek Harness 原生读取根 `AGENTS.md` 与项目 `.agents/skills`；第一版通过官方 `@deepseek-ai/dsh-hooks-codex` 连接生命周期，锁定宿主/bridge `0.1.0-rc.7`，并明确保留 SessionStart、Stop 的 partial 与 developer-preview 边界。
- `continue_autonomously` 只表达任务仍有明确、安全且不需要新授权的下一步；`followup_message`、阻止 Stop 或宿主退出码只是发起下一轮的产品协议。同一状态发射必须幂等，后续完成新工作后可以再次声明；默认连续自治上限和停滞阈值由 `.harness/project.json` 配置。

## 输出要求

完成后汇报：

- 检测出的 topology 和 profile。
- 改了什么。
- 替换或备份了哪些旧 AI workflow。
- 哪些检查通过，哪些是 not applicable。
- 还剩哪些人工决策点。
