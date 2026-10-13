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

## Adoption delivery acceptance

Use docs/templates/adoption-validation.md to record artifact destinations, retirement or preservation of old entry points, project-specific collaboration/operation guides, service extensions, major-module coverage, independent semantic review, and cold-start questions in Validation. Coverage represents topics and gaps. Task schemaVersion 3 knowledge binds this request's required/status/refs/sync, source baselines, created/revised/retained/deferred decisions, and content hashes. No additional adoption status or change to migration complete is needed.

wiki check verifies structure, references, and incomplete writes; it does not prove guide applicability, term completeness, correct standards authority, or usable guidance. The Agent checks these against actual material. Record reader navigation/search, service health, and real host operation separately with actions, results, and limits. Mark unperformed work unverified; preserve content gaps in existing coverage/task/Plan recovery rather than treating installation as delivery.
