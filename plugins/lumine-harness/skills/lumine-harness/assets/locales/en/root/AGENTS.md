# AGENTS.md - {{project_name}}

## Scope and boundaries

{{implementation_surface}}

Run implementation, verification, and Git operations in the actual implementation repository. Resolve the Harness root using .lumine/root.json and project identity, not the nearest Git root. Preserve project write/read-only boundaries and existing changes. Do not automatically commit, push, deploy, switch branches, or rewrite history.

## Project entry points

Read what the task needs rather than loading everything mechanically.

- README.md: setup, usage, and common commands.
- ARCHITECTURE.md: architectural boundaries and implementation entry points.
- docs/workflow-artifacts.md: responsibilities of Spec, Plan, Wiki, and evidence.
- docs/product-specs/: product goals, behavior, and acceptance.
- docs/exec-plans/active/: current technical approach, progress, and recovery; completed/ retains execution history.
- docs/repo-wiki/: default knowledge body root; .lumine/project.json selects the actual location.
- docs/validation/: verification evidence.
- .agents/skills/: the sole public location of canonical project Skills.
- .lumine/: Runtime, configuration, tasks, and knowledge maintenance state.
- {{repo_rules_entry}}

Read docs/FRONTEND.md and design references only when enabled and relevant.

## Implementation map

{{directory_map}}

{{fact_index_targets}}

## Four everyday capabilities

Read the applicable Skill; a name match or existing directory does not establish that it was read.

- lumine-plan: requirements, product Specs, technical Exec Plans, and proposal review; a Spec-only revision needs no Plan.
- lumine-run: implementation, recovery, verification, and diagnosis; verification-only requests do not authorize repairs.
- lumine-knowledge: discovery, queries, source verification, and Wiki maintenance.
- lumine-design: visual and interaction choices and design review.

Assess the next step using the goal, existing material, and repository facts rather than keywords or requiring the user to dispatch Skills. Product work follows Spec → (necessary design → Spec update) → Exec Plan → Run. Each stage handoff requires explicit human confirmation; work autonomously within a stage and do not repeat confirmation for the same scope. “Can we move to the next step?” requests a readiness assessment, not permission to proceed; an early broad implementation request cannot approve deliverables that do not yet exist. See [Stage handoffs](.agents/skills/lumine-plan/references/stage-handoff.md) for readiness and confirmation scope. Verification during or after Run needs no separate confirmation. Handle bounded repairs, rule maintenance, and verification-only requests within their own scope without forcing the full product workflow.

Checks are Runtime tools, not a fifth Skill. Structural checks do not replace domain-specific semantic review. Use ./.lumine/cli --help for interfaces; task checks and explicit project health checks have different scopes.

## Facts, language, and knowledge

- Spec defines intended behavior, Plan defines this technical change and progress, and Wiki explains known implementation. Source supports development facts; tests, actual operation, deployment, and user acceptance are distinct.
- Choose Wiki, source, or both according to the goal; do not inject the whole library or require every task to query. After verifying gaps, stale content, or contradictions, preserve reusable findings within authorization; honor explicit read-only requests. Authoritative rules are never limited by card budgets or search ranking.
- Requirements, acceptance items, documents, and diagrams have stable identities; titles and readable Chinese/English filenames can change. Fingerprints detect changes but do not establish user approval.
- Project locale controls defaults for new content; existing documents retain their own language. A temporary response-language request does not change project configuration.
- Wiki body, summary, and Mermaid are the sole knowledge content; cards use HTML. Knowledge maintenance creates no image, screenshot, or vision-model input.
- Baselines, human protection, candidates, and conflicts under .lumine/wiki-state/ are durable assets. Only .lumine/local/wiki/ holds rebuildable caches and machine state; preserve unique recovery material.
- Keep secrets, private addresses, and customer material out of public documents, logs, and screenshots.

## Collaboration and closeout

Parallel writers have exclusive ownership, inputs, write scope, acceptance, and stop conditions. Integrate serially and perform runtime verification after relevant changes are integrated. Store detailed evidence in docs/validation/ and current summaries/links in the Plan. Required knowledge synchronization belongs to task completion; unrelated stale pages do not block it.

Emit exactly one WORK_STATUS: <status> at closeout:

- done: the current request is complete; a diagnostic report may contain failures without repairing them.
- continue: the next action is clear and can proceed under current authorization.
- blocked: autonomous progress is unavailable; explain the concrete reason and next action in the response.

Status grants no new authorization, and alternative continuation paths cannot bypass the budget. A completed diagnosis does not require repair. Runtime owns the detailed protocol.

## Project conventions

{{project_specific_rules}}
