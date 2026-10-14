# Document navigation and maintenance conventions

This page provides navigation and artifact responsibilities without collecting unrelated topic bodies into an index. See [AGENTS.md](../AGENTS.md) for basic constraints and required reading by task. Maintain applicable content without creating empty documents to complete a directory tree.

## Navigation and responsibilities

| Artifact | Default location | Authoritative content |
| --- | --- | --- |
| Product Spec | `product-specs/` | Product goals, scope, scenarios, rules, acceptance criteria, and open questions maintained in place. |
| Exec Plan | `exec-plans/active/`, history in `completed/` | Technical approach, tradeoffs, execution/verification arrangements, progress, and records derived from applicable Specs/AC items; links detailed evidence. |
| Design material | [Design documents](design-docs/index.md) | Reviewable visuals, interactions, and applicability referenced by Specs/Plans, without duplicating product rules. |
| Repo Wiki | [Knowledge entry](<{{wiki_docs_entry}}>) | Architecture, implementation, confirmed domain language/lasting decisions, standards, examples, and guides with explicit authority and implementation status. |
| Validation | `validation/` | Actual actions, results, dates, code/environment scope, and original evidence; distinguishes tests, operation, deployment, and user acceptance. |
| Original references | [Reference material](references/index.md) | Original requirements, interface manuals, and external sources, linked from Wiki explanations. |
| History | `archives/` | Retired material in its original context, not current rules, approval, or runtime evidence. |

Adapt default locations to actual content and project configuration, keeping one authoritative Wiki root. Store personal preferences/Skills, private configuration, credentials, and unique private recovery originals in ignored local locations outside shared documents.

## Identity, references, and history

- Maintain one body per item. Plans reference applicable Specs/AC items and content baselines. Wiki distinguishes standards, examples, implementation facts, and confirmed decisions; confirmation does not prove implementation.
- Document IDs, AC items, sections, and diagrams retain stable identities independently of readable filenames. Renames preserve necessary references and readable history. Spec changes only require review of affected Plans; content fingerprints do not grant approval.
- New prose and topic filenames follow project language, retaining README, template names, necessary technical terms, and dates. Do not bulk-translate or rename existing material. Use Windows-compatible names: no reserved names, control characters, `< > : " / \ | ? *`, trailing dots/spaces, or case/Unicode collisions.
- Present current conclusions before detail and history, omit irrelevant sections, and link full logs. Keep historical evidence's original dates, scope, and conclusions without inventing approval.

## Workflow entry points

See [Stage handoffs](../.agents/skills/lumine-plan/references/stage-handoff.md) for readiness and confirmation, and [Planning and grilling](../.agents/skills/lumine-plan/references/grill.md) for questioning and lasting domain knowledge.

See [lumine-run](../.agents/skills/lumine-run/SKILL.md) for implementation/recovery/verification, [lumine-knowledge](../.agents/skills/lumine-knowledge/SKILL.md) for knowledge and its reader, and [lumine-design](../.agents/skills/lumine-design/SKILL.md) for interface choices and presentation conventions. Find project usage guides through Wiki; this index does not duplicate Skill procedures.
