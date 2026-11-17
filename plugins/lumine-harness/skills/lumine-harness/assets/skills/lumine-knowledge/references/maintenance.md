# 维护与阅读知识

<!-- LH-WIKI-01 -->
来源使用登记仓库身份、相对路径和内容基线。同时维护精确引用与主题监控范围；新增未被引用文件也必须被识别。对未引用文件，可用 `wiki classify` 按主题、来源范围和文件指纹记录需补解释、现有主题已覆盖或暂缓及理由；文件、范围或主题关联知识正文变化后重新待核实，不能把旧决定当永久忽略。缺失、改名、分支或未提交修改触发受影响主题评估，不把“没有匹配旧引用”当作无变化。遵守忽略规则，排除凭据、本地私有资料、Runtime 副本、缓存、备份和语义候选。

只将获得共享授权的规则纳入共享说明。个人约定可用于本轮操作，但未经明确共享授权，不能引用私人 Skill，或把个人分支、私有路径和操作习惯写入共享 AGENTS、Wiki 或知识来源。

<!-- LH-WIKI-02 -->
工作包绑定来源、监控范围、正文基线和配置版本。应用前重核相关输入；漂移则保留候选、重新评估，不显示为最新。使用上次生成基线、当前人工内容和候选结果三方合并；无基线页面先保护，仅合并无冲突部分。正文和持久状态作为同一修订提交；逐主题报告结果，禁止半批成功冒充全部完成。

<!-- LH-WIKI-03 -->
正文根由配置决定。`.lumine/wiki-state/` 保存生成基线、身份、来源版本、人工保护、有效语义候选和未解决冲突；适合共享的状态纳入版本管理且不由 Runtime 升级覆盖。`.lumine/local/wiki/` 仅保存可从持久内容恢复的索引、扫描缓存和本机状态。清缓存不能丢失用户决定、唯一候选或恢复材料；不要把整个 local 目录当可删除缓存。

<!-- LH-WIKI-04 -->
知识卡片复用正文摘要，用 HTML DOM 呈现。图标题、标签、读图说明及关系进入文本检索；正文中的 Mermaid 是唯一图源。模型读取文本，不读取渲染后的 SVG。按需在浏览器显示图，支持定位、缩放和文本复制／导出，不生成图片或缩略图文件。

<!-- LH-WIKI-05 -->
页面围绕真实问题组织，解释机制、技术选择、代价和修改边界。图选用架构／组件关系、时序、流程、状态或实际需要的数据关系；给出来源和适用状态。复杂图拆分，不用图数量作验收。人类修订、图解、摘要和来源须同步评估。运行观察与开发源码分开，不推定部署。

<!-- LH-WIKI-06 -->
用 `wiki check` 检查结构和关联，用源码及证据做语义复核。调查产生可复用结论时在授权范围内回写受影响知识；明确只读时只报告，不更新全仓。任务若承诺知识同步，记录变化来源、处置理由、对应知识版本与核实范围；保留原文也需要明确核实依据，不能只把任务状态改成“已同步”。来源未变只说明快照一致，语义审阅须另有记录。每个更新以可读的结果、覆盖范围、冲突和未解决事项收口。全新克隆应能无缓存、无模型调用地阅读和搜索已有知识。


## CLI 与知识字段

```bash
./.lumine/cli wiki map
./.lumine/cli wiki scan
./.lumine/cli wiki classify <repo:path> --topic <id> --scope <repo:path> --fingerprint <sha256> --decision covered --reason <text>
./.lumine/cli wiki query "目标问题" --limit 6
./.lumine/cli wiki show <id-or-path>#<section-or-diagram-id>
./.lumine/cli wiki related <id>
./.lumine/cli wiki update prepare <id>
./.lumine/cli wiki update apply <packet-id> --candidate <candidate.json>
./.lumine/cli wiki format plan
./.lumine/cli wiki format apply <document-id>
./.lumine/cli wiki check
```

支持 `--root <root>` 与 `--json`。`classify` 的决定还可为 `needs-explanation` 或 `deferred`；理由与范围、文件指纹一同持久保存。`format plan` 只读列出逐篇资格，`format apply` 以事务转换一篇，未解决更新包对应页面保持旧格式。prepare 保存工作包并返回身份；update apply 的候选文件是 `{ "candidates": [{ "id": "knowledge-id", "markdown": "完整 Markdown" }] }`。候选保留为可恢复状态，不当作已应用正文。

