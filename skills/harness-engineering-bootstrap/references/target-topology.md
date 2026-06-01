# Target Topology

Bootstrap 只把 topology 当内部识别结果，不要求用户手写进 draft/spec/plan。

## Profiles

- `workspace-with-child-repos`：根目录主要协调多个子仓或应用；存在直接子目录 `.git`、多个 package/app 根、或根级只承载 docs/config/harness。
- `single-fullstack`：单个业务仓同时包含后端和前端/移动端。
- `backend-only`：只有服务端、SQL、API、worker、CLI 或库。
- `frontend-only`：只有 Web、移动端、组件库或前端应用。
- `unknown-traditional`：没有清晰技术栈或入口，但仍需要 harness 文档和检查骨架。

## Signals

- Workspace：直接子目录 `.git`、`pnpm-workspace.yaml`、`turbo.json`、`apps/`、`packages/`、多个顶级服务/端目录。
- Backend：`pom.xml`、`build.gradle`、`go.mod`、`pyproject.toml`、`requirements.txt`、`src/main`、`controllers`、`routes`、`migrations`、`sql`。
- Frontend：`package.json`、`vite.config.*`、`next.config.*`、`nuxt.config.*`、`src/views`、`src/pages`、`src/router`、`components`。
- DB/API：`.sql`、migration 文件、OpenAPI/Swagger、Controller/router 注解、client api 目录。
- AI workflow conflict：已有 `AGENTS.md`、`CLAUDE.md`、`.agents/skills`、`.codex/hooks*`、`.codex/agents`、`.claude/skills`、`docs/tasks`。

## Routing Output

Inspect 阶段输出必须包含：

- `TOPOLOGY`
- `HAS_GIT`
- `IMPLEMENTATION_SURFACES`
- `AI_WORKFLOW_SURFACES`
- `DOCS_CONTRACT_PRESENT`
- `TECH_SIGNALS`
- `NOT_APPLICABLE_CHECKS`

Workspace profile 要列出主要子仓或 app；single profile 要列出主要模块。
