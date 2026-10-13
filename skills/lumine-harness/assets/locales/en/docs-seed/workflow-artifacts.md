# How work artifacts fit together

Lumine keeps goals, technical plans, existing knowledge, and actual evidence in distinct authoritative records. Users state outcomes in natural language; Agents assess the current stage, applicable capabilities, and next step. Users confirm stage handoffs without manually dispatching Skills.

| Artifact | Question answered | Maintenance |
| --- | --- | --- |
| Product Spec | Whose problem is solved, what behavior and scope are intended, and how is acceptance judged? | Evolve the product proposal in place: overview, scenarios, rules, and stable AC items. |
| Exec Plan | How will this change be implemented, where are we now, and what is next? | Reference applicable Specs/AC items; maintain current approach, progress, and evidence summaries. |
| Repo Wiki | What are the existing mechanisms, confirmed domain language and lasting decisions, standards, and usage? | Distinguish current facts, standards, examples, and guides by authority and implementation status; maintain one body with source and valid decisions. |
| Validation | What actually happened, with what outcome and evidentiary scope? | Preserve date, actions, code/environment applicability, and original evidence without rewriting historical conclusions. |

Product work follows Spec → (necessary design → Spec update) → Exec Plan → Run, with explicit human confirmation at each handoff. Omit design and its Spec update when design is unnecessary. The Agent checks the goal, material, repository facts, and applicable Skills before recommending the next step, then works autonomously within the confirmed stage. A Spec-only discussion produces no technical Plan. Verification during or after Run needs no separate confirmation. Bounded repairs, rule maintenance, and verification-only work retain their own scope without the full product workflow. See [Stage handoffs](../.agents/skills/lumine-plan/references/stage-handoff.md) for readiness, confirmation evidence, and recovery; this page owns artifact responsibilities only.

## Everyday capabilities

- lumine-plan: product/technical planning and semantic review.
- lumine-run: implementation, recovery, verification, and diagnosis; verification does not automatically repair.
- lumine-knowledge: discovery, retrieval, and knowledge maintenance.
- lumine-design: concrete visual and interaction choices.

./.lumine/cli supplies deterministic checks, not semantic judgment. A completed diagnostic task can report failures without authorizing repairs.

## References, language, and history

Documents, acceptance items, sections, and diagrams have stable identities separate from readable filenames. New prose and topic filenames follow project locale by default, retaining README, template names, and necessary technical terms. Do not bulk-rename existing material; respect Windows reserved names, invalid characters, trailing dots/spaces, and case/Unicode collisions. A changed Spec item affects only Plans referencing it, and a fingerprint is not approval. Historical evidence remains bound to its original baseline.

Project language controls defaults for new content; existing documents retain their own language. Present current conclusions before technical detail and history, omit irrelevant sections, and link full logs. Choose useful design material without duplicating a mandatory attachment bundle.

## Knowledge and implementation

A proposed Plan does not become Wiki implementation fact prematurely. Store confirmed domain language and lasting decisions in relevant Wiki topics with confirmation evidence, contexts, and unimplemented boundaries; complete terms and necessary ADRs need no separate domain/decisions ledger. AGENTS may directly authorize Wiki standards. Standards, explanatory examples, and implementation facts have different authority; ordinary synchronization cannot relax rules. Architecture maps belong in Wiki rather than another default root ARCHITECTURE. Distinguish source, observed behavior, and deployment scope.

The Agent maintains knowledge after understanding sources. Organize the hierarchy around actual capabilities and cover major modules at initial setup by default. During tasks, choose Wiki, source, or both without mandatory queries. After verifying gaps, stale explanations, or contradictions, preserve reusable findings in affected topics within authorization; explicit read-only requests receive reports only. Tools support search, change clues, and safe saving, not semantic understanding.

Use done, continue, or blocked for closeout and explain blockers and next steps separately. Status grants no authorization. Judge discussion, diagnosis, implementation, runtime verification, and deployment against the current request.

## Questioning and lasting knowledge

Use built-in grill automatically when material ambiguity, conflicting rules, or important tradeoffs warrant it, without mechanically interviewing clear tasks. Before the next question, write each answer round into the same stage's Spec/Plan: product direction, terms, scope, and AC into Spec; technical choices, dependencies, and verification into Plan. Technical constraints discovered during product work remain in Spec until Plan is authorized. Answers, accepting recommendations, and content fingerprints do not approve stage handoffs. Unanswered or partial answers remain open; do not save verbatim chat ledgers.

Preserve complete reusable domain language, overloaded terms by context, and decisions meeting the lasting-record threshold in relevant Wiki topics. Spec/Plan link these records, retaining formation evidence and supersession. Writing each answer does not make every answer an ADR.

## References, history, and adoption delivery

Original requirements and interface material remain in references; history is read-only archive; personal configuration and private originals stay in ignored local storage. Scripts and Skills stay executable in their own locations, explained and linked from Wiki. Before retiring a layer, inventory roles/destinations, preserve originals, integrate unique content, and repair active references. Preserve and report unsafe retirements without maintaining parallel business memory.

Initial adoption delivers project-specific Lumine collaboration, operation/service guides, and major-module knowledge in Wiki. Reuse or generate service extensions from actual needs without inheriting another project's global-install permission. Accept installation, content completion, and actual usage separately. Validation records checklists/evidence, coverage records topics/gaps, and task knowledge records versioned dispositions. Reuse recovery locations without another state machine or changing migration complete. Upgrades address only affected guidance and gaps.
