---
name: lumine-harness
description: Adopt, migrate, or upgrade Lumine Harness in a single- or multi-repository project; initialize project workflow, language, shared Skills, knowledge, and host adapters. 用于项目首次采用、迁移与升级，不代替日常规划或实施。
---

# Lumine Harness

Lumine Harness helps people and Agents understand a project, preserve boundaries, resume work, and verify delivery. Lumine 中文写作“[卢米安](https://weibo.com/u/3316905545)”。

## Choose the project language / 选择项目语言

Use explicit user choice first, then existing project locale. For a new conversational setup, offer `zh-CN` or `en` if no choice is established; non-interactive setup defaults to `en` and states this in its proposal. Resolve language before selecting assets or calculating proposal hashes. Applying a proposal does not choose language again.

优先采用用户明确选择，其次已有项目语言。新项目未有选择时提供 `zh-CN`／`en`；非交互默认英文并在提案中说明。语言必须在选取资产与计算提案指纹前确定，应用时不重新选择。

- **English:** read [Adoption and upgrades](references/en/adoption.md).
- **简体中文：**读取[采用与升级](references/adoption.md)。

Read only the language-specific references needed for the task. Inspect the actual target; do not copy an unrelated project's workflow. For installation and maintenance, reuse authorization for the same concrete scope; it does not bypass the product-stage confirmations installed in the project. Preserve project edits and constraints. Creating a proposal is not authorization to change external systems or publish.

按当前语言读取所需参考，检查实际目标，不从其他业务工程复制规则。安装维护可沿用同一具体范围的授权，但不能据此跳过项目产品流程中的阶段确认；保留项目修改和约束。提案不产生外部系统操作或发布授权。

Everyday project work uses the installed `lumine-plan`, `lumine-run`, `lumine-knowledge`, and `lumine-design` Skills. Checks are Runtime tools. This entry owns initialization and maintenance, not another mandatory daily phase.

日常工作使用项目内四个 Skill：`lumine-plan`、`lumine-run`、`lumine-knowledge`、`lumine-design`。检查由 Runtime 提供，本入口只负责初始化与维护。

Install the [stage handoff guidance](assets/locales/en/skills/lumine-plan/references/stage-handoff.md): Product Spec, optional design and Spec update, Exec Plan, then Run. The Agent assesses readiness and selects Skills; the user confirms each stage handoff. Verification during or after Run needs no separate confirmation. Adoption and upgrades must reconcile conflicting active project guidance while preserving valid project constraints and historical evidence.

安装[阶段交接指导](assets/skills/lumine-plan/references/stage-handoff.md)：先产品 Spec，按需要设计并回写 Spec，再 Exec Plan、Run。Agent 判断就绪程度并选择 Skill，各阶段交接由人确认；Run 中或之后的验证不另设确认。采用或升级时对齐项目活跃指引中的冲突规则，保留有效项目约束和历史证据。

After first adoption, the current Agent continues with `lumine-knowledge` to understand the project and build a project-specific Wiki covering its major modules, unless the user narrows or defers that work. Tools do not create semantic knowledge. Report installation, knowledge coverage, and content verification separately; preserve progress for resumption.

首次采用后，当前 Agent 接续 `lumine-knowledge`，理解项目、规划适用目录并深入覆盖主要模块；用户可以缩小范围或延后。工具不承担知识理解与撰写。安装、知识覆盖和内容核实分别报告，未完成工作保存恢复位置。
