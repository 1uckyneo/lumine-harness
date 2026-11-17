---
id: "{{knowledge_id}}"
title: "{{title}}"
summary: "{{summary}}"
type: architecture
status: current
locale: zh-CN
---

# {{title}}

<!-- 先读 lumine-knowledge 的「写作与编排」「阅读表达」。这是元数据与稳定锚点示意，不是每篇文章必须照填的提纲。选择实际职责的 type，current/proposed/historical 与事实一致；规范效力来自 AGENTS 授权，不由 type 产生。用连贯正文先回答主要问题，再解释必要概念与条件。业务过程、操作指南、技术机制与工程规范采用不同顺序，不把所有页面写成技术取舍清单。 -->

{{直接回答读者问题的导语}}

<a id="{{stable_section_id}}"></a>
## {{读者接下来需要理解的问题}}

{{依据实际来源解释过程、条件、结果及重要例外}}

<!-- 只增加有解释价值的章节、图或声明式内容块。Mermaid 在文末 diagrams 中按顺序登记 id/title/caption/sources，前置稳定锚点；显式 lumine-view 可表达步骤、比较、术语、代码、补充与已登记解释器。来源的显示标题用读者可理解的职责，技术路径保持准确；内部来源编号不进入叙述。不要把写作检查单、评分和模板注释保留到交付正文。 -->

<!-- lumine-wiki-metadata:v1
{
  "reading": {
    "question": "{{本页主要回答什么}}",
    "audience": "{{读者及已有背景}}",
    "purpose": "{{读完能理解或完成什么}}"
  },
  "tags": [],
  "aliases": [],
  "repositories": ["{{repo_id}}"],
  "sources": [
    { "id": "source-1", "repoId": "{{repo_id}}", "path": "{{relative_source_path}}", "title": "{{来源职责}}" }
  ],
  "relations": [],
  "sections": [
    { "id": "{{stable_section_id}}", "sources": ["source-1"] }
  ],
  "watchScopes": [
    { "repoId": "{{repo_id}}", "path": "{{module_relative_path}}" }
  ],
  "diagrams": []
}
-->
