# Adoption and upgrades

<!-- LH-ADOPT-01 -->
Inspect the user-selected target, repository boundaries, existing rules, and uncommitted changes. Use the business root for a single repository and a common directory covering registered repositories for a multi-repository project; that directory need not have Git. Read [Target topology](target-topology.md) when classification is needed.

<!-- LH-ADOPT-02 -->
Resolve language and selected host adapters before generating a concrete migration proposal. Use the tools bundled with this Skill:

```bash
node scripts/harness-manager.mjs inspect <target-root>
node scripts/harness-manager.mjs proposal <target-root> --locale en --adapters <list-or-none> --output <proposal.json>
node scripts/harness-manager.mjs adopt --proposal <proposal.json>
```

For an existing project, use `upgrade --plan <target-root> --locale en --output <proposal.json>`, then `upgrade --apply --proposal <proposal.json>`. Quote paths containing spaces; placeholders are not real targets.

<!-- LH-ADOPT-03 -->
The proposal lists exact writes, preserved files, conflicts, backups, language, source version, and host limitations. Follow [Migration policy](migration-policy.md) to protect real content and recovery state. Reuse authorization for the same concrete installation or maintenance scope; request a decision for new scope or unresolved unsafe conflicts. This does not replace confirmation of concrete deliverables at product-stage handoffs. User-level configuration and external actions retain their own authorization boundaries.

<!-- LH-ADOPT-04 -->
Use the [Project contract](harness-contract.md) to install four daily Skills, templates, and .lumine/ in the selected language, merging valid project constraints. Use the [stage handoff guidance](../../assets/locales/en/skills/lumine-plan/references/stage-handoff.md) to check the installed or upgraded root rules, workflow documents, and daily Skills: work autonomously within a stage and obtain explicit human confirmation before crossing stages. Reconcile unconditional cross-stage continuation rules in active guidance without rewriting historical decisions or evidence. Keep business root rules host-neutral rather than adding host configuration maps or community Adapter compatibility notes; maintain the selected Adapter configuration separately. After installation, the current Agent continues with lumine-knowledge building guidance: understand real capabilities, plan a project-specific hierarchy, and cover all major modules in depth by default unless the user narrows or defers the scope. The Agent reads sources, writes prose and Mermaid, and verifies cross-module relationships; programs only prepare, validate, and safely save results. Batch large projects and preserve recovery positions. Upgrades protect existing knowledge assets and do not regenerate the library by default.

<!-- LH-ADOPT-05 -->
Verify distribution, root resolution, and actual host state using [Checks and evidence](runtime-checks.md). Check that installed stage handoff references are readable and current rules agree; retaining old project files alone does not complete a workflow upgrade. Report completed work, coverage limits, host limitations, and next actions; configuration presence, static checks, and runtime execution are distinct. Read [Coordination](worker-coordination.md) when parallel work is useful.