参考 `docs/templates/repo-wiki.md`。知识页顶部只放 `id`、`title`、`summary`、`type`、`status`、`locale`；来源、监控范围、关系、章节和图声明放在同一 Markdown 文末的 `lumine-wiki-metadata:v1` 结构化注释块。原始 Markdown 打开后应先看到主要解释；阅读器、目录和检索会剥离文末块。状态为 current／proposed／historical。来源使用 `repoId` 和相对 `path`。图在 `diagrams` 数组中用 `id`、`title`、`caption`、`sources` 声明，按正文 Mermaid 块顺序对应；图身份不能依赖渲染 DOM ID。旧页的详细 frontmatter 可读，正常新建或修订输出新格式；格式迁移须保护正文、基线、人工差异和待处理候选。

## 章节、目录与变更组

重要标题前放独立 `<a id="稳定章节ID"></a>`，ID 不随标题变化；文末块可用 `sections: [{id: "章节ID", sources: ["来源ID"]}]` 关联精确依据。未关联时返回页面来源，不伪造章节证据。`relations` 使用 `{target: "文档ID#片段ID", kind: related|depends_on|decision, note: "关系说明"}`；目录父子归属只在知识地图维护。

新建、拆页或调整目录时，使用 `wiki update prepare --manifest changes.json`。清单为 `schemaVersion: 1`，`changes` 包含 `kind: create|update`、`id`、新建所需 `path`、相关 `sourceRefs`、`watchScopes` 和可选 `group`。默认把新来源和监控范围加入旧集合；若源码搬迁，需要在 update 变更中显式设 `replaceSources: true`、`replaceWatchScopes: true`，并分别提供非空的新 `sourceRefs`、`watchScopes`。prepare 仍会检查替换后的来源存在，apply 仍会校验快照、候选与人工合并；不凭失效旧路径强行通过。可同时附 `coverage` 和 `referenceMoves`。每个新页预期不存在；同组正文、目录和身份变更不能半完成后冒充可用。`coverage` 本身也有版本，形如 `{"schemaVersion":1,"topics":[...]}`，不能只传 topics；主题用 `id/title/parentId?/questions/sourceScopes/documentRefs/status/reason?`，数组顺序即同级顺序；状态为 planned／partial／covered／deferred，covered 必须有实际内容依据。

纯语义审阅可用 `wiki update review --file review.json`，记录 `documentId/revision/sourceFingerprint/reviewedAt/reviewer/outcome/scope/findings/limitations`，不强迫重写正文。`reviewer` 记录真实的 agent 或 human、author 或 independent；不可把作者自检写成独立审阅。来源核对、语义审阅、运行验证分别说明。

指纹从公开命令取得，不读取 Runtime 内部对象或自行拼接哈希。在已授权保存审阅时，先 `wiki scan --json` 核对当前来源（会保存观察；明确只读时不执行），再 `wiki show <文档ID> --json`。从后者原样取 `id`、`revision`、`sourceObservation.sourceFingerprint`，填入以下记录；`reviewedAt` 使用实际审阅时间。若指纹为空或期间正文／来源改变，重新核实而不是猜值。保存时 Runtime 会再次校验，失配须回到核实步骤。

```json
{
  "documentId": "<show.id>",
  "revision": "<show.revision>",
  "sourceFingerprint": "<show.sourceObservation.sourceFingerprint>",
  "reviewedAt": "<实际 ISO 时间>",
  "reviewer": { "kind": "agent", "role": "author" },
  "outcome": "reviewed",
  "scope": ["实际核实的业务条件与适用范围"],
  "findings": [],
  "limitations": ["尚未执行的适用验证"]
}
```

如果发现问题，`outcome` 用 `issues` 并填写非空 `findings`。例中的结果、角色、范围和限制必须按实际工作填写；纯审阅不改变上次生成基线，也不会将未修正的旧说明自动变成最新。

知识实施复用 `lumine-run` 的任务合同，不另建任务格式。新记录的 `schemaVersion` 为 3，`goal` 和 `scope` 都是非空字符串（scope 不是路径数组或对象），`acceptanceRefs`、`evidence` 是数组；知识工作未完成时使用 `knowledge: {"required":true,"status":"pending","refs":["受影响文档ID"]}`。例如启动记录为 `{"schemaVersion":3,"taskId":"knowledge-maintenance","mode":"implement","goal":"让读者理解本次变化","scope":"受影响的功能说明、图和导航","acceptanceRefs":[],"evidence":[],"knowledge":{"required":true,"status":"pending","refs":[]}}`，通过 `task record <候选JSON>` 保存。它只是启动记录，不是完成证据；更新已有任务先 `task show <taskId>`，保留既有适用字段并在 `record` 时附原样 `--expect <recordHash>`。按项目实际模板和命令输出工作。

只有实际保存且能够恢复的内容才算基线；新建采用“预期不存在”检查，更新采用三方比较。拆页同时维护总览、子页与引用。冲突和中断通过 `wiki update decide/recover` 处理，按命令帮助提供精确对象与原因，不强制覆盖人工修改。

## 资料效力与稳定语言

