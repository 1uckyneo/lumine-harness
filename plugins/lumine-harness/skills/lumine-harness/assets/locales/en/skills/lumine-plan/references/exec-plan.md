# Technical execution plan

<!-- LH-EXEC-01 -->
An Exec Plan turns an understood goal into work that can be implemented, recovered, and verified. Use a stable id, type: exec-plan, its own locale, and truthful status; reference product specifications with specId or specIds. Acceptance references identify applicable AC items and baselines rather than copying product text. Multiple Plans may cover different parts of one Spec.

<!-- LH-EXEC-02 -->
Keep one current overview at the top: delivered results, remaining work, next action, and blockers. Then record material technical choices and reasons, affected repositories/modules, dependencies, outcome-based milestones, and verification. Provide enough entry points and context for another Agent to resume without reproducing source documentation or accumulating chronological updates.

<!-- LH-EXEC-03 -->
Use Mermaid when target architecture, data flow, state, or sequence needs explanation, and label it as not yet implemented. Reference Wiki/source for current behavior; promote stable findings to Wiki only after implementation. Maintain local technical adjustments in the Plan; assess Spec, acceptance baselines, and approval scope for product changes.

<!-- LH-EXEC-04 -->
Specify writable and read-only repositories, exclusive parallel file owners, authorization boundaries, and any necessary recovery approach. Use [Stage readiness and handoff](stage-handoff.md) to check the confirmed Spec and necessary design evidence before technical planning. Present an executable Plan and obtain user confirmation of that Plan and entry into Run before implementation. Earlier broad authorization, a generated Plan, or a status field cannot replace this confirmation. Do not reapprove the same confirmed, still-applicable Plan. Implementation confirmation does not authorize committing, pushing, or publishing; a technical discussion request does not authorize implementation.

<!-- LH-EXEC-05 -->
Link verification summaries to docs/validation/, distinguishing automated tests, actual operation, deployment, and human acceptance. Runtime under .lumine/ manages task records; use CLI help for field and command contracts. Documents present meaningful current results and evidence rather than duplicating machine state. Close out with outcomes, coverage limits, and the next action; do not archive incomplete overall work as complete.

After completing a plan, use `task doc-archive <document-ID> --expect <current-SHA256>` to move it to completed; use `task doc-restore` when reopening the same task. Read its current version with `task doc-resolve` first. Archiving preserves identity and evidence; default discovery excludes history, while explicit references remain traceable.
