# Generated And Checks

`docs/generated/**` 是静态扫描 + 模型复核后的导航索引，不是事实源。

## Targets

- `workspace-index`：根级 docs、skills、hooks、scripts、主要入口。
- `repo-doc-index`：业务仓、子仓、README、AGENTS/CLAUDE、已有 docs 和 AI workflow 入口。
- `api-map`：后端 Controller/router/API 定义与前端 API client。
- `db-schema`：SQL/migration/schema 静态快照。
- `frontend-routes`：router/pages/views。
- `frontend-components`：components/views 组件入口。

## Metadata

每个 generated 文件必须包含：

- `AUTO-GENERATED`
- `Generated at`
- `Source command`
- `Source paths`
- `Completeness`
- `Notes`
- `Review status`
- `Reviewed at`
- `Reviewer`
- `Review scope`
- `Known gaps`

刷新后先是 `Review status: pending`。模型复核后写成 `reviewed` 或 `reviewed-with-gaps`。

## Not Applicable

Profile 不支持的 target 不应失败：

- `backend-only`：frontend routes/components 可标记 not applicable。
- `frontend-only`：db-schema 可标记 not applicable，api-map 只扫前端 API client。
- `library-or-cli`：页面、浏览器和数据库目标默认 not applicable，除非 Inspect 发现对应能力。
- `unknown-traditional`：无法识别的 runtime target 标记 partial 或 not applicable。

## Checks

`./.harness/cli check all` 覆盖：

- docs contract 和核心文件存在。
- `AGENTS.md` 是上下文地图，不含旧式包裹块或本地优先主流程。
- `AGENTS.md` 保持宿主中立，不含产品兼容矩阵、产品条件命令或绝对本机路径。
- 如果启用 Worker Coordination，项目文档说明 task packet、owned write set、验收和回写边界；未启用时标记 not applicable。
- `AGENTS.md` 给每个 `WORK_STATUS` 状态码提供项目可理解的解释；具体宿主命令由 Adapter 动态提供。
- `.harness/root.json`、能力清单和所选产品 Adapter 入口存在且一致。
- 仓库内不存在产品 Rules、产品级 Skill 目录、Skill 正文副本或 Skill 投影；`.agents/skills` 是唯一 Skill 内容真源。
- 七个项目 Harness 阶段 Skill 全部使用 `lumine-harness-*` 前缀，不重新生成旧的无前缀 `harness-*`。
- Qoder 按具体宿主形态和版本选择可用事件；CodeBuddy 使用仓库 Hooks 并保留 `/hooks` 人工审核；OpenCode `stopGate` 固定为 `unsupported`，idle 处理只做审计。
- ZCode 使用 Hook-only 本地 Marketplace Plugin，不能把项目级 Hook 文件当成已生效。
- DeepSeek Harness 的宿主与官方 Codex Hook bridge 锁定同一已验证版本；SessionStart、Stop 继续标记为 partial，直到产品端复验通过。
- draft/design/plan gate。
- design gate 只要求 design_data 可解析且包含 meta authority/source/deviation 语义，不要求完整业务字段 schema。
- generated metadata、pending review、stale、截断残留。
- architecture 检查 `ARCHITECTURE.md` 的中文架构章节：仓库形态、目录地图、实现路径、架构不变量；旧英文标题仅为迁移兼容。
- architecture 不允许 `ARCHITECTURE.md` 出现“上下文入口”章节；上下文导航放在 `AGENTS.md`。
- taste structural checks。
- 旧 workspace 前缀 skill、旧 lane 或旧 `.codex/agents` 必备资产残留。

检查失败必须给 remediation，不只输出失败。
