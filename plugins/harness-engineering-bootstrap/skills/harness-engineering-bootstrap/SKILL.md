---
name: harness-engineering-bootstrap
description: 当需要把陌生 workspace、单仓、前后端多端仓、纯后端、纯前端或传统项目迁移到当前 harness engineering 工作流时使用；会以 AGENTS.md 上下文地图、ARCHITECTURE.md 架构地图、draft/design/spec/plan/run、generated、checks、hooks、subagents 为基准重构目标仓库的 AI 驱动流程。
---

# Harness Engineering Bootstrap

用这个 skill 把目标仓库采用为一套完整 harness 工作流。默认语义是 `adopt / migrate`，不是保守增量补丁。

本 skill 必须自包含：不要读取或依赖任何特定 workspace 的文件来决定模板内容。

## 触发场景

- 目标项目没有 AI workflow，需要落地 harness。
- 目标项目已有 `AGENTS.md`、skills、hooks、docs 或其他 AI workflow，但用户希望以这套 harness 为准重构。
- 目标可能是 workspace + 业务子仓，也可能是单个业务仓、纯后端、纯前端或传统项目。
- 用户希望引入 draft 多轮收敛、设计确认、spec/plan handoff、run closeout、generated 索引、checks、subagents。

不用于：在已经完成迁移的 harness 内写单个 draft/spec/plan，或只做业务功能实现。

## 必读资产

- `references/target-topology.md`：拓扑和技术栈识别。
- `references/migration-policy.md`：冲突 AI workflow 的迁移与备份规则。
- `references/harness-contract.md`：目标仓库落地后的目录、文档和状态约定。
- `references/generated-and-checks.md`：generated 可信度、check 和 not applicable 规则。
- `references/subagent-lanes.md`：通用 subagent lane 和冲突控制。

需要确定目标项目状态时，先运行：

```bash
scripts/inspect-target.sh <target-root>
```

需要落地默认资产时，使用 `assets/` 中模板；不要从某个已有项目复制。

## 固定流程

### Phase 1：Inspect

- 审计目标 git 状态；如果不是 git 仓库，记录 `HAS_GIT=0`。
- 识别 topology：`workspace-with-child-repos`、`single-fullstack`、`backend-only`、`frontend-only`、`unknown-traditional`。
- 识别已有 `AGENTS.md`、`CLAUDE.md`、`.agents/skills`、`.codex/hooks*`、`.codex/agents`、docs/spec/plan 结构和冲突 AI workflow。
- 识别技术栈信号：后端、前端、移动端、SQL、API、router/component、测试和启动命令。

### Phase 2：Migration Proposal

写入前先给出明确迁移提案：

- 检测到的 topology、证据和适配 profile。
- 将重写、创建、替换、保留、备份的文件。
- `AGENTS.md` 如何成为上下文地图，`ARCHITECTURE.md` 如何成为详细架构地图。
- 哪些旧 AI workflow 会被替换，哪些非冲突项目 skills/docs 会被索引保留。
- 哪些 check 对当前 profile 标记为 not applicable。

### Phase 3：Adopt Harness

- 将根级 `AGENTS.md` 改造为上下文地图、入口约定和硬规则，不保留并行旧主流程。
- 创建或重写 `ARCHITECTURE.md` 为详细架构地图；自动填入已探测模块，未知处用明确 TODO。
- 补齐 docs contract、templates、design docs、generated docs、harness wrapper、checks、generated refresh、hooks、workspace skills 和 subagent lanes。
- 若目标没有 git，把被替换的 AI workflow 文件备份到 `.codex/local/harness-backup/<timestamp>/` 后再覆盖。
- 若目标有 git，不额外备份，但必须在提案和收尾中报告被替换文件，依赖 git diff 可回看。

### Phase 4：Generate And Review Indexes

- 运行 `./harness generated refresh all`。
- 初始 `Review status: pending` 不是完成态；必须抽样源码复核并写回 review metadata。
- 禁止留下 `... N more` 这类截断索引。
- generated 只是导航索引，不替代源码、测试、运行态验证或用户确认。

### Phase 5：Run Checks

- 运行 `./harness check all`。
- profile 不适用的检查必须返回 not applicable，而不是失败。
- 如果有 Node tests，运行生成的 `.codex/tests/*.test.mjs`。
- 收尾报告 topology、改动、未改动、not applicable 项、剩余人工决策点。

## 关键口径

- `AGENTS.md` 是 agent 入口地图；不要把它写成百科或固定加载顺序。
- `ARCHITECTURE.md` 是详细架构地图；generated 不替代它。
- 新 draft 直接写 `docs/drafts/<slug>.md`。
- draft 可多轮优化；用户确认前只更新 draft，不生成 design/spec/plan。
- 页面设计方向可在 draft 阶段讨论，但正式设计产物只在 draft 确认后、product spec / exec plan 前生成。
- 用户不需要说 `L2`、`ui_impact` 或 `prototype_mode`；这些是内部字段。
- 需要设计确认的页面必须有 approved 页面级 `DESIGN.md`，并且 `html` 或 `hybrid` 模式具备 `prototypes[]` 可实现 handoff 后才允许实现；单页面也是 `prototypes[]` 里一个页面项。
- `visual-directions/` 只用于 `image` / `hybrid` 的视觉方向探索，不是旧 harness 兼容目录，也不能单独作为实现输入。
- run closeout 默认刷新并复核 generated，把实施验证证据放入 `docs/validation/<slug>/<YYYY-MM-DD>/`，写回 active plan 的验证摘要和证据路径，运行 checks。
- 所有用户可见 UI 文案不得出现代码注释式、占位式、开发提示式或未清理备注式文案。

## 输出要求

完成后汇报：

- 检测出的 topology 和 profile。
- 改了什么。
- 替换或备份了哪些旧 AI workflow。
- 哪些检查通过，哪些是 not applicable。
- 还剩哪些人工决策点。
