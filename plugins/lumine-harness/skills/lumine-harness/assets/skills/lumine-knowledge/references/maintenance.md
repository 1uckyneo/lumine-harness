# 维护与阅读知识

<!-- LH-WIKI-01 -->
来源使用登记仓库身份、相对路径和内容基线。同时维护精确引用与主题监控范围；新增未被引用文件也必须被识别。对未引用文件，可用 `wiki classify` 按主题、来源范围和文件指纹记录需补解释、现有主题已覆盖或暂缓及理由；文件、范围或主题关联知识正文变化后重新待核实，不能把旧决定当永久忽略。缺失、改名、分支或未提交修改触发受影响主题评估，不把“没有匹配旧引用”当作无变化。遵守忽略规则，排除凭据、本地私有资料、Runtime 副本、缓存、备份和语义候选。

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

新建、拆页或调整目录时，使用 `wiki update prepare --manifest changes.json`。清单为 `schemaVersion: 1`，`changes` 包含 `kind: create|update`、`id`、新建所需 `path`、相关 `sourceRefs`、`watchScopes` 和可选 `group`。默认把新来源和监控范围加入旧集合；若源码搬迁，需要在 update 变更中显式设 `replaceSources: true`、`replaceWatchScopes: true`，并分别提供非空的新 `sourceRefs`、`watchScopes`。prepare 仍会检查替换后的来源存在，apply 仍会校验快照、候选与人工合并；不凭失效旧路径强行通过。可同时附 `coverage` 和 `referenceMoves`。每个新页预期不存在；同组正文、目录和身份变更不能半完成后冒充可用。`coverage.topics` 用 `id/title/parentId?/questions/sourceScopes/documentRefs/status/reason?`，数组顺序即同级顺序；状态为 planned／partial／covered／deferred，covered 必须有实际内容依据。

纯语义审阅可用 `wiki update review --file review.json`，记录 `documentId/revision/sourceFingerprint/reviewedAt/reviewer/outcome/scope/findings/limitations`，不强迫重写正文。`reviewer` 记录真实的 agent 或 human、author 或 independent；不可把作者自检写成独立审阅。来源核对、语义审阅、运行验证分别说明。

只有实际保存且能够恢复的内容才算基线；新建采用“预期不存在”检查，更新采用三方比较。拆页同时维护总览、子页与引用。冲突和中断通过 `wiki update decide/recover` 处理，按命令帮助提供精确对象与原因，不强制覆盖人工修改。
