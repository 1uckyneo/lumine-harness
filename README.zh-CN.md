# Lumine Harness

[English](README.md) | [简体中文](README.zh-CN.md)

[![skills.sh](https://skills.sh/b/1uckyneo/lumine-harness)](https://skills.sh/1uckyneo/lumine-harness)

Lumine Harness 是一套项目级 Agent 工程工作流。它帮助 Agent 在不同会话和长时间任务中，持续读取同一套产品目标、架构边界、执行状态和验证证据。Lumine 中文写作“[卢米安](https://weibo.com/u/3316905545)”。

它既可以改造单个代码仓库，也可以改造由多个关联仓库组成的工程。最终得到的是一套让 Agent 更容易理解、恢复、约束、验证和持续改进的研发环境。

## 它适合我的项目吗？

Lumine Harness 适合以下场景：

- 单个代码仓库需要建立完整的 Agent 工作流；
- 前端、后端、移动端等多个关联仓库需要同步开发；
- 纯前端、纯后端、全栈或传统项目缺少可持续恢复的工程上下文；
- 项目已有 `AGENTS.md`、Rules、Skills、Hooks 或文档流程，希望迁移成一套统一规范。

Lumine Harness 不是：

- 一个新的编程 Agent；
- 绑定某个模型或模型厂商的框架；
- 只适用于 Codex 的一组 Hooks；
- 项目采用后，每开发一个功能都要重新安装的工具。

安装或直接读取的 `lumine-harness` Skill 负责首次采用或迁移。日常开发由项目内的 `AGENTS.md`、`.agents/skills/lumine-harness-*`、工程记录、Harness Core 和所选 Agent Adapter 共同支撑。

## 三分钟开始使用

### 推荐：使用 `skills` CLI

准备好 Node.js 18 或更高版本后，在终端中运行。[`skills` CLI](https://github.com/vercel-labs/skills)（来自 Vercel Labs）会读取本仓库，并把 `lumine-harness` 安装到检测到的 Agent 对应目录。

使用官方文档中的 `npx` 方式：

```bash
npx skills add 1uckyneo/lumine-harness -g
```

使用 pnpm 的等价方式：

```bash
pnpm dlx skills add 1uckyneo/lumine-harness -g
```

`-g` 表示全局安装，适合用同一个入口 Skill 改造多个工程。如果只希望在当前项目中使用，可以省略 `-g`。

安装完成后，请开启新的 Agent 会话，让宿主重新发现 Skill。然后从准备采用 Harness 的目标工程根目录开始使用。

`skills` CLI 安装的是负责首次采用或迁移的入口 `lumine-harness` Skill。工程采用完成后，日常开发使用的是生成到目标工程内的 `AGENTS.md`、`.agents/skills/lumine-harness-*`、工程记录、Harness Core 和所选 Adapter。

### 更新 Skill

```bash
npx skills update lumine-harness -g -y

# 使用 pnpm
pnpm dlx skills update lumine-harness -g -y
```

更新后同样建议开启新会话，让 Agent 载入新的 Skill 内容。

## 选择正确的目标工程根目录

目标不一定是一个“Workspace 仓库”。应该选择能够代表完整工程范围的目录：

| 工程形态 | Harness 根目录 |
| --- | --- |
| 单仓项目 | 代码仓库根目录 |
| 多个关联仓库 | 能够覆盖全部关联仓库的共同父目录 |

这个共同父目录本身不要求是 Git 仓库。关键是 Agent 从这里能够访问所有关联仓库。如果只打开其中一个子仓，跨仓上下文、检查和生命周期恢复都会不完整。

安装 Lumine Harness Skill 后，从准备采用 Harness 的工程根目录启动 Agent，并发送：

```text
请使用 lumine-harness Skill 检查当前工程。

先识别这是单仓项目还是多仓协同项目，确认合适的 Harness 根目录，
然后给出 Migration Proposal。在我确认前不要修改文件。
```

## 首次改造会发生什么？

Lumine Harness 的首次采用分为四个清晰阶段：

1. **Inspect（检查现状）**
   - 识别仓库拓扑和技术栈。
   - 检查 Git 状态、现有 Agent 指令、Skills、Hooks 和工程文档。
2. **Migration Proposal（迁移提案）**
   - 列出准备创建、替换、保留或备份的内容。
   - 说明每个所选 Agent Adapter 的能力与限制。
   - 等待人工确认，确认前不写入。
3. **Adopt（采用 Harness）**
   - 建立工程地图、阶段 Skills、Docs 工作流、公共 Harness Core 和所选 Adapter。
4. **Verify（验证）**
   - 刷新导航索引。
   - 执行 Harness Check 和 Adapter Doctor。
   - 报告仍需人工完成的宿主设置或产品端验证。

这是一项迁移，而不是静默追加的保守补丁。批准前请先检查 Migration Proposal。

## 改造后工程会是什么样？

### 单仓项目

```text
my-project/
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
│   ├── drafts/
│   ├── design-docs/
│   ├── product-specs/
│   ├── exec-plans/
│   │   ├── active/
│   │   └── completed/
│   ├── validation/
│   └── generated/
├── .agents/
│   └── skills/
│       └── lumine-harness-*/
├── .harness/
└── src/
```

### 多仓协同项目

```text
my-project/
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
├── .agents/
│   └── skills/
│       └── lumine-harness-*/
├── .harness/
├── frontend/
├── backend/
└── mobile/
```

这里的 `my-project/` 可以只是一个协同目录，不必是 Git 仓库。各个子仓仍然保留自己的源码和 Git 历史。

### 主要工程资产分别做什么？

| 工程资产 | 作用 |
| --- | --- |
| `AGENTS.md` | Agent 的工程入口地图、项目边界、硬规则和阶段路由 |
| `ARCHITECTURE.md` | 系统结构、模块关系、实现路径和架构不变量 |
| Draft（需求草案） | 保存原始需求、待回答问题、歧义和仍在收敛的决策 |
| Product Spec（产品规格） | 固定产品目标、范围、规则和验收标准 |
| Exec Plan（执行计划） | 记录技术路径、执行状态、下一步和验证方式 |
| Validation（验证记录） | 保存实际执行了什么、哪些结果已经被证明的证据 |
| `.agents/skills/lumine-harness-*` | 项目内用于导航、草案、设计、计划、实施、索引刷新和检查的方法 |
| `.harness` | 公共 Core、CLI、检查、索引生成器、会话状态和产品 Adapter |
| generated | 根据仓库事实生成的导航；不能替代源码、测试或运行证据 |

安装或直接读取的 `lumine-harness` Skill 用于首次采用。生成到工程内的 `lumine-harness-*` Skills 才负责日常开发阶段。

## 日常开发流程

```text
Draft（需求草案）
  ↓ 人工确认
按需 Design（设计与原型）
  ↓ 人工确认
Product Spec（产品规格）
  ↓
Exec Plan（执行计划）
  ↓ 人工授权 Run
实现、测试和修复
  ↓
Validation 与归档
```

Design 是按需分支；Product Spec 一定在 Exec Plan 之前。Draft、Design、Spec/Plan 和 Run 开始前都有人参与确认。Run 获得授权后，Agent 可以自主执行；遇到新的产品决策、凭据或必须人工完成的应用操作时，再把控制权交还给人。

### 可以直接发送给 Agent 的话

开始整理需求：

```text
我先写了一份简单需求，请帮我整理成 draft，并告诉我还缺哪些上下文和决策。
```

只讨论设计方向：

```text
我们先讨论页面设计方向，只更新 draft，暂时不要生成正式设计稿。
```

确认草案可以继续：

```text
这个 draft 可以进入下一步。
```

设计确认后建立产品和执行契约：

```text
设计稿确认。请生成 Product Spec 和 Active Exec Plan，先不要实施。
```

授权实施：

```text
计划确认，开始 Run。按计划实施、测试、修复并更新验证记录。
```

小需求可以使用更短的文档，但不能为了改动小就绕过流程，导致工程地图、当前状态或验证证据在后续会话中失真。

## 人需要重点看什么？

Harness 包含的材料比人每天需要阅读的内容更多。

| 人重点关注 | Agent 和工具深入消费 |
| --- | --- |
| Draft 和未解决的决策 | 完整源码 |
| 已确认的 Design 和原型 | generated 导航 |
| Product Spec | 详细计划和阶段指令 |
| Exec Plan 的决策与进度摘要 | 检查日志和测试输出 |
| Validation 摘要和最终证据 | Adapter 状态和生命周期数据 |
| 安全敏感、架构关键或异常代码 | CLI 和 Hook 临时状态 |

这不等于取消代码审查。人的注意力会更多放在产品方向、技术边界、证据质量，以及高风险代码的定向审查上，而不是默认平均阅读全部生成文件和每一行源码。

## Agent 宿主支持

所有支持的宿主共用根 `AGENTS.md`、项目 `.agents/skills`、工程记录和 `.harness` Core。产品目录只是生命周期 Adapter，不是工作流副本。

| 宿主 | 接入方式 | 额外步骤或当前边界 |
| --- | --- | --- |
| Codex | 仓库级 Hooks | 支持 SessionStart 与 Stop Gate |
| Qoder | Prompt、工具和 Stop Hooks | 公共 Skill 通过读取门禁使用，不进入 Qoder 原生 Skill 列表 |
| Trae | 仓库级 Hooks | 用户需要启用项目 AGENTS、共享 Skills 和 Hooks |
| Kimi Code | 原生 AGENTS/Skills + 用户级 Hooks | 用户级 Hook 需要显式安装，且为 fail-open |
| Cursor | 仓库级 Hooks | 需要打开并信任完整的目标工程根目录 |
| OpenCode | 仓库级 Plugin | 支持上下文和审计；当前没有等价的 Stop Gate |
| ZCode | Hook-only 本地 Marketplace Plugin | 需要人工安装 Plugin，只有项目 Hooks 不会运行 |
| DeepSeek Harness | 原生 AGENTS/Skills + profile bundle | developer preview；SessionStart 与 Stop 仍为 partial |

采用完成后运行：

```bash
./.harness/cli adapter doctor all
```

Doctor 会报告仍需处理的产品设置和安装步骤。磁盘上存在配置文件，不代表宿主已经加载指令、读取 Skill、执行 Hook 或成功续跑任务。

## 常用命令

在采用完成后的 Harness 根目录运行：

```bash
./.harness/cli check all
./.harness/cli generated refresh all
./.harness/cli adapter list
./.harness/cli adapter doctor all
./.harness/cli adapter verify all
```

Kimi Code 用户级 Hooks、ZCode 本地 Plugin、DeepSeek Harness profile bundle 等能力需要显式安装。应先运行 `adapter doctor`，再按它输出的步骤操作，不要猜测产品目录或配置格式。

## 常见问题

### 安装后看不到全局 Skill

先运行 `npx skills list -g` 或 `pnpm dlx skills list -g`，确认 `lumine-harness` 已经安装到目标 Agent。然后开启新会话，让宿主重新加载 Skill。使用 Codex Skill Installer 安装时，新 Skill 同样会在下一轮对话中可用。

### Agent 只发现了其中一个子仓

请从包含全部关联仓库的共同工程根目录重新打开或启动 Agent。Harness 根目录应该覆盖完整工程范围。

### Hook 文件存在，但没有自动运行

执行 `./.harness/cli adapter doctor <product>` 和 `adapter verify <product>`，再检查产品的人工设置和 Hook 日志。文件存在本身不是运行态验证。

### generated 仍显示 `Review status: pending`

刷新 generated 只完成确定性扫描。Agent 还需要抽样检查被引用的源码并更新复核元数据；`pending` 不是已完成复核。

### Doctor 提示需要人工步骤

请在对应产品中完成该操作。当仓库自动化无法证明产品侧设置时，Harness 会保留 `needs_manual_app_step`，不会伪装成已经完成。

## 其他安装方式

### 手动读取仓库

如果当前 Agent 不支持 `skills` CLI，先把仓库克隆到它能够读取的位置：

```bash
git clone https://github.com/1uckyneo/lumine-harness.git
```

然后向 Agent 发送：

```text
请完整读取 <克隆目录>/skills/lumine-harness/SKILL.md。

检查 <目标工程目录>，识别项目结构并给出 Migration Proposal。
在我确认提案前不要修改文件。
```

### Codex Skill Installer

Codex 用户也可以把下面这段话发送给 Codex。它不是终端命令：

```text
请使用 $skill-installer 安装这个 Skill：
https://github.com/1uckyneo/lumine-harness/tree/main/skills/lumine-harness
```

安装后的 Skill 会在下一轮对话中可用。

## 可选扩展：Codex Plugin

大多数用户只需要 `lumine-harness` Skill。如果你使用 Codex，并且更喜欢通过 Plugin 浏览器安装，本仓库也提供了包含同一个 Skill 的可选 Codex Plugin 包装。

在 Codex CLI 内输入：

```text
/plugin marketplace add 1uckyneo/lumine-harness
/plugins
```

在 Plugin 浏览器中安装 **Lumine Harness**，然后开启新会话。除非你正在切换安装方式，否则不要同时安装两种形式。Plugin 不会改变最终生成到目标工程中的 Harness 文件。

更多信息见 [OpenAI Plugin 官方说明](https://developers.openai.com/codex/plugins)。Codex IDE Extension 目前不支持 Plugin。

## 安全与恢复

- Agent 修改目标工程前必须先提交 Migration Proposal。
- 必须保留工作树中已有且与迁移无关的修改。
- Lumine Harness 不会自动提交、推送、修改远端、切换分支、stash、reset 或改写历史。
- Git 工程通过 diff 和历史记录恢复。
- 非 Git 目标中，被替换的 AI workflow 文件会备份到 `.harness/local/harness-backup/<timestamp>/`。
- 用户级产品配置需要单独授权，不会在普通 Adopt 中静默修改。
- generated 索引只是导航，不替代源码检查、测试、运行态验证或人工决策。

## 维护本仓库

如果你准备维护或贡献 Lumine Harness 本身，请阅读仓库根目录的 [`AGENTS.md`](AGENTS.md)。其中定义了唯一规范源码、Plugin wrapper 生成关系、修改路由、产品中立口径和必跑检查。

## License

[MIT](LICENSE)
