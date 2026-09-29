# Lumine Harness

Help people and Agents deliver software with clear goals, recoverable execution records, and knowledge grounded in sources.

Lumine is a project-level workflow. The host supplies models, tools, and lifecycle events; Lumine preserves project boundaries, product proposals, execution progress, knowledge, and evidence. It supports single or multiple repositories, including a shared parent without Git.

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

**Product Spec → necessary design → technical Exec Plan → implementation/verification → affected knowledge updates.**

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
Continue the confirmed approach and verify the actual outcome.
Diagnose this issue and report causes and evidence without automatically repairing it.
Explain how login and dynamic routing cooperate, with source references.
```

Local repairs may proceed directly when they introduce no product choice, change no agreed behavior contract, and need no independent coordination. Existing authorization survives capability changes; real unresolved choices need user input. A generated Plan, approved field, or passing tool check does not establish authorization or acceptance.

## Engineering records for people and Agents

- **Product Spec:** product problems, scenarios, rules, scope, and stable acceptance items.
- **Exec Plan:** this technical change, current progress, next action, and evidence summaries; references the Spec instead of duplicating requirements.
- **Repo Wiki:** existing mechanisms, architecture, technical rationale, and limits linked to source, decisions, and runtime evidence.
- **Validation:** actual actions and outcomes, separating tests, runtime behavior, deployment, and user acceptance.

Lead with current conclusions before technical detail and history. Chinese, English, and mixed filenames are supported without mandatory English slugs; stable identities are separate from names. Historical content, human edits, and actual approvals are not rewritten in bulk.

Ask the Agent to archive a completed Plan or restore it when work resumes. For current-format plans, `task doc-archive` and `task doc-restore` move the document between `active/` and `completed/`, retain its stable ID, update current links, and record recoverable operations. They require the current content hash to protect intervening edits; historical evidence stays unchanged.

## Illustrated Repo Wiki

Knowledge body defaults to docs/repo-wiki/, with one configurable authoritative root. Cards use HTML DOM; summaries, Markdown, and Mermaid text belong to the same content. The local reader provides search, filters, navigation, related sources, Spec/Plan reading, and stable references.

Diagrams explain architecture, components, sequences, flows, states, and applicable data relationships. They render on demand in the browser with enlargement, zoom, pan, reset, provenance, and Mermaid text copy/export. Split complex topics; prose and source remain available when a diagram fails.

Knowledge generation, queries, maintenance, and review are text-only: no card images, thumbnails, persistent image files, image generation, vision models, or rendered SVG supplied to models. The browser may use SVG DOM internally to draw diagrams; it is not a model-input image artifact. No additional model account or background generation service is required; the active Agent performs semantic updates.

Common terminal commands:

```bash
./.lumine/cli wiki query "login and dynamic routing"
./.lumine/cli wiki show <knowledge-id>
./.lumine/cli wiki scan
./.lumine/cli wiki serve --port 4318
./.lumine/cli wiki check
./.lumine/cli check health
```

Return to source when knowledge is missing, stale, or contradictory; authoritative rules are not constrained by card ranking. Incremental updates protect human content, retain candidates/conflicts, and report incomplete scope. With no active Agent, updates remain pending rather than pretending semantic work completed.

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
