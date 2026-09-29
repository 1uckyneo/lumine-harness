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
The proposal lists exact writes, preserved files, conflicts, backups, language, source version, and host limitations. Follow [Migration policy](migration-policy.md) to protect real content and recovery state. Continue when existing authorization covers the concrete scope rather than adding phase approvals; request a decision for new scope or unresolved unsafe conflicts. User-level configuration and external actions retain their own authorization boundaries.

<!-- LH-ADOPT-04 -->
Use the [Project contract](harness-contract.md) to install four daily Skills, templates, and .lumine/ in the selected language. Merge valid project constraints, do not copy another project's instance, and avoid parallel obsolete primary workflows. Initialize Wiki with the active Agent and text sources, choosing meaningful project topics with clear scope and verifiable provenance. No active Agent means no completed semantic generation claim.

<!-- LH-ADOPT-05 -->
Verify distribution, root resolution, and actual host state using [Checks and evidence](runtime-checks.md). Report completed work, coverage limits, host limitations, and next actions; configuration presence, static checks, and runtime execution are distinct. Read [Coordination](worker-coordination.md) when parallel work is useful.
