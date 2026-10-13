# Bundled grilling and writeback

<!-- LH-GRILL-01 -->
When the user requests grilling/stress-testing, or consequential ambiguity, conflict, or trade-offs affect product direction, acceptance, entity boundaries, or implementation choices, read this Skill's [complete grilling module](../vendor/grilling/INSTRUCTIONS.md). When changing terminology, entity relationships, context boundaries, or enduring decisions, read [complete domain-modeling](../vendor/domain-modeling/INSTRUCTIONS.md) and the relevant format. Merely consuming existing vocabulary means reading its authoritative material, not starting a modeling interview. Planning does not automatically require a full interview.

These complete adapted modules are bundled in the distribution. Do not invoke a global same-name Skill, require another installation, or fetch upstream during use. [Source, license and adaptation notes](../vendor/SOURCE.md) and `vendor/manifest.json` support maintenance and integrity checks; they are not mandatory reading for each task.

<!-- LH-GRILL-02 -->
Map the complete design tree. Ask the entire current frontier whose prerequisites are settled, with numbered questions and recommendations; leave questions dependent on unresolved answers or facts for later rounds. The Agent investigates facts, using delegation where available; pending facts block only downstream branches. Retain unanswered, partial, and rejected recommendations. Silence is not agreement, and finishing sooner does not justify silently narrowing scope. Follow any user preference about question pacing.

After each reply round, write back the settled direction and material outstanding questions before the next round. On resumption, read existing deliverables and confirmation evidence, reconstruct unresolved questions and dependencies, and avoid asking settled questions again. Do not create an interview database.

<!-- LH-GRILL-03 -->
| Settled content | Authoritative home |
|---|---|
| Product goals, behavior, scope, acceptance and ordinary product choices | Current Product Spec |
| This implementation's approach, technical choices, dependencies and recovery | Current Exec Plan |
| Resolved shared terms, Avoid synonyms, entity boundaries and multi-context relationships | Wiki domain-language topic/stable section, or existing equivalent authoritative material |
| Important enduring decisions satisfying all three gates: hard to reverse, surprising without context, and genuine alternatives | Wiki decision topic/stable section, or an existing equivalent decision record |
| Verified implementation and actual validation results | Relevant Wiki implementation topic and Validation; a product decision is not proof of implementation |

Ordinary replies do not need to meet the enduring-decision gate to be recorded. Keep product-relevant technical constraints in the Spec during the product stage without creating an Exec Plan early. Reuse equivalent existing material, create Wiki topics/sections only when useful, and do not default to empty records, root glossaries, `docs/domain/`, `docs/decisions/`, or `docs/adr/`. Spec/Plan link terms and enduring decisions; preserve formation evidence, identity and replacement relationships in durable records. The bundled domain-modeling module provides the formats.

<!-- LH-GRILL-04 -->
Follow the Wiki sources, document types and `proposed/current/historical` status contract. Confirmed language and decisions may be current valid records; this does not mean the corresponding feature is implemented. When a domain/decision change affects product behavior or acceptance meaning, update the affected Spec/AC text and reassess that confirmation scope. Editing only a linked Wiki page does not update the acceptance baseline.

When every relevant branch is settled and no factual prerequisite is pending, present the shared understanding and obtain the relevant stage confirmation. Combine this with the existing concrete-deliverable confirmation in [Stage handoff](stage-handoff.md), without another approval gate. Answers, accepted recommendations and writeback do not authorize stage transitions; do not repeat a still-valid confirmation for the same scope. Explicitly read-only sessions present proposed writebacks without mutating files.
