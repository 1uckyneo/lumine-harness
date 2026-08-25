# Lumine Harness

[English](README.md) | 简体中文

[![skills.sh](https://skills.sh/b/1uckyneo/lumine-harness)](https://skills.sh/1uckyneo/lumine-harness)

> **在智能体优先的世界中，构建可靠的工程环境。**

编程 Agent 已经不再只是辅助修改代码的工具，而是能够承担完整功能、跨仓协作并连续运行数小时的工程参与者。模型能力越强，影响交付质量的关键就越从“会不会写代码”，转向它能否持续理解项目、遵守边界、恢复现场，并用证据说明结果。

Agent 产品自带的 Harness 解决“怎么运行”；**Lumine Harness** 是项目级 Harness，解决“在这个项目里做什么、怎样算完成”。一个是运行底座，一个是项目环境，二者互补。

它也是 Harness Engineering（驾驭工程技术）的一种实践：把项目目标、工程边界、执行进度和验证证据留在项目中，让 Agent 换了会话也能理解并继续工作。

**会话会结束，但工程上下文必须留下。**

Lumine 中文写作“[卢米安](https://weibo.com/u/3316905545)”。

## 什么时候值得使用

Lumine Harness 更适合这些场景：

- 把一项完整功能或长时间任务交给 Agent；
- 希望换会话、换 Agent 后仍能恢复目标、决定和执行进度；
- 前端、后端、移动端等多个关联仓库需要一起推进；
- 需要明确保留产品边界、测试结果和交付证据；
- 已经有零散的 `AGENTS.md`、Rules、Skills、Hooks 或工程文档，希望整理成一套一致的流程。

如果只是临时询问一段代码、修改一个很小且不会影响后续上下文的问题，通常不必先改造整个工程。

## 3 步开始

### 1. 全局安装入口 Skill

准备好 Node.js 18 或更高版本，根据网络环境选择一个来源。

通过 GitHub / skills.sh 安装：

```bash
npx skills add 1uckyneo/lumine-harness -g
```

通过 Gitee / skills.sh 安装：

```bash
npx skills add https://gitee.com/thrulife2gether/lumine-harness.git -g
```

两条命令安装的是同一个 `lumine-harness` Skill。它只负责首次接入和升级，不会立即修改你的目标工程。

如果当前环境不能使用 `skills` CLI，也可以从 GitHub 或 Gitee 手动克隆（任选其一）：

```bash
git clone https://github.com/1uckyneo/lumine-harness.git
git clone https://gitee.com/thrulife2gether/lumine-harness.git
```

手动克隆后，在第 3 步让 Agent 先读取入口 Skill：

```text
请完整读取 <克隆目录>/skills/lumine-harness/SKILL.md。
检查 <目标工程目录>，先给出改造方案；在我确认前不要修改文件。
```

### 2. 从正确的工程根目录开启新会话

| 工程形态 | 应该打开的目录 |
| --- | --- |
| 单仓项目 | 代码仓库根目录 |
| 多个关联仓库 | 能覆盖全部关联仓库的共同父目录 |

多仓工程的共同父目录不必是 Git 仓库。关键是 Agent 从这里能够访问全部相关源码、规则和运行入口。只打开其中一个子仓，会让跨仓上下文、检查和任务恢复不完整。

### 3. 把下面的话发给 Agent

```text
请使用 lumine-harness 检查当前工程。

先判断合适的 Harness 根目录，并给出改造方案（Migration Proposal），
说明准备新增、修改和保留哪些内容。在我确认前不要修改任何文件。
```

此时 Agent 只会检查现状并给出方案。只有你确认方案后，它才会写入工程。

## 接下来会发生什么

```text
检查现状 → 给出改造方案 → 你确认后写入 → 检查接入结果
```

1. **检查现状（Inspect）**
   识别单仓或多仓结构、技术栈、Git 状态、已有 Agent 指令、Skills、Hooks 和工程文档。

2. **给出改造方案（Migration Proposal）**
   列出准备新增、更新和保留的文件，说明适合启用的模块、选中的 Adapter、能力限制和精确写入范围。

3. **确认后接入（Adopt）**
   建立工程地图、项目阶段 Skills、工作流记录、Harness Core 和选中的 Adapter。设计、浏览器、数据库等模块只在项目确实需要时启用。

4. **检查结果（Verify）**
   刷新工程导航，运行 Harness Check，并告诉你还有哪些 Agent 产品设置需要人工完成。

如果发现未受 Lumine Harness 管理的现有文件与方案冲突，接入会停止并报告冲突，不会静默覆盖。处理冲突后需要重新生成并确认方案。

## 日常开发怎么使用

### 不需要单独设计

```text
需求草案 → 人工确认 → 产品规格 → 执行计划 → 人工授权实施
        → 实现、测试、修复 → 验证记录 → 归档
```

### 需要设计确认

```text
需求草案 → 人工确认 → 设计 / 原型 → 人工确认
        → 产品规格 → 执行计划 → 人工授权实施
        → 实现、测试、修复 → 验证记录 → 归档
```

这些名称分别是：

- Draft（需求草案）：保存原始想法、问题和仍未确认的决定；
- Design（设计）：按需确认交互、视觉方向和原型；
- Product Spec（产品规格说明）：固定目标、范围、规则和验收标准；
- Exec Plan（执行计划）：记录实现路径、当前进度和验证安排；
- Run（实施）：在得到人工授权后实现、测试和修复；
- Validation（验证记录）：说明实际发生了什么，以及哪些结果已经被证明。

Design 是按需分支，Product Spec 必须在 Exec Plan 之前。Draft、Design、Product Spec / Exec Plan 和 Run 开始前都有人参与确认。Run 获得授权后，Agent 可以自主推进；遇到新的产品决定、凭据或必须由人完成的应用操作时，再把控制权交还给人。

你可以直接对 Agent 说：

```text
我先写了一份简单需求，请帮我整理成需求草案，并告诉我还缺哪些上下文。
```

```text
这份草案可以进入下一步。先判断是否需要设计，不要直接实施。
```

```text
请生成 Product Spec 和 Active Exec Plan，先不要实施。
```

```text
计划确认，开始实施。按计划完成开发、测试、修复并更新验证记录。
```

小需求可以缩短文档，但不能让工程地图、当前状态和验证证据失真，否则后续会话无法可靠恢复。

## 接入后，工程会获得什么

典型单仓项目会增加这些工程资产：

```text
my-project/
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
│   ├── drafts/
│   ├── product-specs/
│   ├── exec-plans/
│   │   ├── active/
│   │   └── completed/
│   ├── validation/
│   └── generated/
├── .agents/
│   └── skills/
├── .harness/
└── src/
```

多仓工程使用相同的 Harness 资产，只是根目录下还会包含 `frontend/`、`backend/`、`mobile/` 等关联仓库。

### 人和 Agent 共同使用的工程记录

| 资产 | 回答的问题 |
| --- | --- |
| `AGENTS.md` | Agent 从哪里开始，工程边界和阶段规则是什么？ |
| `ARCHITECTURE.md` | 系统由什么组成，模块怎样连接？ |
| Draft | 最初想解决什么，还有什么没有说清？ |
| Product Spec | 最终应该做成什么，范围和验收标准是什么？ |
| Exec Plan | 准备怎样实现，现在做到哪里？ |
| Validation | 实际发生了什么，结果是否已经被证明？ |

### Agent 和工具使用的运行支撑

- `.agents/skills`：保存当前项目各阶段的工作方法，是项目 Skill 的唯一内容来源；
- `.harness`：提供 CLI、检查、状态管理和产品 Adapter；
- generated：根据仓库事实生成导航索引，帮助 Agent 定位源码和工程入口，但不能替代源码、测试或运行证据。

## 几个容易混淆的名字

| 名称 | 作用 |
| --- | --- |
| `lumine-harness` 入口 Skill | 第一次检查、接入或升级一个工程 |
| 项目内 `lumine-harness-*` Skills | 接入后用于需求、设计、规划、实施和检查的日常方法 |
| Harness Core | 位于 `.harness`，负责 CLI、检查、状态和公共运行逻辑 |
| Adapter | 把公共 Harness 能力转换成不同 Agent 产品的生命周期协议 |
| Codex Plugin | 入口 Skill 的一种可选分发方式，不是另一套 Harness，也不是项目 Adapter |

## 人需要重点看什么

你不需要阅读 Agent 使用的全部文件。人通常重点关注：

- Draft 中仍未解决的问题；
- Design 和原型；
- Product Spec；
- Exec Plan 中的决定、进度和风险摘要；
- Validation 摘要；
- 安全敏感、架构关键或出现异常的代码。

Agent 和工具会进一步读取完整源码、generated 导航、详细计划、测试输出、检查日志和生命周期状态。采用 Harness 不等于取消代码审查，而是把人的注意力更多放到产品方向、技术边界、证据质量和高风险代码。

## 在不同 Agent 中使用

Lumine Harness 把公共工程资产统一保存在 `AGENTS.md`、`.agents/skills`、Docs 和 `.harness` 中，不为每个产品复制一套工作流。

Codex、Qoder、Trae、Kimi Code、Cursor、OpenCode、ZCode、CodeBuddy 和 DeepSeek Harness 对项目指令、Skills 和生命周期 Hooks 的支持方式不同。公共文件存在，不等于目标产品已经实际加载并执行。

接入完成后运行：

```bash
./.harness/cli adapter doctor selected
```

Doctor 会告诉你已选择的 Adapter 还需要哪些产品设置。各产品的接入方式、能力限制、成熟度和真实运行验证状态见 [Adapter 兼容性说明](docs/adapter-compatibility.zh-CN.md)。

## 安全边界

- 改造方案获得确认前不写目标工程；
- 不静默覆盖未受管理的冲突文件；
- 保留工作树已有修改，不自动提交、推送、stash、reset、切分支或修改远端；
- 用户级产品配置必须单独授权；
- generated 不能替代源码、测试、运行验证或人工决定。

## 需要时再看

下面是日常主线之外的命令、排障和安装方式，需要时再展开。

<details>
<summary><strong>展开参考内容</strong></summary>

### 常用命令

```bash
./.harness/cli check all
./.harness/cli generated refresh all
./.harness/cli adapter doctor selected
```

运行 `./.harness/cli` 可以查看 Skill Catalog、Adapter Verify 等高级命令；真实产品验证流程见 Adapter 兼容性说明。

### 常见问题

**安装后看不到入口 Skill**
运行 `npx skills list -g` 确认安装结果，再开启新会话。不同 Agent 产品的全局发现机制可能不同，必要时使用下面的手动读取方式。

**Agent 只发现一个子仓**
从包含全部关联仓库的共同工程根目录重新启动 Agent。

**已有 `AGENTS.md` 或其他 AI 工作流会被覆盖吗？**
不会静默覆盖。检查阶段会把重叠内容列为冲突；在冲突得到处理并重新确认方案前，接入不会继续。

**Hook 文件存在但没有自动运行**
先运行 `adapter doctor <product>`，再检查产品设置和运行证据。配置文件存在不是运行验证。

**generated 显示 `Review status: pending`**
这表示只完成了确定性扫描，还需要回到源码抽样复核并更新 review metadata。

### 其他安装方式

使用 pnpm 全局安装：

```bash
pnpm dlx skills add 1uckyneo/lumine-harness -g
pnpm dlx skills add https://gitee.com/thrulife2gether/lumine-harness.git -g
```

更新已经全局安装的入口 Skill：

```bash
npx skills update lumine-harness -g -y
```

如果希望把入口 Skill 写入当前项目，可以省略 `-g`。这会在当前目录创建 Skill 文件，因此请先确认当前目录就是预期安装位置：

```bash
npx skills add 1uckyneo/lumine-harness
```

Codex 用户也可以使用 `$skill-installer` 或可选的 Plugin 分发方式。Plugin 与独立安装的入口 Skill 是同一份内容，除非正在切换安装方式，否则不要重复安装。详见 [OpenAI Plugin 文档](https://developers.openai.com/codex/plugins)。

</details>

## 维护本仓库

如果你准备维护或贡献 Lumine Harness，请阅读根目录 [`AGENTS.md`](AGENTS.md)。

## License

[MIT](LICENSE)
