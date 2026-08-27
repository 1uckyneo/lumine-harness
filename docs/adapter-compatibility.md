# Using Lumine Harness with Different Coding Agents

This guide is for projects that have already adopted Lumine Harness. The Harness root is the project directory that contains `.harness/root.json` and `.harness/cli`. If those files do not exist yet, follow the adoption steps in the [README](../README.md) first.

The table describes each product's setup path and the Adapter provided by the Lumine Harness repository. It does not claim that your current local session has already been verified.

## Find your coding agent

| Agent | How to use it after adoption | Start here | Main difference |
| --- | --- | --- | --- |
| Codex | Use it directly after project adoption | Start a new session from the Harness root | Discovers `.agents/skills` natively; project Hooks provide session entry, completion checks, and continuation |
| Cursor | Use it directly after project adoption | Start a new session from the Harness root; trust the project only if Cursor explicitly marks it as restricted | Discovers `.agents/skills` natively; unfinished work continues through a new follow-up turn |
| Trae | Use it after one-time setup | Enable `AGENTS.md` under Settings > Rules > Import Settings, enable the `.agents` Skill directory under Settings > Skills and Commands > Import Settings, and enable project Hooks under Settings > Hooks; then start a new session | Discovers `.agents/skills` natively after setup |
| Kimi Code | Use it after one-time installation | Run `./.harness/cli adapter install kimi`, reload Kimi Code, and start a new session from the Harness root | Discovers `.agents/skills` natively; Hooks fail open, so high-risk actions still need independent approval |
| Qoder | Use it directly after project adoption | Start a new session from the Harness root; naming the Skill explicitly is more reliable for critical phases | Skills do not appear in Qoder's native list; the Adapter locates the canonical file and requires the Agent to read it |
| CodeBuddy | Use it after approving project Hooks | Run `/hooks` in CodeBuddy, review the current project's Hook changes, and start a new session | Skills do not appear in CodeBuddy's native list; the Adapter locates the canonical file and requires the Agent to read it |
| ZCode | Use it after enabling the local Plugin | Run `./.harness/cli adapter install zcode`, add the returned directory as a local ZCode Marketplace, install and enable `lumine-harness-adapter`, and start a new session | Skills do not appear in ZCode's native list; automatic continuation is limited to three consecutive turns |
| OpenCode | Use the core workflow directly | Start a new session from the Harness root | Discovers `.agents/skills` natively; there is no equivalent Stop Gate, so a person starts the next turn when more work is needed |
| DeepSeek Harness | Try it after profile setup | Run `./.harness/cli adapter install deepseek-harness`, authorize the profile change, run the returned `dsh plugin` command, and start a new session | Developer preview; do not use it as the only gate for high-risk actions |

Every project Skill body lives only under `.agents/skills/`. Products that support this directory discover it directly. For Qoder, CodeBuddy, and ZCode, the Adapter maps an explicit Skill name or Harness phase to the canonical file, requires the Agent to read it, and checks the read event when the host exposes one. The Adapter neither copies Skill bodies nor reads them on the model's behalf.

## The most important Hook difference: can the Agent check before stopping?

Most products can add engineering context when a session starts or a prompt is submitted. What matters most for long-running work is whether the host provides a pre-stop gate before the Agent actually becomes idle. This guide uses Stop Gate as a shared name for this class of pre-stop capability; it is not necessarily the event name used by each product.

These differences cannot be solved by renaming `.codex` to another product directory. Coding agents do not share one Hook standard: configuration paths, event names, timing, and return contracts differ. Some Hooks can block an action and return feedback to the Agent; others only receive a notification after the action has finished. Failure behavior may also be fail-closed or fail-open. A Lumine Harness Adapter can translate lifecycle capabilities that a host already exposes, but it cannot create a lifecycle point that the host does not provide.

A Stop Gate can read `WORK_STATUS`, run Harness Check, and then allow the turn to finish, request another turn, or return control for a decision, credentials, or a manual step. A notification or audit event that fires after the turn has ended is not equivalent.

| Situation | Agent | Effect on the user |
| --- | --- | --- |
| Pre-stop gate whose host protocol lets the Adapter request continuation | Codex, Qoder, Trae, Cursor, CodeBuddy | Incomplete long-running work can be checked before the Adapter asks the host to continue |
| Pre-stop gate with product-specific limits | Kimi Code, ZCode, DeepSeek Harness | Kimi Hooks fail open; ZCode allows at most three consecutive automatic continuations; DeepSeek Harness remains a developer preview |
| No equivalent pre-stop gate | OpenCode | The core workflow and project assets remain usable, but premature stopping cannot be blocked; a person starts the next turn |

OpenCode's `session.idle` event fires after the Agent has already become idle. The Lumine Harness OpenCode Adapter uses it only for post-turn audit; it is not a Stop Gate and cannot reliably re-enter the current task automatically.

## Check that the setup is active

After completing the setup step above, start a new session from the Harness root and ask:

```text
Check whether Lumine Harness is active in the current Agent.
```

The result should tell you:

- whether you can start now;
- which one-time setup step remains;
- which product limitation changes how you work;
- what to do next.

This check is read-only. It does not change business code or project documents.

If the result says that it cannot identify the current Agent:

1. confirm that this is a new session started from the Harness root;
2. if identification still fails, ask the Agent to run `./.harness/cli adapter check <product>`, replacing `<product>` with the current product ID;
3. remember that an explicit product check confirms project configuration and known limitations, not that the current session actually ran its Hooks.

When the result says you can start, give the Agent the first real requirement. If setup is still incomplete, follow the returned steps and check again in a new session.

Skill discovery and Hook capabilities change the automation path, not the project workflow of Draft, optional Design, Product Spec, Exec Plan, Run, and Validation.

Most users can stop here. If you maintain an Adapter or need to investigate a product protocol, see [Adapter diagnostics and release checks](adapter-verification.md).

## Official capability references

- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [Qoder Skills](https://docs.qoder.com/extensions/skills) and [Qoder Hooks](https://docs.qoder.com/extensions/hooks)
- [Trae Skills](https://docs.trae.cn/ide_skills) and [Trae Hooks](https://docs.trae.cn/ide_automate-actions-with-hooks)
- [Kimi Code Skills](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html) and [Kimi Code Hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)
- [Cursor Skills](https://cursor.com/docs/skills) and [Cursor Hooks](https://cursor.com/docs/hooks)
- [OpenCode Skills](https://opencode.ai/docs/skills/), [OpenCode Plugins](https://opencode.ai/docs/plugins/), and the [pre-stop event proposal](https://github.com/anomalyco/opencode/issues/16626)
- [ZCode Skills](https://zcode.z.ai/en/docs/skill) and [ZCode Hooks](https://zcode.z.ai/en/docs/hooks)
- [CodeBuddy Skills](https://www.codebuddy.ai/docs/cli/skills) and [CodeBuddy Hooks](https://www.codebuddy.ai/docs/cli/hooks)
- [DeepSeek Harness Skills](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md) and [Codex Hook bridge](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/hooks-codex/README.md)
