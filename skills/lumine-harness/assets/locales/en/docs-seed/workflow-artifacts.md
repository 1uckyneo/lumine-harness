# How work artifacts fit together

Lumine keeps goals, technical plans, existing knowledge, and actual evidence in distinct authoritative records. Users state outcomes in natural language; Agents continue within authorization without requiring manual stage commands.

| Artifact | Question answered | Maintenance |
| --- | --- | --- |
| Product Spec | Whose problem is solved, what behavior and scope are intended, and how is acceptance judged? | Evolve the product proposal in place: overview, scenarios, rules, and stable AC items. |
| Exec Plan | How will this change be implemented, where are we now, and what is next? | Reference applicable Specs/AC items; maintain current approach, progress, and evidence summaries. |
| Repo Wiki | How does the system currently work, why, and with what limits? | Cite source and decisions; share one Markdown body and Mermaid text between people and Agents. |
| Validation | What actually happened, with what outcome and evidentiary scope? | Preserve date, actions, code/environment applicability, and original evidence without rewriting historical conclusions. |

Features usually follow Spec → necessary design → Plan → implementation/verification → affected knowledge updates. Product-only discussion needs no technical Plan. Judge direct repairs by behavior contracts and decision needs, not file count. Existing authorization remains valid; only real unresolved choices need discussion.

## Everyday capabilities

- lumine-plan: product/technical planning and semantic review.
- lumine-run: implementation, recovery, verification, and diagnosis; verification does not automatically repair.
- lumine-knowledge: discovery, retrieval, and knowledge maintenance.
- lumine-design: concrete visual and interaction choices.

./.lumine/cli supplies deterministic checks, not semantic judgment. A completed diagnostic task can report failures without authorizing repairs.

## References, language, and history

Documents, acceptance items, sections, and diagrams have stable identities separate from readable Chinese/English filenames. A changed Spec item affects only Plans referencing it, and a fingerprint is not approval. Historical evidence remains bound to its original baseline.

Project language controls defaults for new content; existing documents retain their own language. Present current conclusions before technical detail and history, omit irrelevant sections, and link full logs. Choose useful design material without duplicating a mandatory attachment bundle.

## Knowledge and implementation

A proposed approach in a Plan does not become current Wiki knowledge before implementation. Promote only affected stable findings afterward. Engineering conventions cite authoritative rules without changing action boundaries; distinguish source, observed behavior, and deployment scope.
