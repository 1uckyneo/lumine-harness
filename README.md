# Harness Engineering Bootstrap

[English](README.md) | [简体中文](README.zh-CN.md)

Adopt or migrate an existing codebase into a structured AI engineering harness.

`harness-engineering-bootstrap` is a Codex-first, Agent Skills-compatible package for turning unfamiliar repositories into an AI-operable engineering workspace. It installs a repeatable workflow around `AGENTS.md`, `ARCHITECTURE.md`, draft/design/spec/plan/run handoffs, generated navigation indexes, checks, hooks, and subagent lanes.

## When To Use

Use this when a repository needs a complete AI workflow, or when an existing AI workflow should be replaced with a harness-centered one. It supports workspace-plus-child-repo layouts, single full-stack repositories, backend-only projects, frontend-only projects, and traditional projects where the topology is still unclear.

Do not use it for a single feature implementation inside an already-adopted harness. Once a project has the harness installed, use the generated project skills and docs for normal work.

## Install

### Codex Skill

Install the skill directly from this repository:

```bash
$skill-installer install https://github.com/1uckyneo/harness-engineering-bootstrap/tree/main/skills/harness-engineering-bootstrap
```

Restart Codex after installing new skills.

### Codex Plugin Marketplace

Add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add 1uckyneo/harness-engineering-bootstrap
```

Then open the Codex plugin browser, install **Harness Engineering Bootstrap**, and start a new thread.

### Manual Install

Copy the skill folder into your user skills directory:

```bash
mkdir -p ~/.codex/skills
cp -R skills/harness-engineering-bootstrap ~/.codex/skills/
```

Restart Codex after copying the skill.

## Usage

Ask Codex to adopt a target repository:

```text
Use harness-engineering-bootstrap to adopt /path/to/my-project
```

The skill first inspects the target and presents a migration proposal before writing. The proposal identifies the detected topology, files to create or replace, conflicting AI workflow files, generated indexes, checks, and profile-specific not-applicable items.

## What It Creates

- A root `AGENTS.md` as the agent entry map.
- A root `ARCHITECTURE.md` as the detailed architecture map.
- `docs/drafts`, `docs/design-docs`, `docs/product-specs`, `docs/exec-plans`, `docs/generated`, and `docs/validation` conventions.
- A local `./harness` wrapper for generated refreshes and checks.
- Codex hooks, checks, generated-index refresh tooling, project skills, and subagent lane definitions.

## Safety Model

This package is an adoption workflow, not a conservative patch. It can replace existing AI workflow files after presenting a migration proposal.

For git repositories, changed files remain recoverable through git diff and history. For non-git targets, replaced AI workflow files are backed up under `.codex/local/harness-backup/<timestamp>/` before overwrite.

The generated indexes are navigation aids. They do not replace source inspection, tests, runtime verification, or user confirmation.

## Validate This Package

Run the bundled checks from the repository root:

```bash
bash skills/harness-engineering-bootstrap/scripts/check-skill-package.sh
node --check skills/harness-engineering-bootstrap/assets/codex/harness-check.mjs
node --check skills/harness-engineering-bootstrap/assets/codex/harness-generated.mjs
```

## Repository Layout

```text
skills/harness-engineering-bootstrap/       # Canonical Agent Skill package
plugins/harness-engineering-bootstrap/      # Codex plugin wrapper for marketplace installs
.agents/plugins/marketplace.json            # Codex repo marketplace catalog
```

## License

MIT. See [LICENSE](LICENSE).
