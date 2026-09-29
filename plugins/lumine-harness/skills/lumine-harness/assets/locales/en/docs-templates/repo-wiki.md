---
id: "{{knowledge_id}}"
title: "{{title}}"
summary: "{{summary}}"
type: architecture
status: current
locale: en
tags: []
aliases: []
repositories: ["{{repo_id}}"]
sources:
  - id: source-1
    repoId: "{{repo_id}}"
    path: "{{relative_source_path}}"
relations: []
watchScopes:
  - repoId: "{{repo_id}}"
    path: "{{module_relative_path}}"
diagrams: []
---

# {{title}}

## The question this topic answers

<!-- Answer a real question directly, then state applicability. Cards reuse the frontmatter summary rather than maintaining another body. Replace every placeholder and verify sources and current/proposed/historical status before creating real knowledge. -->

## Mechanism and diagrams

<!-- Explain key paths from evidence. Add Mermaid fenced blocks when useful and register {id, title, caption, sources: [source-1]} in diagrams in block order. Diagram text is canonical; do not save separate images or thumbnails. -->

## Technical choices and limits

<!-- Explain evidence, reasons, costs, change boundaries, and unverified scope. Label rationale inferred from code as inference. -->

## Sources and related work

<!-- Cite specific sources and related Wiki, Specs, and Plans. Distinguish source implementation, observed operation, and deployment conclusions. -->