AGENTS 明确授权的规范附件必须按任务完整读取，不由普通检索预算限制。规范、示例、实现知识和用户指南分别标明职责；旧代码不同不构成放宽规范的依据。规范变更说明有效依据并复核受影响内容，不能将普通知识同步变成政策修改。

已确认的领域语言、上下文和长期决定可以是 Wiki 当前知识，但必须标明“已确认概念／规则”与“实现事实”的区别。完整术语、同词多上下文及必要 ADR 在相关主题保存并链接有效 Spec／Plan 依据；尚未确认方向留在当前 Spec／Plan。Wiki 内部使用正文链接及 relations，不登记彼此为 sources/watchScopes；关系不能自动触发来源过期。长期决定替代时保留形成依据和被替代身份。

## 存储整理与恢复

旧项目先升级 Runtime，再显式执行存储迁移；普通读取不转换格式。

```text
./.lumine/cli wiki storage inspect --json
./.lumine/cli wiki storage check --json
./.lumine/cli wiki storage compact --plan --output <plan.json> --json
./.lumine/cli wiki storage compact --apply <plan.json> --expect <plan-sha256> --json
./.lumine/cli wiki storage recover <operation-id> --json
./.lumine/cli wiki storage recover <operation-id> --rollback --json
```

预演是只读操作，应用须核对精确清单、收益和受保护对象，并在当前授权内执行。expect 是计划文件原始字节的 SHA-256。对象按内容寻址复用，完成包／事务保留轻量回执，活动候选与三方生成基线仍受保护。不要手删 updates、transactions 或 objects；未知、损坏或并发变更先解决具体问题。迁移将项目 schemaVersion 升为 3，workflowVersion 仍为 2；旧 Runtime 拒绝写入。恢复资料留在已忽略的 .lumine-migrations，不能自动删除；回滚遇后续人工修改报告冲突，降级须先恢复旧状态与配置。当前状态、恢复备份和 Git 历史分别统计，普通提交不会抹去历史体积。

## 维护阅读路径

从本次交付、查询中发现的问题或明确整理请求开始，按影响范围维护，不要求每轮全库扫描。使用以下方法完成一条读者路径，不机械创建检查表或新文档：

1. **确定读者要弄懂的事。** 先用一句话说清谁要了解什么，例如“使用者怎样接续失败的批量导出”。从现有首页、模块或场景进入，看看能否找到答案；查不到、答不全、不同入口说法不一致，都是需要调查的线索。新能力应有明确归属，不一定新建一页。
2. **核对变化与依据。** 按需用 `wiki audit / scan / related` 缩小范围，再读实际来源和适用规范。`audit` 只检查结构、引用与变化线索，不能发现所有错误叙述。来源指纹改变不等于业务改变：格式、注释或无关代码变化经核实可保留原文并记录适用的来源观察／审阅；角色、条件、状态、术语或接口变化则必须复核相关解释。不能仅更新指纹来消除提示，也不能据提示批量重写或降低规范。
3. **维护同一问题涉及的整组内容。** 同时检查正文、标题／摘要、图与等价文字、导航、关系和来源。跨模块变化沿角色交接或调用链查看相邻说明。摘要回答用途，正文解释正常路径和关键例外，图表达同一规则；重要安全条件不能因精简而丢失。只按读者独立问题拆页，保留入口和稳定引用；替代的旧说明标明历史及当前去向，避免两份现行规则。
4. **从入口复读并核实。** 不看作者的修改清单，从首页或检索重新回答原问题，说明下一步、条件、失败／恢复和依据。涉及结构或关键规则变化时，优先让未参与撰写的 Agent 独立核对来源和阅读路径；有条件时再做真人阅读。分别记录作者检查、独立 Agent 和真人结果。发现遗漏就修正受影响内容再检验，不能把 CLI 通过当作语义或可用性验收。
5. **按实际结果收口。** 在已有 Plan／Validation／任务知识处置中简记改变了哪些理解、核实了什么、还有什么未解决，不另建维护台账。纯审阅可用 `wiki update review`，仅变化了来源而解释仍成立时明确其依据。更新当前进度和下一步，保留历史证据的原范围；未修正的旧图、摘要或入口仍会误导时，不报告该项知识交付完成。

正文和链接使用项目约定的主要语言；双语内容引用资料的真实标题，不根据 `guide`、`round`、`trial` 等内部编号猜测或直译标题。来源 `id` 是稳定机器身份，不能代替读者名称。新建或修订来源时用可选 `title` 保存可读标题：资料使用原题，源码使用已核实的职责名称；`note` 简述它支持什么判断，不把长篇验证声明当作标题。阅读器也可从 Markdown 原题取得标题，不能仅为补字段重写所有旧页。界面操作文字随当前语言呈现，切换界面语言不会翻译或改写知识真源。缺少语义标题时保留准确文件名，不伪造不存在的资料名称。

