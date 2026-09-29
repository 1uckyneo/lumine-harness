# 维护与阅读知识

<!-- LH-WIKI-01 -->
来源使用登记仓库身份、相对路径和内容基线。同时维护精确引用与主题监控范围；新增未被引用文件也必须被识别。缺失、改名、分支或未提交修改触发受影响主题评估，不把“没有匹配旧引用”当作无变化。遵守忽略规则，排除凭据、本地私有资料、Runtime 副本、缓存、备份和语义候选。

<!-- LH-WIKI-02 -->
工作包绑定来源、监控范围、正文基线和配置版本。应用前重核相关输入；漂移则保留候选、重新评估，不显示为最新。使用上次生成基线、当前人工内容和候选结果三方合并；无基线页面先保护，仅合并无冲突部分。正文和持久状态作为同一修订提交；逐主题报告结果，禁止半批成功冒充全部完成。

<!-- LH-WIKI-03 -->
正文根由配置决定。`.lumine/wiki-state/` 保存生成基线、身份、来源版本、人工保护、有效语义候选和未解决冲突；适合共享的状态纳入版本管理且不由 Runtime 升级覆盖。`.lumine/local/wiki/` 仅保存可从持久内容恢复的索引、扫描缓存和本机状态。清缓存不能丢失用户决定、唯一候选或恢复材料；不要把整个 local 目录当可删除缓存。

<!-- LH-WIKI-04 -->
知识卡片复用正文摘要，用 HTML DOM 呈现。图标题、标签、读图说明及关系进入文本检索；正文中的 Mermaid 是唯一图源。模型读取文本，不读取渲染后的 SVG。按需在浏览器显示图，支持定位、缩放和文本复制／导出，不生成图片或缩略图文件。

<!-- LH-WIKI-05 -->
页面围绕真实问题组织，解释机制、技术选择、代价和修改边界。图选用架构／组件关系、时序、流程、状态或实际需要的数据关系；给出来源和适用状态。复杂图拆分，不用图数量作验收。人类修订、图解、摘要和来源须同步评估。运行观察与开发源码分开，不推定部署。

<!-- LH-WIKI-06 -->
用 `wiki check` 检查结构和关联，用源码及证据做语义复核。查询任务不要求更新全仓；只有明确需要维护时才应用结果。每个更新以可读的结果、覆盖范围、冲突和未解决事项收口。全新克隆应能无缓存、无模型调用地阅读和搜索已有知识。


## CLI 与知识字段

```bash
./.lumine/cli wiki scan
./.lumine/cli wiki query "目标问题" --limit 6
./.lumine/cli wiki show <id-or-path>
./.lumine/cli wiki update prepare <id>
./.lumine/cli wiki update apply <packet-id> --candidate <candidate.json>
./.lumine/cli wiki check
```

支持 `--root <root>` 与 `--json`。prepare 保存工作包并返回身份；apply 的候选文件是 `{ "candidates": [{ "id": "knowledge-id", "markdown": "完整 Markdown" }] }`。候选保留为可恢复状态，不当作已应用正文。

参考 `docs/templates/repo-wiki.md`。知识 frontmatter 包含 `id`、`title`、`summary`、`type`、`status`、`locale`、`sources` 与 `watchScopes`；状态为 current／proposed／historical。来源使用 `repoId` 和相对 `path`。图在 `diagrams` 数组中用 `id`、`title`、`caption`、`sources` 声明，按正文 Mermaid 块顺序对应；图身份不能依赖渲染 DOM ID。
