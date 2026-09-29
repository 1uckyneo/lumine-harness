# Checks and evidence

.lumine/cli provides deterministic checks for structure, references, baselines, and record completeness. These cannot decide whether a product choice is sound, a design meets its goal, or business acceptance was achieved. plan, run, knowledge, and design own the corresponding semantic reviews.

## Project and task checks

```bash
./.lumine/cli check health
./.lumine/cli check docs
./.lumine/cli task record <task.json>
./.lumine/cli task bind <taskId> --product <host> --session-id <session> --mode verify
./.lumine/cli task show <taskId>
./.lumine/cli task check <taskId> --json
```

Task interfaces accept --root <root>. Update records with `task record ... --expect <previous-record-sha256>` to avoid overwriting concurrent changes. A task includes identity, current mode, applicable Spec/Plan/AC references, authorization scope, and evidence. Follow Runtime output and help for field contracts rather than inventing pass records. Modes are plan, implement, verify, and diagnose.

Project diagnosis can invoke health/docs checks directly without creating an implementation task. Failing findings can still complete the requested report and must not automatically become a repair request. Global health checks are separate from task closeout; unrelated document state is not a universal done gate.

## Knowledge and hosts

wiki check validates knowledge structure and relationships; semantic truth still requires source review. adapter check current reports current host/setup state; adapter status selected summarizes selected integrations. Report static Doctor checks, real Hook events, actual Skill reads, and continuation evidence separately. Not observable does not mean passed.

## Evidence quality

Evidence identifies actions, outcomes, time, code/environment scope, and uncovered cases. Do not relabel historical results as acceptance of current requirements. If the user requested no file changes, report in the response without fabricating evidence or repairing issues merely to satisfy checks.
