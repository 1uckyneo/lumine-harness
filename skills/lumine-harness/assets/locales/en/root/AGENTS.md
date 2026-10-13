# AGENTS.md - {{project_name}}

## Scope and basic constraints

{{implementation_surface}}

Run code, verification, and Git operations in the actual implementation repository. Resolve the Harness root using .lumine/root.json and project identity, not the nearest Git root. Preserve write/read-only boundaries, existing changes, and unique recovery material. Do not automatically commit, push, deploy, switch branches, or rewrite history. Keep secrets, private addresses, and customer material out of public documents, logs, and screenshots. `.lumine/` contains tasks, knowledge state, and private material; do not clear it as a cache.

## Required standards

{{standards_entry}}

Before editing code, tests, or engineering rules, read the declared standards index in full, then read applicable standards, current templates, and examples and follow their pre-edit requirements. Search matches and excerpts do not replace required reading. If an index lacks this task, check existing rules and sources rather than treating the gap as unrestricted permission.

This file and the standards explicitly designated here govern actions. Standards, explanatory examples, and implementation facts have different authority; legacy code does not override standards. Maintain one body per rule. Ordinary documentation or knowledge synchronization cannot change standards or authorization. Update detailed rules in their owning standard; update this file only when scope or routing changes.

## Work and artifact entry points

- [README](README.md): project setup and usage.
- [Project Wiki](<{{wiki_entry}}>): architecture, current implementation, domain language, lasting decisions, and guides.
- [Work artifact responsibilities](docs/workflow-artifacts.md): Product Spec owns the product proposal and acceptance; Exec Plan derives technical approach, execution arrangements, and records from the Spec; Validation retains actual evidence.
- .agents/skills/: actually read the applicable lumine-plan, lumine-design, lumine-run, or lumine-knowledge Skill. Read project service extensions for service operations and distinguish business services from the Wiki reader.

Product work follows Product Spec → (necessary design → update the same Spec) → Exec Plan → Run, with explicit human confirmation of concrete deliverables at each handoff. Work autonomously within a stage without repeating confirmation for the same scope. See [Stage handoffs](.agents/skills/lumine-plan/references/stage-handoff.md). Bounded maintenance, verification-only work, and diagnosis retain their authorization scope; diagnosis does not authorize repair.

## Collaboration and closeout

Give parallel writers exclusive ownership and integrate serially. Maintain affected artifacts within this task's authorization and honor explicit read-only requests. Structural checks do not replace semantic review, actual operation, or user acceptance. Report evidence and unverified scope separately.

Emit exactly one WORK_STATUS: done|continue|blocked, meaning this request is complete, autonomous work can continue, or a concrete condition is needed. Explain the reason and next action separately. Status grants no authorization; installation does not establish content completion or actual-usage acceptance.
