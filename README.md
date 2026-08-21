# Lumine Harness

[English](README.md) | [简体中文](README.zh-CN.md)

[![skills.sh](https://skills.sh/b/1uckyneo/lumine-harness)](https://skills.sh/1uckyneo/lumine-harness)

Lumine Harness is a project-level Agent engineering workflow. It helps an Agent keep reading the same product goals, architecture boundaries, execution state, and validation evidence across sessions and long-running tasks.

It can adopt a single repository or a project composed of several related repositories. The result is an engineering environment that is easier for an Agent to understand, recover, constrain, verify, and improve.

## Is This For My Project?

Lumine Harness is a good fit when:

- a single repository needs a complete Agent workflow;
- frontend, backend, mobile, or other related repositories must be developed together;
- a frontend-only, backend-only, full-stack, or traditional project lacks persistent engineering context;
- an existing `AGENTS.md`, Rules, Skills, Hooks, or docs workflow should be migrated to one coherent system.

Lumine Harness is not:

- a new coding Agent;
- a framework tied to one model or model provider;
- only a collection of Codex Hooks;
- something that must be reinstalled for every feature after a project has adopted it.

The installed or directly referenced `lumine-harness` Skill performs the initial adoption. Normal development then uses the project-local `AGENTS.md`, `.agents/skills/lumine-harness-*`, engineering records, Harness Core, and selected Agent Adapters.

## Start In Three Minutes

### Recommended: use the `skills` CLI

With Node.js 18 or newer installed, run one of these commands in a terminal. The [`skills` CLI](https://github.com/vercel-labs/skills) from Vercel Labs reads this repository and installs `lumine-harness` for the detected Agent.

Use the official `npx` form:

```bash
npx skills add 1uckyneo/lumine-harness -g
```

Or use the equivalent pnpm form:

```bash
pnpm dlx skills add 1uckyneo/lumine-harness -g
```

`-g` installs the Skill globally, which is convenient when adopting several projects. Omit `-g` to install it only in the current project.

After installation, start a new Agent session so the host can discover the Skill, then work from the root of the project that will adopt Harness.

The CLI installs the top-level `lumine-harness` Skill used for initial adoption or migration. Once adoption is complete, everyday development uses the target project's generated `AGENTS.md`, `.agents/skills/lumine-harness-*`, engineering records, Harness Core, and selected Adapters.

### Update the Skill

```bash
npx skills update lumine-harness -g -y

# With pnpm
pnpm dlx skills update lumine-harness -g -y
```

Start a new session after updating so the Agent loads the refreshed Skill files.

## Choose The Correct Project Root

The target is not necessarily a “workspace repository.” Choose the directory that represents the complete engineering scope:

| Project shape | Harness root |
| --- | --- |
| Single repository | The repository root |
| Several related repositories | Their common parent directory |

The common parent directory does not have to be a Git repository. What matters is that the Agent can access every related repository from that scope. Opening only one child repository makes cross-repository context, checks, and lifecycle recovery incomplete.

After installing the Lumine Harness Skill, start the Agent from the intended project root and send:

```text
Use the lumine-harness Skill to inspect this project.

First determine whether this is a single-repository or multi-repository project,
confirm the correct Harness root, and present a Migration Proposal.
Do not modify files until I approve it.
```

## What Happens During Adoption?

Lumine Harness follows four visible stages:

1. **Inspect**
   - Detect the repository topology and technology stack.
   - Audit Git state, existing Agent instructions, Skills, Hooks, and engineering docs.
2. **Migration Proposal**
   - List what will be created, replaced, preserved, or backed up.
   - Explain the capability and limitation of each selected Agent Adapter.
   - Wait for human approval before writing.
3. **Adopt**
   - Create the engineering maps, phase Skills, docs workflow, shared Harness Core, and selected Adapters.
4. **Verify**
   - Refresh navigation indexes.
   - Run Harness checks and Adapter Doctor.
   - Report host settings or product-side verification that still require a human.

Adoption is a migration, not a silent conservative patch. Review the proposal before approving it.

## What Will The Project Look Like?

### Single-repository project

```text
my-project/
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
│   ├── drafts/
│   ├── design-docs/
│   ├── product-specs/
│   ├── exec-plans/
│   │   ├── active/
│   │   └── completed/
│   ├── validation/
│   └── generated/
├── .agents/
│   └── skills/
│       └── lumine-harness-*/
├── .harness/
└── src/
```

### Multi-repository project

```text
my-project/
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
├── .agents/
│   └── skills/
│       └── lumine-harness-*/
├── .harness/
├── frontend/
├── backend/
└── mobile/
```

`my-project/` can be a coordination directory rather than a Git repository. The child repositories keep their own source code and Git history.

### What the main assets mean

| Asset | Purpose |
| --- | --- |
| `AGENTS.md` | The Agent entry map, project boundaries, hard rules, and phase routing |
| `ARCHITECTURE.md` | System structure, module relationships, implementation paths, and architecture invariants |
| Draft | Original needs, open questions, ambiguity, and decisions still being refined |
| Product Spec | Product goals, scope, rules, and acceptance criteria |
| Exec Plan | Technical path, execution state, next steps, and validation strategy |
| Validation | Evidence of what actually ran and what has been proven |
| `.agents/skills/lumine-harness-*` | Project-local methods for navigate, draft, design, plan, run, generated refresh, and checks |
| `.harness` | Shared Core, CLI, checks, generated indexer, session state, and product Adapters |
| generated | Navigation derived from repository facts; it does not replace source, tests, or runtime evidence |

The installed or directly referenced `lumine-harness` Skill is used for initial adoption. The generated `lumine-harness-*` Skills belong to the adopted project and drive everyday development.

## Everyday Development Workflow

```text
Draft
  ↓ human confirmation
Optional Design and prototypes
  ↓ human confirmation
Product Spec
  ↓
Exec Plan
  ↓ human authorizes Run
Implementation, tests, and fixes
  ↓
Validation and archive
```

Design is an optional branch. Product Spec always comes before Exec Plan. A human participates before Draft, Design, Spec/Plan, and Run begin. After Run is authorized, the Agent can work autonomously, but new product decisions, credentials, and manual application steps return to the human.

### Example messages

Start and refine a requirement:

```text
I wrote a short requirement. Turn it into a draft and tell me what context or decisions are still missing.
```

Discuss design without creating formal artifacts yet:

```text
Let us discuss the page direction first. Update only the draft and do not create a formal design yet.
```

Move past the draft:

```text
This draft is ready for the next stage.
```

After approving the design, create the product and execution contracts:

```text
The design is approved. Create the Product Spec and Active Exec Plan, but do not implement yet.
```

Authorize implementation:

```text
The plan is approved. Start Run, implement it, test it, fix failures, and update the validation records.
```

Small changes can use shorter artifacts, but they should not bypass the workflow in a way that makes the project map, current state, or evidence unreliable for future sessions.

## What Should Humans Read?

The Harness contains more material than a human needs to read every day.

| Humans should focus on | Agents and tools consume in depth |
| --- | --- |
| Draft and unresolved decisions | Complete source code |
| Approved Design and prototypes | generated navigation |
| Product Spec | Detailed plans and phase instructions |
| Exec Plan decisions and progress summary | Check logs and test output |
| Validation summary and final evidence | Adapter state and lifecycle data |
| Security-sensitive, architecture-critical, or anomalous code | CLI and Hook temporary state |

This does not remove code review. It moves human attention toward product direction, technical boundaries, evidence quality, and targeted review of high-risk code instead of assuming every generated file and every source line must receive equal attention.

## Agent Host Support

All supported hosts share the root `AGENTS.md`, project `.agents/skills`, engineering records, and `.harness` Core. Product-specific files are thin lifecycle Adapters, not copies of the workflow.

| Host | How it integrates | Extra step or current boundary |
| --- | --- | --- |
| Codex | Repository Hooks | SessionStart and Stop Gate are supported |
| Qoder | Prompt, tool, and Stop Hooks | Shared Skills are read-gated and do not appear in Qoder’s native Skill list |
| Trae | Repository Hooks | The user must enable project AGENTS, shared Skills, and Hooks |
| Kimi Code | Native AGENTS/Skills plus user Hooks | User-level Hooks require explicit installation and are fail-open |
| Cursor | Repository Hooks | Open and trust the complete project root |
| OpenCode | Repository Plugin | Context and audit are supported; an equivalent Stop Gate is currently unavailable |
| ZCode | Hook-only local Marketplace Plugin | Manual Plugin installation is required; project Hooks alone do not run |
| DeepSeek Harness | Native AGENTS/Skills plus profile bundle | Developer preview; SessionStart and Stop remain partial |

After adoption, run:

```bash
./.harness/cli adapter doctor all
```

Doctor reports the product-specific settings and installation steps that still need attention. A config file existing on disk is not proof that a host actually loaded the instructions, read a Skill, executed a Hook, or resumed a task.

## Common Commands

Run these from the adopted project’s Harness root:

```bash
./.harness/cli check all
./.harness/cli generated refresh all
./.harness/cli adapter list
./.harness/cli adapter doctor all
./.harness/cli adapter verify all
```

Some products require an explicit install command, such as Kimi Code user Hooks, the ZCode local Plugin, or the DeepSeek Harness profile bundle. Run `adapter doctor` first and follow the instructions it produces instead of guessing product directories.

## Troubleshooting

### The global Skill is not visible

Run `npx skills list -g` or `pnpm dlx skills list -g` first and confirm that `lumine-harness` is installed for the intended Agent. Then start a new session so the host reloads its Skills. A Skill installed with Codex Skill Installer also becomes available on the next turn.

### The Agent found only one child repository

Reopen or restart the Agent from the common project root that contains every related repository. The Harness root should represent the complete engineering scope.

### Hook files exist, but nothing happens

Run `./.harness/cli adapter doctor <product>` and `adapter verify <product>`. Check the host’s manual settings and Hook logs. File presence alone is not runtime verification.

### generated still says `Review status: pending`

Refreshing generated files performs the deterministic scan. The Agent must then sample the referenced source and update the review metadata; `pending` is not a completed review.

### Doctor reports a manual step

Complete that step in the target product. Harness checks intentionally preserve `needs_manual_app_step` when repository automation cannot prove a product-side setting.

## Other Installation Options

### Read the repository manually

If the current Agent cannot use the `skills` CLI, clone the repository somewhere it can read:

```bash
git clone https://github.com/1uckyneo/lumine-harness.git
```

Then send the Agent:

```text
Read <clone-path>/skills/lumine-harness/SKILL.md completely.

Inspect <target-project-path>, identify its project structure, and present a Migration Proposal.
Do not modify files until I confirm the proposal.
```

### Codex Skill Installer

Codex users can also send the following message to Codex. It is not a terminal command:

```text
Use $skill-installer to install this Skill:
https://github.com/1uckyneo/lumine-harness/tree/main/skills/lumine-harness
```

The Skill becomes available on the next turn.

## Optional Extension: Codex Plugin

Most users only need the `lumine-harness` Skill. If you use Codex and prefer installing it through the Plugin browser, this repository also provides an optional Codex Plugin package containing the same Skill.

Inside Codex CLI, enter:

```text
/plugin marketplace add 1uckyneo/lumine-harness
/plugins
```

Install **Lumine Harness** from the Plugin browser, then start a new session. Do not install both forms unless you are intentionally switching installation methods. The Plugin does not change the Harness files generated in a target project.

See the [OpenAI Plugin documentation](https://developers.openai.com/codex/plugins). Codex IDE Extension does not currently support Plugins.

## Safety And Recovery

- The Agent must present a Migration Proposal before modifying a target project.
- Existing unrelated working-tree changes must be preserved.
- Lumine Harness does not automatically commit, push, change remotes, switch branches, stash, reset, or rewrite history.
- Git projects rely on diff and history for recovery.
- For non-Git targets, replaced AI workflow files are backed up under `.harness/local/harness-backup/<timestamp>/`.
- User-level product configuration requires separate approval and is not silently changed during normal adoption.
- generated indexes are navigation aids, not substitutes for source inspection, tests, runtime verification, or human decisions.

## Maintaining This Repository

If you want to maintain or contribute to Lumine Harness itself, read the repository root [`AGENTS.md`](AGENTS.md). It defines the canonical source, generated Plugin wrapper, edit routing, product-neutrality rules, and required checks.

## License

[MIT](LICENSE)
