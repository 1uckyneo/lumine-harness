# What Works in Each Agent

Lumine Harness lets multiple Agent products share one `AGENTS.md`, one `.agents/skills` directory, the same engineering documents, and the same Harness Core. Products still differ in how they load those assets, execute Hooks, and start another turn automatically.

Keep one boundary in mind: **creating the integration files does not prove that the current Agent has used them.** The result depends on the product, its version, and behavior observed in a real session.

## Five questions to answer first

### Can my Agent use Lumine Harness?

The canonical package provides integrations for Codex, Qoder, Trae, Kimi Code, Cursor, OpenCode, ZCode, CodeBuddy, and DeepSeek Harness. Some products read shared project assets directly, some need an Adapter to route to the real files, and some require one-time installation or settings.

“An integration is available” describes repository implementation. It is not a claim that every version of the product has passed a real-session check.

### What can be automatic?

Separate two capabilities:

- **Core workflow** means the Agent can read project instructions, Skills, and workflow documents and move through Draft, optional Design, Product Spec, Exec Plan, implementation, and Validation.
- **Automatic continuation** means the host can start another turn when the Agent is about to stop but a clear and safe next step remains.

A product can support the core workflow without supporting automatic continuation. In that case Lumine Harness still preserves task state, but a person starts the next turn.

### Is any setup still required?

Adoption creates the required project files first. A person is involved only when an integration needs user-level configuration, an in-product toggle, a local Plugin, or a profile extension. The connection check reports the exact next step.

### How do I know it actually works?

Open a new session in the Agent you intend to use, start it from the Harness project root, and send:

```text
Check whether the current Agent is connected to Lumine Harness correctly.
```

The check summarizes existing evidence and lists project instructions, shared Skills, lifecycle Hooks, automatic continuation, and session isolation separately. It does not run a complete host certification automatically. Capabilities that an ordinary check cannot observe remain “not verified” or “not directly observable” instead of treating configuration presence as runtime evidence.

### What still requires a person?

- installing a user-level Hook, local Plugin, or profile extension for the first time;
- enabling project instructions, shared Skills, or Hooks in product settings;
- starting another turn when the product cannot do so automatically;
- supplying credentials, completing external-app actions, making product decisions, and authorizing high-risk work;
- checking capabilities the host does not expose programmatically.

## Results you may see

The connection check returns a plain conclusion and the next action:

- **Ready to use**: the current session's basic connection was observed; advanced capabilities remain qualified by their individual evidence rows.
- **One-time setup required**: project files are ready, but installation, authorization, or a product setting remains.
- **Core workflow available; some automation is manual**: project context and Skills work, but the product limits features such as automatic continuation.
- **Real-session verification not completed**: repository implementation exists, but the current product version lacks sufficient runtime evidence.
- **Connection problem found**: observed behavior differs from the integration contract; the result names the affected capability and a repair step.

## Current product summary

“Available” below means Lumine Harness contains the corresponding implementation. It does not mean the product installed on the current machine has passed verification.

| Agent | Core workflow | Automatic continuation | One-time setup | Current verification |
| --- | --- | --- | --- | --- |
| Codex | Available | Available | Usually none | Run the connection check in the current version |
| Qoder | Explicit Skills and Harness phases can be routed | Varies by IDE, CLI, and version | Follow the connection check | Record the concrete product surface and version |
| Trae | Available | Available | Enable project instructions, shared Skills, and project Hooks | Check after enabling settings |
| Kimi Code | Available | Available | Authorize user-level Hook installation | Check after installation |
| Cursor | Available | Available | Trust the project only if Cursor marks it restricted | Run the connection check in the current version |
| OpenCode | Available | Manual continuation required | Uses a project Plugin and cannot intercept before a turn ends | Core workflow can be checked; automatic continuation is unavailable |
| ZCode | Explicit Skills and Harness phases can be routed | Available, with a host limit of 3 consecutive continuations | Install a local Marketplace Plugin | Check after installation |
| CodeBuddy | Explicit Skills and Harness phases can be routed | Available | Review Hook changes in `/hooks` | Check after review |
| DeepSeek Harness | Preview support | Limited | Install a profile extension | Developer preview |

## First-use notes by product

### Codex

- **Available behavior**: the integration uses root `AGENTS.md`, shared `.agents/skills`, and project lifecycle configuration.
- **First-time setup**: normally none beyond starting a new session from the correct Harness root.
- **Still manual**: credentials, external-app actions, high-risk authorization, and product decisions.
- **How to check**: run the connection check and require real results for project instructions, a Skill, and lifecycle events.
- **If it fails**: confirm the session started at the Harness root, then inspect the repository Codex Hook configuration.

