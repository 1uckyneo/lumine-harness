# Lumine Harness

[English](README.md) | [简体中文](README.zh-CN.md)

[![skills.sh](https://skills.sh/b/1uckyneo/lumine-harness)](https://skills.sh/1uckyneo/lumine-harness)

> **Build a reliable engineering environment for an agent-first world.**

Coding Agents can take on complete features, coordinate across repositories, and carry work across sessions. As models become more capable, delivery quality increasingly depends on whether the Agent can keep understanding the project, respect its boundaries, recover execution state, and support results with evidence.

The harness built into an Agent product answers **“how does the Agent run?”** It provides the model and tool loop, context management, permissions, and lifecycle integration. **Lumine Harness is a project-level Harness** that answers **“what should the Agent do in this project, how should the work proceed, and what counts as done?”** It keeps project goals, engineering boundaries, working methods, execution progress, knowledge, and validation evidence with the project. The two layers complement each other.

Lumine is an implementation of **Harness Engineering**: building an engineering environment that people and Agents can understand and maintain together, so work can continue when a session, Agent, or machine changes. Product Specs and Exec Plans preserve intent and progress; a source-linked Repo Wiki explains the existing system; validation records show what has actually been verified. These assets support the work without requiring users to invoke a fixed sequence of Skills.

**Sessions end. Engineering context must remain.**

## When it is useful

Lumine Harness is a good fit when you want to:

- delegate a complete feature or a long-running task to an Agent;
- recover goals, decisions, and progress after changing sessions or Agents;
- coordinate related frontend, backend, mobile, or other repositories;
- preserve product boundaries, technical rationale, test results, and delivery evidence;
- consolidate scattered `AGENTS.md`, Rules, Skills, Hooks, and engineering documents into a consistent project environment.

It supports single repositories and multiple related repositories, including a shared parent directory that is not itself a Git repository. A temporary question or a small isolated change does not require adopting a full Harness first.

## Getting started

The distributed Runtime requires Node.js 18 or newer. Maintaining this repository or rebuilding the Runtime requires Node.js 22.18+ or 24.11+. Choose either source to install the same initialization Skill.

GitHub / skills.sh:

```bash
npx skills add 1uckyneo/lumine-harness -g
```

Gitee / skills.sh:

```bash
npx skills add https://gitee.com/thrulife2gether/lumine-harness.git -g
```

Installing the entry Skill does not immediately modify the target project. Alternatively, clone one source and ask your Agent to read `skills/lumine-harness/SKILL.md`:

```bash
git clone https://github.com/1uckyneo/lumine-harness.git
git clone https://gitee.com/thrulife2gether/lumine-harness.git
```

Start a conversation at the single-repository root or the common directory covering related repositories, then say:

```text
Use lumine-harness to inspect this project with English first and propose concrete adoption changes.
Preserve business rules, uncommitted changes, and repository boundaries.
```

The Agent inspects the target and prepares a Migration Proposal listing writes, preserved files, backups, language, and host limits, then acts within existing authorization. If writes are not yet authorized, review the concrete proposal first. Choose English first (en) or Simplified Chinese first (zh-CN) before the proposal is generated.

## Everyday development

State your outcome directly rather than invoking each capability manually. Feature work normally follows:

**Product Spec → (necessary design → Spec update) → Exec Plan → Run. The user confirms each stage handoff; verification during or after Run needs no separate confirmation.**

The Agent uses existing material, repository facts, and applicable Skills to judge the next step, including whether design is needed. “Can we move to the next step?” asks for an assessment; confirmation authorizes the recommended stage. Design work provides suitable material such as HTML prototypes, then updates the Spec after design confirmation and obtains confirmation of the revised requirements. See the [stage handoff guidance](skills/lumine-harness/assets/locales/en/skills/lumine-plan/references/stage-handoff.md) for the detailed rules.

| Everyday Skill | Responsibility |
| --- | --- |
| lumine-plan | Clarify requirements and revise or review product proposals and technical plans; a Spec-only discussion needs no Plan. |
| lumine-run | Implement, continue, recover, verify, and diagnose; verification-only work does not automatically repair. |
| lumine-knowledge | Locate source, query knowledge, verify provenance, and maintain Wiki. |
| lumine-design | Explore and review concrete visual and interaction choices. |

lumine-harness remains the initialization/upgrade entry. Checks are Runtime tools, not another manual phase.

Example requests:

```text
Develop a product proposal for this requirement without implementing it yet.
Compare two technical approaches and update the Plan without changing business code.
Can we move to the next step? Check the existing material and assess readiness.
I confirm this execution plan. Enter Run and verify the actual outcome.
Diagnose this issue and report causes and evidence without automatically repairing it.
Explain how login and dynamic routing cooperate, with source references.
```

Work autonomously within a stage without repeating confirmation for the same scope. An early broad request to build a feature cannot approve later concrete deliverables. Local repairs that introduce no product choice, change no agreed behavior contract, and need no independent coordination, as well as explicit rule maintenance and verification-only requests, retain their own scope without the full product workflow. A generated Plan, approved field, or passing tool check does not establish authorization or acceptance.

## Engineering records for people and Agents

- **Product Spec:** product problems, scenarios, rules, scope, and stable acceptance items.
- **Exec Plan:** this technical change, current progress, next action, and evidence summaries; references the Spec instead of duplicating requirements.
- **Repo Wiki:** existing mechanisms, architecture, technical rationale, and limits linked to source, decisions, and runtime evidence.
- **Validation:** actual actions and outcomes, separating tests, runtime behavior, deployment, and user acceptance.

Lead with current conclusions before technical detail and history. Chinese, English, and mixed filenames are supported without mandatory English slugs; stable identities are separate from names. Historical content, human edits, and actual approvals are not rewritten in bulk.

Ask the Agent to archive a completed Plan or restore it when work resumes. For current-format plans, `task doc-archive` and `task doc-restore` move the document between `active/` and `completed/`, retain its stable ID, update current links, and record recoverable operations. They require the current content hash to protect intervening edits; historical evidence stays unchanged.

## Project knowledge, Agentic Search, and continuous learning

Knowledge defaults to `docs/repo-wiki/`, with one configurable authoritative root. The Agent first understands project purpose, real entry points, module relationships, and dependencies, then builds a suitable knowledge hierarchy. Initial building covers major modules in depth by default; users may narrow or defer the scope. Large projects proceed in resumable batches. Getting-started, API, frontend, or deployment topics appear only where applicable.

Wiki explains entry points, call chains, data flow, normal and failure paths, tradeoffs, change impact, and verification. Pages provide coherent explanations; important sections have stable identities. Cards reuse section conclusions, qualifications, and sources for selective expansion. The reader connects the hierarchy, body, page outline, diagrams, and source locations, with cards and lists for browsing and search. Source changes and semantic content review are shown separately.

**The Agent/model understands, judges, and writes; Runtime searches, detects changes, validates, and saves safely.** The Agent chooses knowledge, source, or both according to the goal. There is no full-library context injection or mandatory query sequence for every task. Commands do not independently understand projects or generate high-quality knowledge. When important knowledge is missing, stale, or contradictory, the Agent verifies source and preserves reusable findings within authorization. Explicit read-only requests receive a report; a small repair with no knowledge increment needs no update. Without an active Agent, changes remain pending.

For example, after cancellation behavior changes, the Agent understands the new calls and state transitions and writes updated prose and Mermaid. The update tool checks source drift, concurrent creation, and human edits, then safely saves body, hierarchy, and durable state. A later session can retrieve the new knowledge. Upgrades update tools and managed guidance without regenerating the entire Wiki by default.

The reader is installed with project adoption or upgrades. Ask the Agent to “open this project’s knowledge base”, “restart the Wiki reader”, or “stop the Wiki reader”; `lumine-knowledge` manages the project’s service when needed. Running it requires Node.js, with no separate frontend dependency installation. Direct Markdown reading and Agent retrieval need no server.

These terminal commands are composable tools; users need not invoke each one:

```bash
./.lumine/cli wiki map
./.lumine/cli wiki query "Why verify task state after cancellation?"
./.lumine/cli wiki show <knowledge-id>#<section-id>
./.lumine/cli wiki related <knowledge-id>
./.lumine/cli wiki scan
./.lumine/cli wiki serve --port 4318
./.lumine/cli wiki check
```

`query/show/map/related` find and expand knowledge. `scan` supplies change clues. `update` accepts Agent-authored text and handles three-way comparison, candidates, conflicts, and recovery. Checks do not substitute for semantic review, actual operation, or user acceptance. Diagrams explain architecture, sequences, flows, states, and data relationships beside the relevant prose. They retain enlargement, zoom, pan, reset, source lookup, and text copy/export. A failed diagram does not block the body.

Markdown, Mermaid, and text metadata are the knowledge sources; cards are selectable, searchable, copyable HTML. Knowledge production creates no card images, thumbnails, or persistent images, uses no vision model, and never sends rendered SVG to models. Mermaid generates SVG DOM in the browser; explicit user-requested SVG export stays local and does not become knowledge source. No additional model account or background generation service is required.

## Directories, language, and recovery

```text
.lumine/                  Configuration, Runtime, tasks, and maintenance state
  wiki-state/             Shareable durable knowledge state
  local/wiki/             Rebuildable caches and machine state
.agents/skills/           Four canonical everyday Skills
docs/product-specs/       Product proposals
docs/exec-plans/          Technical plans and execution history
docs/repo-wiki/           Default knowledge body
docs/validation/          Verification evidence
```

Version knowledge body and necessary maintenance state; ignore indexes and machine caches by default. Clearing caches preserves human edits, useful candidates, and conflicts. Asking a model to regenerate content is not lossless recovery. A fresh clone can read and search existing knowledge without model calls. Other content under `.lumine/local/` may include private inputs and migration recovery files; do not clear the whole directory as cache.

Initialization language covers entry points, Skills, templates, CLI, and reader. Existing documents retain their own language; switching interface language does not translate content. Permanent language changes migrate defaults and managed resources without bulk-translating history.

## Host integrations

Shared rules live in `AGENTS.md` and `.agents/skills/`. Adapters translate host protocols without duplicating Skills. Install only the Adapters you select. When you deselect one, an upgrade removes only unchanged configuration owned by Lumine; edited or shared settings are preserved for review.

Host support changes Hooks, continuation, and discovery, not goals or evidence responsibilities. Report configuration presence, static checks, and actual host operation separately. This refactor has exercised the new entry points and CLI in Codex; community Adapters retain protocol and distribution regression coverage, but each host application has not been tested live.

See [Integration and limitations](docs/adapter-compatibility.md). Ask the Agent to inspect the current environment with:

```bash
./.lumine/cli adapter check current
```

Codex users may also use the repository's Plugin wrapper. It distributes the same canonical Skill as standalone installation, so installing both is unnecessary. Host-specific setup, user-level configuration, and external publication retain their own authorization boundaries.

## Upgrades and migration

Update the global entry with:

```bash
npx skills update lumine-harness -g -y
```

For a manual clone, fast-forward using its configured remote. Then ask the Agent for a project upgrade proposal and apply it within authorization; updating the entry does not upgrade the project automatically. Migration records baselines/backups, preserves existing changes, resumes interruptions, and marks completion only after verification. It does not automatically commit, push, or publish.

Legacy `.harness/` projects are handled by the separate migration tools. Temporary forwarding entries are retired after host verification; everyday Skills and the Runtime use `.lumine/` without retaining a second legacy workflow. Historical records and recovery backups remain available.

Maintainers: [AGENTS.md](AGENTS.md). 简体中文：[README.zh-CN.md](README.zh-CN.md)。 License: [MIT](LICENSE).
