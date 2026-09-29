# How work artifacts fit together

Lumine keeps goals, technical plans, existing knowledge, and actual evidence in distinct authoritative records. Users state outcomes in natural language; Agents assess the current stage, applicable capabilities, and next step. Users confirm stage handoffs without manually dispatching Skills.

| Artifact | Question answered | Maintenance |
| --- | --- | --- |
| Product Spec | Whose problem is solved, what behavior and scope are intended, and how is acceptance judged? | Evolve the product proposal in place: overview, scenarios, rules, and stable AC items. |
| Exec Plan | How will this change be implemented, where are we now, and what is next? | Reference applicable Specs/AC items; maintain current approach, progress, and evidence summaries. |
| Repo Wiki | How does the system currently work, why, and with what limits? | Cite source and decisions; share one Markdown body and Mermaid text between people and Agents. |
| Validation | What actually happened, with what outcome and evidentiary scope? | Preserve date, actions, code/environment applicability, and original evidence without rewriting historical conclusions. |

Product work follows Spec → (necessary design → Spec update) → Exec Plan → Run, with explicit human confirmation at each handoff. Omit design and its Spec update when design is unnecessary. The Agent checks the goal, material, repository facts, and applicable Skills before recommending the next step, then works autonomously within the confirmed stage. A Spec-only discussion produces no technical Plan. Verification during or after Run needs no separate confirmation. Bounded repairs, rule maintenance, and verification-only work retain their own scope without the full product workflow. See [Stage handoffs](../.agents/skills/lumine-plan/references/stage-handoff.md) for readiness, confirmation evidence, and recovery; this page owns artifact responsibilities only.

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

The Agent maintains knowledge after understanding sources. Organize the hierarchy around actual capabilities and cover major modules at initial setup by default. During tasks, choose Wiki, source, or both without mandatory queries. After verifying gaps, stale explanations, or contradictions, preserve reusable findings in affected topics within authorization; explicit read-only requests receive reports only. Tools support search, change clues, and safe saving, not semantic understanding.

Use done, continue, or blocked for closeout and explain blockers and next steps separately. Status grants no authorization. Judge discussion, diagnosis, implementation, runtime verification, and deployment against the current request.
