# Harness Contract

## 最小核心

目标工程采用后的最小核心是：

```text
AGENTS.md
ARCHITECTURE.md
docs/
  drafts/
  product-specs/
  exec-plans/
    active/
    completed/
  validation/
  generated/
  workflow-artifacts.md
.agents/skills/lumine-harness-*/
.harness/
  root.json
  project.json
  managed.json
  adapter-capabilities.json
  cli
  core/
  check.mjs
  generated.mjs
  tests/
  adapters/
```

`project.json` 保存项目拓扑、启用模块、selected adapters 和 generated targets。`managed.json` 保存规范版本、受管文件和哈希，用于安全升级；它不能把项目自己维护的 AGENTS、ARCHITECTURE、阶段 Skill 或业务 Docs 当作可盲目覆盖的生成物。

## 可选模块

Inspect 和 Migration Proposal 必须按项目事实选择模块，不能给所有目标生成固定全家桶：

- `design`：`docs/design-docs/` 和 Design Gate。
- `frontend`：`docs/FRONTEND.md` 与 UI 文案、页面 taste 检查。
- `browser`：浏览器自动化参考和浏览器 Validation 约定。
- `database`：数据库、migration、schema generated targets 与证据约定。
- `mobile`：移动端实现面、平台验证和相关导航。
- `workers`：parallel worker task packet 和协调规则；只有宿主或工作方式支持时启用。

未启用模块的文件不应生成，对应 Check 和 generated target 返回 `not applicable`。

## Workflow

```text
Draft 多轮收敛
→ 人工确认
→ 按需 Design / Prototype
→ 人工确认
→ Product Spec
→ Exec Plan
→ 人工授权 Run
→ 实现、测试、修复
→ Validation closeout
→ completed
```

用户侧提示词保持自然语言：

- `这个 Draft 需要优化。你看我还需要交代什么上下文？`
- `这个 Draft 可以进入下一步；先判断是否需要设计，不要直接实施。`
- `请生成 Product Spec 和 Active Exec Plan，先不要实施。`
- `计划确认，开始 Run。`

## Design Gate

Design 只在模块启用且任务需要设计确认时使用：

- 内部 `ui_impact`：`L0 | L1 | L2`。
- 内部 `prototype_mode`：`html | image | hybrid`。
- 用户不需要输入内部字段。
- 正式设计产物必须位于 Draft 确认之后、Product Spec / Exec Plan 之前。
- 进入实现需要 approved `DESIGN.md`、`prototypes[]` 和相应 handoff；图片探索不能直接成为实现批准源。

## Shared Instructions And Skills

- 根 `AGENTS.md` 是宿主中立的工程入口，不包含产品兼容矩阵。
- `.agents/skills` 是唯一 Skill 内容真源。
- 不生成产品 Rules、Skill 正文副本或产品级 Skill 投影。
- 无法原生发现 `.agents/skills` 的宿主由 Adapter 按需路由真实 `SKILL.md`；显式 Skill 和 Harness 阶段为确定性路由，普通自然语言发现为 `best-effort`。
- Draft、Design、Product Spec / Exec Plan、Run、Generated、Check 和 Navigate 开始前必须实际读取对应 Skill。
- `.harness/root.json` 决定 Harness 根；不能使用最近的 Git 根代替。

## Adapter Capability

产品协议不写入目标 `AGENTS.md`。Capability Manifest 对项目指令、会话上下文、Skill 发现与读取、写前门禁、停止门禁、自动续跑、状态矩阵和会话隔离分别记录结果与证据等级。

- 结果：`passed | needs_setup | not_tested | not_observable | not_applicable | failed`。
- 证据等级：`official_declared | repository_checked | runtime_observed | behavior_verified`。

`doctor` 只判断静态配置、安装和人工步骤；`verify` 观察真实会话事件，但自动事件聚合最高只能得到 `runtime_observed`。`behavior_verified` 必须来自维护者对真实产品、版本和探针结果的复核。OpenCode 缺少完整 Stop Gate 时只把自动续跑标为不可用，不把整个产品显示为不兼容；DeepSeek Harness 等不稳定协议继续清楚标记为试用支持。

## Status

收尾或暂停只输出一条：

- `WORK_STATUS: done`
- `WORK_STATUS: continue_autonomously`
- `WORK_STATUS: needs_user_decision`
- `WORK_STATUS: needs_credentials`
- `WORK_STATUS: needs_manual_app_step`
- `WORK_STATUS: blocked_external`

状态只表达任务事实。宿主需要的命令由 Adapter 动态注入，不写入目标 `AGENTS.md`。

`continue_autonomously` 与宿主传输分离：每个新的状态发射可以请求一次续跑，同一助手响应或 Hook 重试不能重复请求。新用户输入重置连续自治链；默认上限为 20，连续两轮可观测无进展时暂停，宿主更低限制优先。

## Validation

运行证据写入 `docs/validation/<slug>/<YYYY-MM-DD>/`。Active Exec Plan 保存验证摘要、命令、结果、未覆盖风险和证据链接，不承载大量证据文件。generated 只辅助导航，不能替代源码、测试、运行态或用户确认。