先升级 Runtime，预演使用 `wiki storage compact --plan --editorial --output <plan.json> --json`，按文件指纹应用。这将配置升级到 schema 4，保留 workflowVersion 2 和对象存储格式。普通读取不升级。回退前先恢复版本围栏及后续编排变更，避免旧写入器读写新状态。

在现有变更清单附 `navigation`，含 `schemaVersion: 1`、当前首页的 Wiki ID `overview`、`groups`、`unlisted` 和 `norms`。group 的 id 为 understand、operate 或 reference，sections 以 `id/title/description?/documents` 列稳定文档 ID。每页一个主要位置或 `unlisted: [{id,reason}]`。历史留在查找与核实，当前业务与场景放在理解项目。

`norms: [{id,scope}]` 登记由 AGENTS 授权且放在开发与运行的规范；以项目的实际规范索引为准。增加、减少或修改权威范围和规范正文时，先核对人已授权的具体规则，再附 `normativeChanges: [{id,reason}]`。工具记录变更意图，授权来自项目和用户。安全规范保持可见且可完整读取。只调整导航时 `changes` 和候选列表可为空，仍使用同一事务、检查和恢复方式。

## 同步代码后按需维护知识

用户只要求拉取或合并代码时，完成 Git 操作即可。用户提出“拉取后检查知识库是否需要更新”时做只读评估。用户明确要求“拉取并更新相关知识”时，检查后改正仍有语义缺口的内容，这一表达已授权相应知识写入。采用同样方法评估分支合并或补丁，实际 Git 操作仍按项目规则和本轮授权交由 Run 处理。用户自行在终端拉取后，可请求评估明确的变更范围。

1. **确定实际变化。** 接收 Run 交来的仓库 ID、分支、目标远端、操作前后的提交和已有本地改动范围。操作成功且没有待解决冲突时，用 `git diff --name-status -z -M <before> <after>` 比较两个提交的净变化。按 NUL 分隔解析，保留路径中的中文、空格和换行。新增或修改用新路径，删除用旧路径，改名传入旧、新两个路径。用登记的仓库 ID 组装 `repoId:path`，每批最多 1000 条，以独立参数调用 `wiki impact <repo:path...> --json`，合并并去重候选、章节、图、理由和未命中路径。没有实际差异时无需查询。未提交补丁只评估可单独确认的应用差异，无需为建立基线提交。事后检查先还原可核实的对比基线，过期的跟踪引用和已有的脏改动不能当作本次同步结果。拉取失败、基线不明或存在冲突时，报告缺少哪项依据。
2. **核对说明是否已经随代码更新。** 影响结果用于定位候选。对照实际行为、相关正文、摘要、图示、导航、关系及来源。远端交付的知识已覆盖变化时记录为“已随远端同步”，无需重写。核实当前说明仍适用时记录为“无需更新”。仍有过时说明、遗漏或不一致时为“需要更新”。对未命中路径抽查实际变化和已有说明，无法判断时列为“待核实”。阅读器生成资源或 Wiki 状态记录发生变化无需重建全库。必要时读取 `git show <after>:<path>`，避免把本地内容误认成远端内容。
3. **按本轮权限交付。** 只读评估使用 `wiki impact`、直接读取和 Git 只读检查，报告依据和结果。跳过会写来源观察的 `wiki scan` 以及 prepare、review、apply。获准更新时按当前工作区重新准备受影响页面及必要关联内容，用既有工作包和三方合并维护正文、摘要、图示、导航、关系与来源。保留人工修订、有效候选和冲突，只暂停存在无法判断的重叠修改的对象。已同步、无需更新或没有实际变化时，正文和持久化知识状态均可保持零写入。

## 阅读意图与变化输入

需要项目背景时，使用 `wiki context "读者问题" --json`，沿返回的章节、关系和完整规范入口继续核实。实际变化通过 `wiki impact <仓库ID:相对路径...> --json` 提供，也接受已删除路径；未命中单独报告，不能解释为没有影响。关系只提供调查方向，不直接决定是否改写。

维护清单可增加 `briefing: {"question":"本次要解释什么","audience":"读者","purpose":"读完理解什么","preserve":["须保留的人工纠正与条件"]}`。每个准备单元还提供当前原文、生成基线及人工差异、相关主题、章节和图的位置。字段是写作输入，不是新的事实台账。页面长期阅读职责使用同一 Markdown 文末元数据的 `reading: {question, audience?, purpose?}`；普通更改复用原意图，不由一次提示词重塑整个目录。

完整方法和不同文章范式见[写作与编排](写作与编排.md)；声明式内容和解释器登记见[阅读表达](阅读表达.md)。格式示例中的标题要替换成真实读者问题，不能交付机械模板章节。
