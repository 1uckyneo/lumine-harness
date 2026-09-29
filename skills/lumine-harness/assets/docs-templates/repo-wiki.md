---
id: "{{knowledge_id}}"
title: "{{title}}"
summary: "{{summary}}"
type: architecture
status: current
locale: zh-CN
tags: []
aliases: []
repositories: ["{{repo_id}}"]
sources:
  - id: source-1
    repoId: "{{repo_id}}"
    path: "{{relative_source_path}}"
relations: []
sections: []
watchScopes:
  - repoId: "{{repo_id}}"
    path: "{{module_relative_path}}"
diagrams: []
---

# {{title}}

<a id="section-1"></a>

## 这个主题回答什么

<!-- 直接回答真实问题，再解释适用范围。摘要由 frontmatter 复用给卡片，不另存卡片正文。创建实际知识前替换全部占位符、核实来源及 current/proposed/historical 状态。 -->

<a id="section-2"></a>

## 机制与图解

<!-- 围绕来源解释关键路径。需要图时写 Mermaid fenced block，并按出现顺序在 diagrams 中登记 {id, title, caption, sources: [source-1]}。图是文本真源，不另存图片或缩略图。 -->

<a id="section-3"></a>

## 技术取舍与限制

<!-- 说明依据、理由、代价、修改边界和未验证范围。代码推导的设计理由明确标为推断。 -->

<a id="section-4"></a>

## 来源与关联

<!-- 引用具体来源及相关 Wiki、Spec、Plan；源码、运行观察和部署结论分开。 -->
