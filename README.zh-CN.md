# Lumine Harness

让人和 Agent 以清楚的目标、可恢复的执行记录和有来源的知识协作交付软件。Lumine 中文写作“[卢米安](https://weibo.com/u/3316905545)”。

Lumine 是项目级工作流：宿主提供模型、工具与生命周期，Lumine 保存工程边界、产品方案、执行进度、知识和证据。适用于单仓或多仓项目，也支持共同父目录没有 Git 的形态。

## 开始使用

运行分发包需要 Node.js 18 或更高版本；维护本仓库或重新构建 Runtime 需要 Node.js 22.18+ 或 24.11+。选择一个来源安装同一个初始化 Skill：

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

## 日常开发怎么使用

直接说明目标，不必逐个调用 Skill。完整功能通常是：

**产品 Spec → 必要设计 → 技术 Exec Plan → 实施验证 → 相关知识更新。**

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
按已经确认的方案继续完成，并验证实际结果。
只诊断这个问题，报告原因和证据，不要自动修复。
解释登录与动态路由如何协作，并指出源码依据。
```

没有新产品决定、不改变既定行为合同且无需独立协调的小修复可直接处理。既有授权跨阶段继续有效；真实未决取舍才需要用户决定。生成计划、文件写着 approved 或工具检查通过，都不能替代实际授权和验收。

## 人和 Agent 共用的工程资料

- **Product Spec**：产品问题、场景、业务规则、范围及稳定验收项。
- **Exec Plan**：本次技术选择、当前进度、下一步和证据摘要；引用 Spec，不复制需求。
- **Repo Wiki**：已有机制、架构、技术理由和限制，关联源码、决定与运行证据。
- **Validation**：实际操作和结果；测试、运行、部署及用户接受分别表达。

正文先解释当前结论，再展开技术细节和历史。支持中文、英文和混合文件名，无需手写英文 slug；稳定 ID 与名称分离。已有历史、人工修订和真实批准不会被批量改写。

可以让 Agent 归档已完成的计划，或在继续工作时恢复计划。对当前格式的计划，`task doc-archive` 和 `task doc-restore` 会在 `active/` 与 `completed/` 之间移动文档，保留稳定 ID、更新当前链接并记录可恢复的操作。操作需要当前正文哈希以保护期间产生的新修改；历史证据保持原样。

## 图文 Repo Wiki

默认知识正文在 `docs/repo-wiki/`，可以显式配置另一个唯一根。知识卡片为 HTML DOM，摘要、Markdown 和 Mermaid 文本来自同一份内容。浏览页提供检索、筛选、目录、关联来源、Spec／Plan 阅读和稳定引用。

图用于解释架构、组件关系、时序、流程、状态和实际需要的数据关系。浏览器即时渲染，支持放大、缩放、平移、重置、来源定位及 Mermaid 文本复制／导出。复杂图拆成专题；图失败时正文和源码仍可读。

知识的生成、查询、维护和审阅全程使用文本：不生成卡片图片、缩略图或持久图像，不调用 imagegen 或视觉模型，不把浏览器渲染的 SVG 发送给模型。浏览器内部可使用 SVG DOM 绘图，它不是一份供模型读取的图片。无需额外模型账号或后台生成服务；语义更新由当前活动 Agent 完成。

常用终端命令：

```bash
./.lumine/cli wiki query "登录与动态路由"
./.lumine/cli wiki show <knowledge-id>
./.lumine/cli wiki scan
./.lumine/cli wiki serve --port 4318
./.lumine/cli wiki check
./.lumine/cli check health
```

查询缺失、过期或矛盾时回到源码核实；权威项目规则不受卡片检索排名影响。增量维护保护人工内容，保存候选和冲突，明确报告未完成范围。没有活动 Agent 时只登记待处理，不假装自动生成已完成。

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
