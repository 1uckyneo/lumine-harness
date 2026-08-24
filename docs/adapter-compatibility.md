# Adapter Compatibility

This page documents the protocol boundary between Lumine Harness and Agent products. Product behavior changes by version, so repository readiness, real-host execution, capability maturity, and failure behavior are separate claims.

## Four independent dimensions

### Static readiness

- `not-selected`: the project did not select this Adapter;
- `needs-setup`: the repository entry exists, but product settings, installation, or authorization are still required;
- `repository-ready`: repository configuration and manual setup are ready.

`adapter doctor` checks only this layer. Configuration presence does not prove product execution.

### Runtime evidence

- `runtime-pending`: the named product and version have not completed a real event challenge;
- `host-verified`: product, version, date, and complete event evidence have been recorded.

Repository unit tests cannot promote `runtime-pending` to `host-verified`.

### Capability maturity

- `full`: the Adapter design covers the intended lifecycle capabilities;
- `partial`: the product lacks some lifecycle capability, so some gates are degraded;
- `developer-preview`: the protocol or dependency is unstable and is not a production compatibility promise.

### Failure mode

- `fail-closed`: a gate failure blocks or pauses execution;
- `fail-open`: Hook errors or timeouts may let the product continue, so the Hook cannot be the only control for high-risk actions.

## Shared engineering assets

Lumine Harness keeps shared assets in:

- root `AGENTS.md`;
- real Skills under `.agents/skills`;
- Draft, Product Spec, Exec Plan, Validation, and generated navigation;
- `.harness` Core, CLI, checks, and runtime state.

This means the repository maintains one shared source of truth. It does not prove that every Agent product loaded it successfully. Actual reads and lifecycle execution require evidence from the corresponding product.

Adapters translate context injection, tool events, lifecycle events, and product protocols. A target project's `AGENTS.md` does not contain a product compatibility matrix or require the model to identify its host.

## Skill integration modes

- `native`: the product directly discovers project `.agents/skills`;
- `native-with-toggle`: native discovery exists, but the user must enable related settings;
- `adapter-routed`: the Adapter locates the real `SKILL.md` from an explicit Skill name or Harness phase and checks that it was read before the first mutation;
- `unsupported`: there is no reliable discovery or read path.

`adapter-routed` is not equivalent to native semantic discovery. Explicit `$skill-name` and Harness phases are deterministic; implicit discovery from general natural language remains `best-effort`.

## Current capability summary

| Product | Skill mode | Required setup | Runtime evidence | Maturity | Failure mode |
| --- | --- | --- | --- | --- | --- |
| Codex | native | repository configuration | runtime-pending | full | fail-closed |
| Qoder | adapter-routed | repository configuration; Hooks vary by product surface and version | runtime-pending | partial | fail-closed |
| Trae | native-with-toggle | repository configuration + manual project instructions, shared Skills, and Hooks settings | runtime-pending | partial | fail-closed |
| Kimi Code | native | user-level configuration with separate authorization | runtime-pending | partial | fail-open |
| Cursor | native | repository configuration + Workspace Trust | runtime-pending | partial | fail-closed |
| OpenCode | native | repository Plugin | runtime-pending | partial; no complete Stop Gate | fail-open |
| ZCode | adapter-routed | local Marketplace Plugin + manual installation | runtime-pending | partial | fail-closed |
| CodeBuddy | adapter-routed | repository configuration + manual Hook review | runtime-pending | partial | fail-closed |
| DeepSeek Harness | native | profile bundle + manual setup | runtime-pending | developer-preview | fail-open |

This table describes the current canonical implementation, not completed end-to-end verification for every product. Capability Manifest and Validation evidence must record product version, verification date, event sequence, and known gaps.

## Doctor and real-host verification

Check the Adapters selected by the current project:

```bash
./.harness/cli adapter doctor selected
```

Doctor checks only static configuration and manual steps. To claim `host-verified`, issue a one-time verification for one named product:

```bash
./.harness/cli adapter verify <product> --begin --host-version <version>
```

The real product session must then write current events. Ordinary `adapter verify <product>` matches the one-time challenge, product version, and complete event stream. Configuration files, old logs, or hand-written JSONL cannot become real-host evidence.

## What a real product must prove

1. root `AGENTS.md` entered context;
2. SessionStart or an equivalent entry event executed;
3. an explicit Skill resolved to `.agents/skills/<name>/SKILL.md`;
4. when a phase requires the Skill, the first mutation is blocked or reliably paused before it is read;
5. mutation is allowed after the read;
6. all six `WORK_STATUS` values are handled correctly;
7. one `continue_autonomously` revision resumes at most once;
8. two parallel sessions do not share state;
9. event evidence proves the sequence without recording credentials, raw prompts, or customer data.

## Product notes

### Qoder

Hook events may differ across Qoder IDE, CLI, and other product surfaces and versions. Adoption must record the concrete surface and version rather than treating Qoder as one permanent protocol.

### Kimi Code

Project Skills use `.agents/skills`; user-level Hook installation requires separate authorization. Hook errors and timeouts are fail-open, so Hooks cannot be the only control for high-risk actions.

### OpenCode

Project Skills can use `.agents/skills`. There is no equivalent complete Stop Gate, so post-completion events support audit but cannot pretend to provide pre-stop blocking and automatic continuation.

### ZCode and CodeBuddy

They do not store complete Skill copies. Their Adapters locate shared Skills on demand. Keep them `runtime-pending` until real Hook and Skill-read evidence exists.

### DeepSeek Harness

The profile bundle and lifecycle bridge remain a developer preview. Locked dependency versions and repository tests do not replace SessionStart, status, and Stop validation in a real DSH session.

## Maintenance rules

- When a product protocol changes, update Capability Manifest, tests, this page, and Validation evidence;
- do not promote `runtime-pending` to `host-verified` without real evidence;
- do not copy product compatibility details into a target project's `AGENTS.md`;
- product directories contain only the smallest protocol entry points, never shared workflow or Skill bodies.
