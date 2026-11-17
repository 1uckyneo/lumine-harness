---
id: "{{knowledge_id}}"
title: "{{title}}"
summary: "{{summary}}"
type: architecture
status: current
locale: en
---

# {{title}}

<!-- Read lumine-knowledge's writing and reading-expression guides first. This demonstrates metadata and stable anchors, not a mandatory outline. Choose the actual page role and current/proposed/historical state. Normative authority comes from AGENTS, never from type alone. Answer the reader's question before introducing necessary concepts and conditions. Business journeys, procedures, mechanisms and standards need different explanation orders. -->

{{A direct opening answer to the reader's question}}

<a id="{{stable_section_id}}"></a>
## {{The next question the reader needs answered}}

{{Explain the process, conditions, result and important exceptions using verified sources}}

<!-- Add sections, diagrams or declared view blocks only when they explain something. Register each Mermaid diagram by order with id/title/caption/sources and a stable preceding anchor. Explicit lumine-view fences support steps, comparisons, terms, code, details and registered explainers. Use meaningful source display titles while preserving exact paths; keep internal source IDs out of prose. Remove these authoring notes, placeholders and checklists from the delivered page. -->

<!-- lumine-wiki-metadata:v1
{
  "reading": {
    "question": "{{The principal reader question}}",
    "audience": "{{The reader and their prior knowledge}}",
    "purpose": "{{What the reader should understand or accomplish}}"
  },
  "tags": [],
  "aliases": [],
  "repositories": ["{{repo_id}}"],
  "sources": [
    { "id": "source-1", "repoId": "{{repo_id}}", "path": "{{relative_source_path}}", "title": "{{Source responsibility}}" }
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
