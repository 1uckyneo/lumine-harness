# AGENTS.md - {{project_name}}

## Scope and boundaries

{{implementation_surface}}

Run code, verification, and Git operations in the actual implementation repository. Resolve the Harness root using .lumine/root.json and project identity, not the nearest Git root. Preserve write/read-only boundaries and existing changes. Do not automatically commit, push, deploy, switch branches, or rewrite history.

## Read as needed

- README.md: setup and usage.
- docs/repo-wiki/README.md: architecture, implementation entry points, domain language, engineering material, and Lumine guides; .lumine/project.json selects the knowledge root.
- docs/workflow-artifacts.md: Spec, Plan, Wiki, and Validation responsibilities.
- docs/product-specs/ and docs/exec-plans/active/: product requirements and this technical change; completed/ retains execution history.
- docs/validation/: verification and adoption acceptance; .lumine/: configuration, tasks, and maintenance state.
- .agents/skills/: the sole public location of canonical Skills.
- {{repo_rules_entry}}

{{directory_map}}

{{fact_index_targets}}

## Everyday work

Read applicable Skills: lumine-plan for product/technical planning, lumine-design for visual/interaction choices, lumine-run for implementation, recovery, verification, and diagnosis, and lumine-knowledge for knowledge and its reader. A name match or directory does not establish a read. Use existing project service extensions; distinguish business services from the Wiki reader.

Product work follows Spec → (necessary design → update the same Spec) → Exec Plan → Run. The Agent assesses readiness and the next step; each handoff requires explicit human confirmation of concrete deliverables. Work autonomously within a stage without repeating confirmation. Readiness questions, document status, and early broad intent do not authorize the next stage. See [Stage handoffs](.agents/skills/lumine-plan/references/stage-handoff.md). Verification during or after Run needs no separate confirmation. Bounded maintenance, verification-only work, and diagnosis retain their scope; diagnosis does not authorize repair.

Checks are Runtime tools, not a fifth Skill. Use ./.lumine/cli --help for interfaces. Structural checks do not replace semantic review, actual operation, or user acceptance.

## Standards, knowledge, and facts

- Keep minimal mandatory rules here and link applicable authorized standards directly. Read relevant standards in full, not retrieval snippets. Maintain one body per standard, example, and implementation topic. These rules and authorized attachments take precedence; legacy code does not override standards.
- Spec owns intended behavior; Plan owns this technical change and progress. Wiki holds current knowledge, confirmed lasting domain language and decisions, usage guides, and authorized standards. State authority and implementation status. Unimplemented proposals are not current facts; distinguish source, tests, operation, deployment, and user acceptance.
- Ordinary knowledge synchronization cannot change standards or authorization. Explain rule changes and review affected content. Relate Wiki pages through prose and relations, not source snapshots; relations do not automatically invalidate freshness.
- Choose Wiki, source, or both for the question; preserve verified findings within authorization and honor explicit read-only requests. Search ranking and card budgets never limit authoritative rules.
- New prose and topic filenames follow project locale by default, retaining README, template names, and necessary technical terms. Stable IDs, AC items, and sections are independent of filenames. Do not bulk-rename existing files; use Windows-compatible names.
- Markdown, Mermaid, and text sources are canonical knowledge. Knowledge maintenance creates no images or vision-model input. Keep secrets, private addresses, and customer material out of public documents, logs, and screenshots.
- .lumine/wiki-state/, tasks, and evidence are durable assets; only .lumine/local/wiki/ holds rebuildable caches and machine state. Preserve human content, useful candidates, conflicts, and unique recovery material.

## Collaboration and closeout

Give parallel writers exclusive ownership and integrate serially. Store evidence in Validation and current summaries/links in the Plan. Required task-related knowledge synchronization belongs to completion; unrelated debt does not block it.

Emit exactly one WORK_STATUS: done|continue|blocked, meaning this request is complete, autonomous work can continue, or a concrete condition is needed. Explain the reason and next action. Status grants no authorization; a completed diagnosis can include failures. Report installation, content completion, and actual verification separately.

## Project conventions and authorized standards

{{project_specific_rules}}
