# Stage readiness and handoff

<!-- LH-HANDOFF-01 -->
The Agent determines the current stage, whether the material is sufficient, and the recommended next step; the user confirms stage transitions. Skills expose capabilities. Product Spec and Exec Plan both use lumine-plan, but that does not authorize generating them consecutively without confirmation. Investigate, revise, and verify autonomously within a stage; do not add approval steps for each tool call or iteration.

## Choose the next step from the deliverables

<!-- LH-HANDOFF-02 -->
| Current deliverable | Agent assessment and preparation | After user confirmation |
|---|---|---|
| Initial Product Spec | Are product direction, scope, scenarios, and acceptance clear? Do unresolved visual/interaction questions affect implementation? | Enter design if needed; otherwise enter the Exec Plan |
| Design material | Present necessary HTML prototypes, explanations, or other concrete material; check normal and failure states, product alignment, and unresolved choices | Return to the same Product Spec to supplement it |
| Supplemented Product Spec | Incorporate design decisions into behavior, rules, scenarios, and acceptance; link material and explain changes. For presentation-only details, update references and applicability | Enter the Exec Plan |
| Exec Plan | Are the technical approach, scope, tasks, verification, and recovery executable and consistent with the applicable Spec and design? | Enter Run |
| Run and implementation results | Implement the confirmed scope, verify it, and record evidence and remaining work | Verification may happen during or after Run without another stage confirmation |

Design is needed when unresolved presentation, interaction, or feasibility questions affect user experience or implementation choices. Recommend skipping it when existing applicable designs are sufficient, established interface patterns resolve the choices, or no interface is involved. The word “design” alone does not select visual design. Technical architecture, data flow, and implementation tradeoffs belong in the Exec Plan. Verification without a stage confirmation does not authorize publication, destructive actions, or access to unauthorized environments.

## Answering “Can we move to the next step?”

<!-- LH-HANDOFF-03 -->
This asks for an assessment, not approval of the next stage. Read applicable project rules, Skills, actual deliverables, task progress, and confirmation evidence as needed. Verify repository facts that could change the conclusion. Do not turn every document into a mandatory reading list or ask the user to choose a Skill.

Provide a concrete assessment:

- Identify the current stage and evidence, completed work, and handoff readiness.
- Explain whether design is needed and whether existing material can be reused.
- Recommend the next stage and its deliverable; identify material gaps.
- Determine whether existing confirmation covers the handoff. When it does not, present concrete deliverables before asking a clear confirmation question.

For example: “The Spec defines scope and acceptance, but the interactions for expanding the directory and inspecting sources remain unresolved. I recommend an HTML prototype. Design can begin once you confirm this Spec and that next step.” Do not treat readiness as permission or generate the next stage's full deliverables while answering an assessment request.

## Confirmation, resumption, and changes

<!-- LH-HANDOFF-04 -->
Confirmation must come from the user and cover concrete deliverables already presented, their scope, and the next step. “Confirmed, continue” after a clear handoff question, or “Start implementation from this Plan,” can confirm that transition. An ambiguous acknowledgment without a clear object, an earlier broad instruction to finish a feature, an approved field, successful checks, or Agent judgment cannot confirm future transitions in advance.

Briefly preserve confirmation evidence, the deliverable version or content baseline, scope, and permitted next step in existing Spec/Plan or task records. Missing evidence remains unknown; never invent approval. On resumption, check actual progress and semantic changes, and reuse confirmations that still apply. Formatting, title changes, and renames do not automatically invalidate confirmation. Changes to product behavior, scope, acceptance, or material design choices return to the relevant deliverable for confirmation of the affected part only. Local technical adjustments within a stage can be recorded in the Plan.

Stop at a pending handoff; do not use continue or automatic follow-up to cross it. When only the current stage or a readiness assessment was requested, that request can be complete while the next stage awaits confirmation. When an unfinished overall task cannot proceed without stage confirmation, report blocked with the specific deliverable and next step to confirm. Status, Skill selection, and Runtime cannot create authorization.

## Bounded direct requests

<!-- LH-HANDOFF-05 -->
Standalone read-only reviews, verification, and diagnosis, and explicitly requested local maintenance/repairs that introduce no new product decisions, preserve the agreed behavior contract, and require no independent cross-task coordination, need not create the full Spec/design/Plan set. Still identify the goal, scope, and evidence. A small file count does not qualify a task; this exception cannot bypass confirmations for feature work or product changes. Diagnostic failures do not authorize repair, and implementation authorization does not authorize committing, pushing, or deploying.
