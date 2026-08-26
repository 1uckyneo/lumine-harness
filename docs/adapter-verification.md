# Advanced Adapter Verification

This document is for Lumine Harness maintainers and engineers auditing host compatibility. Ordinary users do not need to run the full procedure. They can usually ask the Agent:

```text
Check whether the current Agent is connected to Lumine Harness correctly.
```

For product differences and one-time setup, see [What Works in Each Agent](adapter-compatibility.md).

## What each command answers

### Status: what works now?

```bash
./.harness/cli adapter status current
./.harness/cli adapter status selected
```

- `current` identifies the product from real Adapter session state rather than asking the model to guess its host. If no current session is known, it returns a concrete restart or setup action.
- `selected` summarizes every Adapter selected by the project.
- Add `--json` for stable machine fields. Human output should use natural Chinese or English according to the environment.

Status combines repository checks, one-time setup, and recent runtime evidence into a user-facing result. It does not create new compatibility evidence.

### Doctor: are project files and settings ready?

```bash
./.harness/cli adapter doctor <product|selected|all>
```

Doctor checks statically observable conditions such as:

- whether the command runs from the project root containing `.harness/root.json`;
- whether the project selected the Adapter;
- whether the repository entry, Hook configuration, or Plugin exists;
- whether readable user-level configuration is installed;
- whether a known one-time product setting remains.

Doctor cannot prove that the Agent read `AGENTS.md`, the model understood a rule, a Hook ran in a real session, or automatic continuation occurred.

### Verify: what did a real Agent actually do?

```bash
./.harness/cli adapter verify <product> --begin --host-version <version>
./.harness/cli adapter verify <product>
```

The first command opens a time-limited verification run. Record the host version as host-reported when the product exposes it; otherwise mark it explicitly as user-reported or unknown. A real session in the named product must then run the connection check and safe probes from the same Harness root. The Adapter should discover the active run automatically; ordinary users should not inject an internal environment variable into a GUI application. The second command summarizes that session's evidence.

Verify is a maintainer acceptance workflow, not a prerequisite for everyday development.

## Record capabilities separately

Each product records these capabilities independently:

1. project instructions entered context;
2. SessionStart or an equivalent entry event executed;
3. `.agents/skills` could be discovered or read from its real path;
4. when a phase requires a Skill, its read could be established before the first mutation;
5. a pre-stop gate exists;
6. the host can start another turn automatically;
7. all six `WORK_STATUS` values are translated correctly;
8. concurrent sessions keep isolated state.

A product may pass project instructions and Skill reading while automatic continuation is not applicable. Status must preserve that distinction instead of reducing it to one green compatibility flag.

## Internal evidence levels

Machine output uses these evidence levels:

- `official_declared`: official product protocol declares support, but the installed version was not observed;
- `repository_checked`: repository entries, configuration, and managed files match the contract;
- `runtime_observed`: a corresponding event or file read was observed in a real session;
- `behavior_verified`: an explicit safe scenario produced the expected behavior and outcome.

Capability results use:

- `passed`: the current requirement is satisfied;
- `needs_setup`: installation, authorization, or one-time setup remains;
- `not_tested`: the capability has not been exercised;
- `not_observable`: the host exposes insufficient information;
- `not_applicable`: the product does not provide the capability;
- `failed`: observed behavior differs from the contract.

These values remain stable for scripts and language-independent data. The ordinary compatibility page and default human output use plain language instead.

## Complete verification procedure

1. **Fix the scope**: record product name, product surface, version, and Harness root.
2. **Begin the run**: create a time-limited verification run.
3. **Enter the real host**: start a new session from the same Harness root.
4. **Run safe probes**: create temporary material only under `.harness/runtime/probes/`; do not modify business source.
5. **Check instructions and Skills**: use a unique marker for the project entry and read one real `.agents/skills/<name>/SKILL.md`.
6. **Check lifecycle behavior**: observe entry, tool, stop-decision, and any required continuation events.
7. **Check isolation**: run two parallel sessions in the same verification run and confirm distinct hashed identities, independent status revisions, and independent continuation requests.
8. **Collect results**: run Verify and review passed, unobserved, not-applicable, and failed capabilities separately.
9. **Close out records**: remove expired or abandoned probes, retain reviewed evidence according to policy, and keep temporary files out of business commits.

Only a maintainer's complete behavioral verification can update the public compatibility claim. An ordinary user's connection check applies only to that project and session.

## What the program can and cannot prove

It can check with reasonable confidence:

- repository entries, paths, managed configuration, and recorded versions;
- lifecycle events the host actually sends to the Adapter;
- file-addressed tool events showing that a shared Skill was read;
- whether one status revision requested continuation only once;
- whether a later host event indicates that the request was delivered;
- whether concurrent sessions use isolated state.

It cannot establish on its own:

- that the model understood a project rule;
- complete context that the host does not expose;
- that a GUI setting is effective when the product offers no readable interface;
- that local evidence files were never modified by a person.

Runtime records are reviewable engineering evidence, not cryptographic attestation. Documentation must not turn them into a guarantee that an Agent is perfectly compatible.

## `continue_autonomously` and host continuation

`continue_autonomously` is a Lumine Harness workflow state: the task still has a clear, safe next step that needs no new authority.

Hosts use different transports to begin another turn, such as a follow-up message, preventing the current stop, or a product-specific exit code. Those transports are not the workflow state itself.

Verification must establish that:

- Hook retries do not continue the same status emission twice;
- a new status emission after new work can request another continuation;
- host loop metadata does not permanently disable later status revisions;
- host limits, the continuous-autonomy cap, and the no-progress threshold pause safely;
- products without a complete continuation protocol, including OpenCode, clearly require a person to continue.

## Advanced terms

- **Fail-open**: the product may continue when a Hook errors or times out. Hooks in products such as Kimi Code cannot be the only control for high-risk work.
- **Fail-closed**: an error in a gate blocks or pauses the current action.
- **Stop Gate**: a pre-stop lifecycle point where an Adapter can check, pause, or request another turn.
- **Verification run ID**: an internal identifier for one verification run. Ordinary users do not need to read, copy, or configure it.
- **Cursor Workspace Trust**: relevant only when Cursor marks a project restricted and prevents project Hooks. It is not a general Lumine Harness prerequisite.

## Evidence and privacy

- Normal development sessions do not continuously record detailed verification events. Records are active only during an explicit verification run.
- Retained Probe evidence stores only hashed session identifiers and Harness-root-relative paths; Git-ignored local runtime state may retain the host session identifier so the Adapter can resume that same session.
- Do not record raw prompts, tokens, credentials, cookies, business data, or complete tool output.
- Append events and detect state-revision conflicts.
- Expire and clean verification records; do not commit them with business source.

## Maintaining compatibility claims

After a product protocol or version changes, update:

- per-capability results in the Capability Manifest;
- Adapter translation and tests;
- advanced limitations in this document;
- user-facing conclusions in the compatibility guide;
- versioned Validation evidence.

Repository tests prove that Lumine Harness implements its current protocol assumptions consistently. They do not replace verification in a real product.
