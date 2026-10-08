# Lumine Harness

[English](README.md) | [简体中文](README.zh-CN.md)

[![skills.sh](https://skills.sh/b/1uckyneo/lumine-harness)](https://skills.sh/1uckyneo/lumine-harness)

> **在智能体优先的世界中，构建可靠的工程环境。**

编程 Agent 已经能够承担完整功能、跨仓协作，并跨会话持续推进工作。模型能力越强，影响交付质量的关键就越从“会不会写代码”，转向它能否持续理解项目、遵守边界、恢复现场，并用证据说明结果。

Agent 产品自带的 Harness 解决 **“Agent 怎么运行”**，提供模型与工具循环、上下文管理、权限和生命周期集成。**Lumine Harness 是项目级 Harness**，解决 **“Agent 在这个项目里做什么、怎样推进、怎样算完成”**：把项目目标、工程边界、工作方法、执行进度、知识和验证证据留在项目中。一个是运行底座，一个是项目环境，二者互补。

它也是 **Harness Engineering（驾驭工程技术）** 的一种实践：构建人和 Agent 能共同理解、维护的工程环境，让工作在换会话、换 Agent、换机器后仍能继续。产品方案与执行计划保存目标和进度，带来源的 Repo Wiki 解释现有系统，验证记录说明哪些结果已经得到证实。这些工程资产按需支持工作，不要求用户逐项调用一套固定的 Skill 流程。

**会话会结束，但工程上下文必须留下。**

Lumine 中文写作“[卢米安](https://www.zhihu.com/people/thrulife2gether)”。

## 什么时候值得使用

Lumine Harness 更适合这些场景：

- 把一项完整功能或长时间任务交给 Agent；
- 希望换会话、换 Agent 后仍能恢复目标、决定和执行进度；
- 前端、后端、移动端等多个关联仓库需要一起推进；
- 需要保留产品边界、技术理由、测试结果和交付证据；
- 已经有零散的 `AGENTS.md`、Rules、Skills、Hooks 或工程文档，希望整理成一致的项目环境。

它适用于单仓和多个关联仓库，共同父目录本身可以没有 Git。如果只是临时询问一段代码，或做一个独立的小修改，通常不必先接入完整的 Harness。

## 开始使用

运行分发包、维护本仓库或重新构建 Runtime，均支持 Node.js 22.x（22.18.0 及以上）和 Node.js 24.x LTS（24.11.0 及以上），**推荐 Node.js 24 LTS**。Node.js 18、20 不再支持；其他主版本和预发布版本不会自动纳入支持范围。选择一个来源安装同一个初始化 Skill：

GitHub／skills.sh：

```bash
npx skills add 1uckyneo/lumine-harness -g
```

Gitee／skills.sh：

```bash
npx skills add https://gitee.com/thrulife2gether/lumine-harness.git -g
```

安装入口 Skill 不会立即修改你的目标工程。也可以从任一来源手动克隆，再让 Agent 读取 `skills/lumine-harness/SKILL.md`：

```bash
git clone https://github.com/1uckyneo/lumine-harness.git
git clone https://gitee.com/thrulife2gether/lumine-harness.git
```

从单仓根目录或覆盖相关子仓的共同目录开启会话，发送：

```text
使用 lumine-harness 检查这个项目，采用中文优先，提出具体改造方案。
保留项目业务规则、未提交修改和仓库边界。
```

Agent 先检查目标并准备 Migration Proposal，列出写入、保留、备份、语言和宿主限制；按已有授权范围实施。若尚未授权写入，先确认具体提案。语言可选中文优先 `zh-CN` 或 English first `en`，在提案生成前确定。

实际运行 Harness 的 Node 进程须满足版本要求。Agent 的 Hook 可能使用与终端不同的环境，详见[接入方式与限制](docs/adapter-compatibility.zh-CN.md)。采用和升级保留业务工程的 Node 配置，不自动安装或切换 Node。

## 日常开发怎么使用

直接说明目标，不必逐个调用 Skill。完整功能通常是：

**产品 Spec →（必要设计 → 补充 Spec）→ Exec Plan → Run。每次阶段交接由人确认，验证在 Run 中或之后进行，无需单独确认。**

Agent 会根据现有材料、仓库事实和适用 Skill 判断下一步，包括是否需要设计。你说“能否进入下一步”，它先评估；你确认后才进入建议的阶段。设计需要时提供适用的 HTML 原型等材料，确认后回写 Spec，并确认补充后的产品要求。具体规则见[阶段交接指导](skills/lumine-harness/assets/skills/lumine-plan/references/stage-handoff.md)。

| 日常 Skill | 能做什么 |
| --- | --- |
| `lumine-plan` | 澄清需求、修改或审阅产品方案与技术计划；只讨论 Spec 时不强制生成 Plan。 |
| `lumine-run` | 实施、继续、恢复、验证与诊断；只验证不自动修复。 |
| `lumine-knowledge` | 定位源码、查询知识、核实来源和维护 Wiki。 |
| `lumine-design` | 具体视觉与交互方案及设计审阅。 |

初始化与升级仍用 `lumine-harness`；检查是 Runtime 工具，不是另一道人工阶段。

可直接告诉 Agent：

```text
先把这个需求整理成产品方案，暂时不要实施。
比较两种技术实现，更新计划，但不要改业务代码。
现在可以进入下一步了吗？请检查已有材料并给出判断。
确认这份执行计划，进入 Run 并验证实际结果。
只诊断这个问题，报告原因和证据，不要自动修复。
解释登录与动态路由如何协作，并指出源码依据。
```

阶段内自主推进，已确认的同一范围不重复询问；早期笼统的“把功能做出来”不替代后续具体成果的确认。没有新产品决定、不改变既定行为合同且无需独立协调的小修复，以及明确的规则维护、仅验证请求，按自身范围处理，不强制补齐产品流程。生成计划、文件写着 approved 或工具检查通过，都不能替代实际授权和验收。

## 人和 Agent 共用的工程资料

- **Product Spec**：产品问题、场景、业务规则、范围及稳定验收项。
- **Exec Plan**：本次技术选择、当前进度、下一步和证据摘要；引用 Spec，不复制需求。
- **Repo Wiki**：已有机制、架构、技术理由和限制，关联源码、决定与运行证据。
- **Validation**：实际操作和结果；测试、运行、部署及用户接受分别表达。

正文先解释当前结论，再展开技术细节和历史。支持中文、英文和混合文件名，无需手写英文 slug；稳定 ID 与名称分离。已有历史、人工修订和真实批准不会被批量改写。

可以让 Agent 归档已完成的计划，或在继续工作时恢复计划。对当前格式的计划，`task doc-archive` 和 `task doc-restore` 会在 `active/` 与 `completed/` 之间移动文档，保留稳定 ID、更新当前链接并记录可恢复的操作。操作需要当前正文哈希以保护期间产生的新修改；历史证据保持原样。

## 项目知识、Agentic Search 与持续积累

默认知识正文在 `docs/repo-wiki/`，也可以配置另一个唯一根。Agent 先理解项目的用途、实际入口、模块关系和依赖，再组织适合这个项目的知识树。首次建库默认深入覆盖主要模块；用户可以缩小范围或延后，较大的项目分批完成并保留恢复位置。快速开始、API、前端、部署等栏目只在适用时出现。

Wiki 解释入口、调用链、数据流、正常与异常路径、技术取舍、修改影响和验证方法。页面提供连贯说明，重要章节具有稳定身份；卡片复用章节结论、限定条件和来源，支持按需展开。随包安装的 React 阅读器从项目首页进入，再连接知识树、正文、本页导航、图解与就近来源。人类搜索可以继续翻页；Agent 查询仍受六张卡片和上下文长度预算约束。搜索默认只看当前项目 Wiki；显式选择全体文档时才纳入已登记的 Spec、活动 Plan 和逐文件许可的验证 Markdown。来源是否变化与内容是否经过语义审阅分别显示。

**Agent／模型负责理解、判断和撰写；Runtime 负责搜索、变化检测、校验与保护性保存。** Agent 根据目标选择知识、源码或组合，不注入整库，也不要求每个任务按固定顺序查询。命令不会独立理解项目或生成高质量知识。发现重要缺口、过期或矛盾时，Agent 核实源码，并在授权范围内把可复用认识写回相关知识；明确只读时只报告。没有知识增量的小修可以不更新，无活动 Agent 时只登记待处理内容。

例如取消机制改变后，Agent 读懂新的调用和状态变化，修改正文与 Mermaid；更新工具检查期间的来源漂移、并发创建和人工修订，保护性保存正文、目录和持久状态；下一个会话可以检索到这些新知识。未精确引用的源码文件可留下按主题与范围记录的持久处置，来源指纹改变后重新核实。承诺知识同步的任务记录受影响来源、处置、知识版本和核实范围。升级只更新工具与受管理规范，不默认重写全库。

阅读器随项目采用或升级一起安装。可在 `.lumine/project.json` 设置可选的 `displayName` 作为项目展示名；未设置时显示中性名称，不从本机路径猜测。可以直接告诉 Agent：“打开这个项目的知识库”“重启 Wiki 阅读器”或“停止 Wiki 阅读器”，由 `lumine-knowledge` 按需管理本项目服务。运行需要 Node.js，无需单独安装前端依赖或联网资源；直接阅读 Markdown 或让 Agent 检索知识不需要启动服务。

常用终端命令是可组合的工具，用户不必逐个执行：

```bash
./.lumine/cli wiki map
./.lumine/cli wiki query "取消后为什么还要核对任务状态"
./.lumine/cli wiki show <knowledge-id>#<section-id>
./.lumine/cli wiki related <knowledge-id>
./.lumine/cli wiki scan
./.lumine/cli wiki serve --port 4318
./.lumine/cli wiki check
```

`query/show/map/related` 帮助查找与展开，`scan` 提供变化线索，`classify` 保存未引用源码文件的范围处置，`update` 接收 Agent 已写好的文本，处理三方比较、候选、冲突和恢复。Wiki Markdown 顶部只保留身份与摘要，详细来源、章节、关系和图声明放在同一文件文末的结构化块；旧头部继续可读，`wiki format plan/apply` 逐篇保护性转换可迁移页面，未完成更新及持久状态受到保护。检查结果不能代替语义审阅、真实运行或用户接受。图解支持架构、时序、流程、状态及数据关系，靠近文字说明，并保留放大、缩放、平移、重置、来源定位与文本复制／导出。错误图不会阻塞正文。

知识真源是 Markdown、Mermaid 和文本元数据，卡片是可选择、搜索、复制的 HTML。知识生产不生成卡片图片、缩略图或持久图像，不调用视觉模型，也不把渲染的 SVG 发给模型。Mermaid 在浏览器生成 SVG DOM；用户主动 SVG 导出由浏览器本地完成，不回写知识真源。无需额外模型账号或后台生成服务。

## 目录、语言与恢复

```text
.lumine/                  配置、Runtime、任务与维护状态
  wiki-state/             可共享的持久知识状态
  local/wiki/             可重建缓存与本机运行状态
.agents/skills/           四个规范日常 Skill
docs/product-specs/      产品方案
docs/exec-plans/         技术方案与执行历史
docs/repo-wiki/          默认知识正文
docs/validation/         验证证据
```

知识正文和必要维护状态可纳入 Git，索引与本机缓存默认忽略。清缓存不丢失人工修订、有效候选和冲突；重新调用模型生成不算无损重建。全新克隆无需调用模型即可阅读和检索已有知识。`.lumine/local/` 的其他内容可能包含私有输入和迁移恢复文件，不应把整个目录当作缓存清空。

初始化语言覆盖入口、Skill、模板、CLI 和阅读页。原文按自身语言维护；切换页面语言不翻译正文。永久切换通过迁移更新默认值与受管理资源，默认不批量翻译历史。

## 在不同 Agent 中使用

公共规则只在 `AGENTS.md` 和 `.agents/skills/` 保存；Adapter 转换宿主协议，不复制另一套 Skill。只安装你选中的 Adapter。取消选择时，升级仅移除 Lumine 管理且未经修改的配置；已修改或混用的设置会保留待审阅。

宿主支持会影响 Hook、自动继续和 Skill 发现，不改变目标与证据职责。配置存在、静态检查通过和真实宿主生效分别报告。本次重构的新入口和 CLI 已在 Codex 会话中执行；社区 Adapter 保留协议与分发回归覆盖，但尚未逐一在真实宿主中验收。

阅读[接入方式与限制](docs/adapter-compatibility.zh-CN.md)。需要检查当前环境时让 Agent 运行：

```bash
./.lumine/cli adapter check current
```

Codex 用户也可以使用仓库提供的 Plugin 包装；它与独立安装是同一规范 Skill 的分发方式，无需重复安装两份。跨产品、用户级配置和外部发布仍遵守各自授权边界。

## 升级与迁移

更新全局入口可使用：

```bash
npx skills update lumine-harness -g -y
```

手动克隆使用其已配置远端做 fast-forward 更新。随后让 Agent 为项目生成升级提案并按授权应用；更新入口不等于项目已升级。迁移列出基线和备份，保护现有修改，支持中断恢复，验证后才标记完成。不会自动提交、推送或发布。

旧 `.harness/` 项目由独立迁移工具处理。临时转发入口在宿主验证后退出；日常 Skill 和 Runtime 使用 `.lumine/`，不长期保留第二套旧工作流。历史记录与恢复备份继续保留。

维护者请阅读 [AGENTS.md](AGENTS.md)。English documentation: [README](README.md)。许可证：[MIT](LICENSE)。