### Qoder

- **Available behavior**: explicit Skill names and Harness phases can be routed to shared `.agents/skills`.
- **First-time setup**: record whether you use Qoder IDE, CLI, or another surface because events may differ by surface and version.
- **Still manual**: implicit discovery of every project Skill from general language is best effort; use an explicit Skill or phase for critical work.
- **How to check**: verify in the actual product that the intended `SKILL.md` was read before the first mutation.
- **If it fails**: retry with an explicit Skill name, then inspect the events exposed by that product version.

### Trae

- **Available behavior**: the integration reuses root `AGENTS.md`, shared `.agents/skills`, and project Hooks.
- **First-time setup**: enable project instructions, shared Skills, and project Hooks in Trae.
- **Still manual**: repository files cannot confirm these product settings for you.
- **How to check**: restart the session after enabling settings, then run the connection check.
- **If it fails**: confirm Trae opened the complete Harness root rather than one child repository.

### Kimi Code

- **Available behavior**: project instructions and shared Skills remain in the project; lifecycle events use user-level Hooks.
- **First-time setup**: separately authorize installation of the Kimi Code user-level Hooks, then reload Kimi Code.
- **Still manual**: Hook errors or timeouts may allow execution to continue, so high-risk work cannot depend on Hooks alone.
- **How to check**: start a new session after installation and run the connection check.
- **If it fails**: inspect the managed Hooks in the user configuration and confirm the session started at the Harness root.

### Cursor

- **Available behavior**: the integration uses root project instructions, shared Skills, and Cursor project Hooks.
- **First-time setup**: normally none. If Cursor marks the project restricted, follow its prompt to trust the project.
- **Still manual**: project Hooks may not execute while the project is restricted.
- **How to check**: run the connection check in the current Cursor version.
- **If it fails**: check the project's restricted state, then confirm the Hook loaded from the complete Harness root.

### OpenCode

- **Available behavior**: project instructions, shared Skills, context supplementation, and runtime audit can be integrated.
- **First-time setup**: adoption generates a project Plugin that must run on a supported OpenCode version.
- **Still manual**: there is no complete pre-stop gate, so a person starts the next turn when work should continue.
- **How to check**: inspect project context, Skills, and audit events; the result should explicitly show that automatic continuation is unavailable.
- **If it fails**: compare the OpenCode version with the supported project Plugin range.

### ZCode

- **Available behavior**: the Adapter routes explicit Skills and Harness phases to shared `.agents/skills`.
- **First-time setup**: add the local Marketplace in ZCode, install and enable the Lumine Harness Adapter Plugin, then start a new session.
- **Still manual**: ZCode does not execute project-level Hook files directly, and the host allows at most 3 consecutive automatic continuations.
- **How to check**: after installing the Plugin, verify both Hook execution and Skill reads in a real session.
- **If it fails**: check whether the Plugin is enabled; do not use project Hook file presence as proof.

### CodeBuddy

- **Available behavior**: the Adapter routes explicit Skills and Harness phases to shared `.agents/skills`.
- **First-time setup**: after project Hook configuration is added or changed, review it in CodeBuddy's `/hooks` view.
- **Still manual**: implicit discovery of every Skill from general language is best effort; critical work should use explicit entry points.
- **How to check**: start a new session after reviewing Hooks, then run the connection check.
- **If it fails**: confirm that CodeBuddy project memory references root `AGENTS.md` and that Hook changes were reviewed.

### DeepSeek Harness

- **Available behavior**: the current integration uses a local profile extension for project instructions, shared Skills, and part of the lifecycle.
- **First-time setup**: separately authorize profile installation and start DeepSeek Harness from the Harness root.
- **Still manual**: the bridge remains incomplete and must not be the only gate for high-risk actions.
- **How to check**: record the concrete version and run the connection check.
- **If it fails**: verify host and extension versions and treat the integration as preview rather than claiming full compatibility.

## If the connection check cannot identify the Agent

Lumine Harness does not ask the model to guess which product hosts it. The current product comes from real Adapter session state. If it cannot be identified:

1. run the check inside the Agent you intend to use;
2. start a new session from the directory containing `.harness/root.json`;
3. finish that product's one-time setup;
4. run the connection check again.

For internal capability states, diagnostic commands, and runtime evidence, read [Advanced Adapter Verification](adapter-verification.md).
