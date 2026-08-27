# Adapter diagnostics and release checks

This page is for Lumine Harness maintainers. Ordinary users only need to ask:

```text
Check whether Lumine Harness is active in the current Agent.
```

Then complete any one-time setup reported by the check. Normal development does not require probes or an exhaustive verification of every Agent.

## How much verification is necessary

Use three levels so compatibility maintenance does not become a certification project.

### On every source change: automated regression

Automated tests cover stable core behavior:

- the six `WORK_STATUS` outcomes;
- idempotent continuation for one status revision;
- isolation between concurrent sessions;
- `.agents/skills` catalog and Adapter routing;
- input and output conversion for each Adapter.

State-machine and session-isolation checks are low-level safety tests. They do not belong in the ordinary compatibility check.

### When an Adapter or its setup changes: static checks

```bash
./.harness/cli adapter doctor <product>
./.harness/cli adapter check <product>
```

- `doctor` checks whether Adapter files, Hooks, Plugins, or user-level configuration are ready;
- `check` summarizes whether the user can start, which setup remains, and any practical limitation;
- both are read-only and cannot prove that a real Agent executed a Hook or read a Skill.

### When a host changes or a problem is reported: minimal smoke test

Test only the affected product instead of retesting every product on every release:

1. Start a fresh session from the Harness root.
2. Ask whether Lumine Harness is active in the current Agent.
3. Have the Agent read one harmless project Skill and confirm path routing.
4. If the product supports a stop gate or automatic continuation, exercise one safe `continue_autonomously` cycle.
5. Run parallel-session checks only when investigating cross-session state.

When protocol events need to be captured for diagnosis, optionally run:

```bash
./.harness/cli adapter verify <product> --begin --host-version <version>
./.harness/cli adapter verify <product>
```

`verify` is an optional diagnostic tool. It is not a routine release gate and does not require a permanent per-capability certification matrix.

## Other commands

```bash
./.harness/cli adapter status current [--details] [--json]
./.harness/cli adapter status selected [--details] [--json]
```

`status` reads existing information for troubleshooting. Default output stays concise; `--details` expands Skill, Hook, status-conversion, and session-isolation internals, while `--json` provides stable machine output.

## What the program can prove

The program can check:

- repository Adapter files and configuration;
- lifecycle events delivered to the Adapter;
- path-bearing tool events that read a target `SKILL.md`;
- idempotent status handling and isolated session state.

It cannot independently prove:

- that a model understood and followed every part of `AGENTS.md`;
- host context that the Hook protocol does not expose;
- that an unknown future version behaves exactly like the current protocol.

Repository tests therefore show that Lumine's implementation matches the current protocol assumptions. They are not a claim that every product version received exhaustive manual certification. When a real difference appears, update the affected Adapter, tests, and concise compatibility note.

## Runtime records and privacy

- Normal development does not continuously record detailed verification events.
- Only an explicit `verify` run writes temporary diagnostic records under `.harness/runtime/probes/`.
- Raw prompts, tokens, credentials, cookies, business data, and full tool output are not recorded.
- Temporary records must not enter business commits.

See [Using Lumine Harness with different Agents](adapter-compatibility.md) for user-facing effects.
