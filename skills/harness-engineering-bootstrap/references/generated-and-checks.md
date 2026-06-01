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
- `unknown-traditional`：无法识别的 runtime target 标记 partial 或 not applicable。

## Checks

`./harness check all` 覆盖：

- docs contract 和核心文件存在。
- `AGENTS.md` 是上下文地图，不含旧式包裹块或本地优先主流程。
- draft/design/plan gate。
- generated metadata、pending review、stale、截断残留。
- architecture 和 taste structural checks。
- 旧 workspace 前缀 skill 或旧 lane 残留。

检查失败必须给 remediation，不只输出失败。
