# Lumine Harness

English | [简体中文](README.zh-CN.md)

[![skills.sh](https://skills.sh/b/1uckyneo/lumine-harness)](https://skills.sh/1uckyneo/lumine-harness)

> **Build a reliable engineering environment for an agent-first world.**

Coding Agents are no longer just tools for assisting with code changes. They can own complete features, work across repositories, and run for hours. As models become more capable, delivery quality depends less on whether they can write code and more on whether they can keep understanding the project, respect its boundaries, recover execution state, and support results with evidence.

The harness built into an Agent product answers “how does the Agent run?” **Lumine Harness** is a project-level Harness that answers “what should it do in this project, and what counts as done?” One is the runtime foundation; the other is the project environment. They complement each other.

It is also an implementation of Harness Engineering: keeping project goals, engineering boundaries, execution progress, and validation evidence inside the project so an Agent can understand and continue the work after a session changes.

**Sessions end. Engineering context must remain.**

## When it is useful

Lumine Harness is a good fit when you want to:

- delegate a complete feature or long-running task to an Agent;
- recover goals, decisions, and progress after changing sessions or Agents;
- coordinate related frontend, backend, mobile, or other repositories;
- preserve product boundaries, test results, and delivery evidence;
- consolidate scattered `AGENTS.md`, Rules, Skills, Hooks, or engineering documents into one workflow.

If you only need a temporary answer or a tiny isolated code change that will not affect future project context, adopting a full Harness is usually unnecessary.

## Start in 3 steps

### 1. Install the entry Skill globally

With Node.js 18 or newer, choose a source that is accessible from your network.

Install from GitHub / skills.sh:

```bash
npx skills add 1uckyneo/lumine-harness -g
```

Install from Gitee / skills.sh:

```bash
npx skills add https://gitee.com/thrulife2gether/lumine-harness.git -g
```

Both commands install the same `lumine-harness` Skill for initial adoption and upgrades. Installing it does not immediately modify the target project.

If the `skills` CLI is unavailable, clone from GitHub or Gitee instead (choose one):

```bash
git clone https://github.com/1uckyneo/lumine-harness.git
git clone https://gitee.com/thrulife2gether/lumine-harness.git
```

After a manual clone, use this message in step 3 so the Agent reads the entry Skill first:

```text
Read <clone-directory>/skills/lumine-harness/SKILL.md in full.
Inspect <target-project-directory> and present a Migration Proposal first.
Do not modify files until I approve it.
```

### 2. Start a new session from the correct project root

| Project shape | Directory to open |
| --- | --- |
| Single repository | The repository root |
| Related repositories | Their common parent directory |

The common parent does not have to be a Git repository. What matters is that the Agent can access every related codebase, rule, and runtime entry point. Opening only one child repository leaves cross-repository context, checks, and recovery incomplete.

### 3. Send this message to the Agent

```text
Use the lumine-harness Skill to inspect this project.

First identify the correct Harness root and present a Migration Proposal
that lists what you plan to add, change, and preserve.
Do not modify any files until I approve it.
```

At this point the Agent only inspects the project and proposes a migration. It writes files only after you approve the proposal.

## What happens next

```text
Inspect → propose a migration → write after approval → check the adoption
```

1. **Inspect**
   Detect repository topology, technology signals, Git state, existing Agent instructions, Skills, Hooks, and engineering documents.

2. **Migration Proposal**
   List files to add, update, or preserve; optional modules; selected Adapters; known limitations; and the exact write set.

3. **Adopt after approval**
   Create engineering maps, project phase Skills, workflow records, Harness Core, and selected Adapters. Design, browser, database, and other modules are enabled only when the project needs them.

4. **Check the adoption**
   Refresh engineering navigation, run Harness Check, and report Agent-product settings that still require a person.

If an unmanaged existing file conflicts with the proposal, adoption stops and reports the conflict instead of overwriting it silently. Resolve the conflict, then generate and approve a new proposal.

## Everyday development

### Start with a Draft

A requirement that enters the Harness workflow starts in `docs/drafts/<slug>.md`. The Draft is a working requirement document, not the final specification. Even a few initial lines should preserve the problem, expected outcome, known boundaries, and open questions so they can be refined over multiple conversations.

`<slug>` is the short, stable name reused by every later artifact. Prefer a readable lowercase English name with hyphens, such as `notification-preferences`:

```text
docs/drafts/notification-preferences.md
docs/design-docs/notification-preferences/          # only when design is needed
docs/product-specs/notification-preferences.md
docs/exec-plans/active/notification-preferences.md
docs/validation/notification-preferences/<date>/
```

You may create the Draft file and write the initial ideas yourself, or ask the Agent to do it:

```text
I want to add notification preferences:
<describe the requirement, background, and initial ideas here>

Start by turning this into a Draft, then tell me what context is missing.
```

### Without a separate design step

```text
Draft → human confirmation → Product Spec → Exec Plan → authorize implementation
      → implementation, tests, fixes → Validation → archive
```

### With design confirmation

```text
Draft → human confirmation → Design / Prototype → human confirmation
      → Product Spec → Exec Plan → authorize implementation
      → implementation, tests, fixes → Validation → archive
```

The main artifacts in this requirement workflow are:

- **Draft**: original needs, open questions, and decisions still being refined;
- **Design**: optional interaction, visual direction, and prototype confirmation;
- **Product Spec**: product goals, scope, rules, and acceptance criteria;
- **Exec Plan**: implementation path, current progress, and validation strategy;
- **Validation**: evidence of what happened and which results have been proven.

After confirming the Draft, continue with prompts such as:

```text
This Draft can move forward. Decide whether it needs design first; do not implement yet.
```

```text
Create the Product Spec and Exec Plan, but do not implement yet.
```

```text
The plan is approved. Start implementation, test, fix failures, and update Validation.
```

Small changes may use shorter records, but they must not make the engineering map, current state, or validation evidence unreliable for future sessions.

## What adoption adds to the project

A typical single-repository project gains these engineering assets:

```text
my-project/
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
│   ├── drafts/
│   ├── product-specs/
│   ├── exec-plans/
│   │   ├── active/
│   │   └── completed/
│   ├── validation/
│   └── generated/
├── .agents/
│   └── skills/
├── .harness/
└── src/
```

A multi-repository project uses the same Harness assets and also contains related repositories such as `frontend/`, `backend/`, or `mobile/` beneath the common root.

### Engineering records shared by people and Agents

| Asset | Question it answers |
| --- | --- |
| `AGENTS.md` | Where should the Agent start, and what are the project boundaries and phase rules? |
| `ARCHITECTURE.md` | What composes the system, and how do modules connect? |
| Draft | What was requested, and what remains unclear? |
| Product Spec | What should be built, within which scope and acceptance criteria? |
| Exec Plan | How will it be implemented, and where is execution now? |
| Validation | What happened, and which results have been proven? |

### Runtime support used by the Agent and tools

- `.agents/skills` stores project methods for each phase and is the only content source for project Skills;
- `.harness` provides the CLI, checks, state management, and product Adapters;
- generated navigation points the Agent toward relevant source and engineering entry points, but does not replace source, tests, or runtime evidence.

## Names that are easy to confuse

| Name | Role |
| --- | --- |
| `lumine-harness` entry Skill | Inspect, adopt, or upgrade a project |
| Project `lumine-harness-*` Skills | Run the adopted project's daily draft, design, plan, implementation, and check phases |
| Harness Core | Lives in `.harness` and provides the CLI, checks, state, and shared runtime logic |
| Adapter | Translates shared Harness behavior into an Agent product's lifecycle protocol |
| Codex Plugin | An optional distribution wrapper for the entry Skill, not another Harness or project Adapter |

## What people should read

You do not need to read every file the Agent uses. People usually focus on:

- unresolved decisions in the Draft;
- approved Design and prototypes;
- Product Spec;
- decision, progress, and risk summaries in the Exec Plan;
- Validation summaries;
- security-sensitive, architecture-critical, or anomalous code.

The Agent and tools consume complete source, generated navigation, detailed plans, test output, check logs, and lifecycle state. Harness does not remove code review; it moves more human attention toward product direction, technical boundaries, evidence quality, and high-risk code.

## Using different Agent products

Lumine Harness keeps shared engineering assets in `AGENTS.md`, `.agents/skills`, Docs, and `.harness` instead of copying the workflow for every product.

Agent products differ in how they load project instructions and Skills and how they execute lifecycle Hooks. Creating the integration files does not prove that the current Agent has actually used them.

After adoption, the Agent checks which product settings are still missing. You can repeat that check at any time by saying:

```text
Check whether the current Agent is connected to Lumine Harness correctly.
```

The check summarizes the evidence already available: what is prepared in the repository, what was observed in a real session, what still needs setup, and what still needs verification. It does not turn an unobserved capability into a compatibility claim merely because the check was requested. See [What works in each Agent](docs/adapter-compatibility.md) for product-specific details.

## Safety boundaries

- The Migration Proposal must be approved before the target project is modified.
- Unmanaged conflicting files are never overwritten silently.
- Existing worktree changes are preserved; Lumine Harness does not automatically commit, push, stash, reset, switch branches, or change remotes.
- User-level product configuration requires separate authorization.
- generated navigation cannot replace source, tests, runtime verification, or human decisions.

## Reference

The commands, troubleshooting notes, and alternate installation methods below are available when you need them.

<details>
<summary><strong>Open the reference section</strong></summary>

### Common commands

```bash
./.harness/cli check all
./.harness/cli generated refresh all
```

An ordinary connection check, configuration diagnosis, and real-host verification answer different questions. See [What works in each Agent](docs/adapter-compatibility.md) for troubleshooting. Maintainers who need to record runtime evidence should use [Advanced Adapter Verification](docs/adapter-verification.md).

### Troubleshooting

**The entry Skill is not visible after installation**
Run `npx skills list -g`, then start a new session. Global discovery differs by Agent product; use the manual method below when necessary.

**The Agent sees only one child repository**
Restart it from the common project root that contains every related repository.

**Will an existing `AGENTS.md` or AI workflow be overwritten?**
No. Inspection reports overlapping unmanaged files as conflicts. Adoption does not continue until the conflict is resolved and a new proposal is approved.

**A Hook file exists but does not run**
Ask the Agent to check whether it is connected to Lumine Harness correctly. If the result is still inconclusive, follow the one-time setup for that product in the compatibility guide. A configuration file existing on disk does not prove that its Hook executed.

**generated says `Review status: pending`**
Only deterministic scanning is complete. The Agent still needs to sample the referenced source and update review metadata.

### Other installation methods

Install globally with pnpm:

```bash
pnpm dlx skills add 1uckyneo/lumine-harness -g
pnpm dlx skills add https://gitee.com/thrulife2gether/lumine-harness.git -g
```

Update the globally installed entry Skill:

```bash
npx skills update lumine-harness -g -y
```

Omit `-g` to write the entry Skill into the current project. This creates Skill files in the current directory, so first confirm that it is the intended installation target:

```bash
npx skills add 1uckyneo/lumine-harness
```

Codex users may also use `$skill-installer` or the optional Plugin distribution. The Plugin and the separately installed entry Skill contain the same Skill; do not install both unless you are switching methods. See the [OpenAI Plugin documentation](https://developers.openai.com/codex/plugins).

</details>

## Maintaining this repository

If you want to maintain or contribute to Lumine Harness, read the root [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE)
