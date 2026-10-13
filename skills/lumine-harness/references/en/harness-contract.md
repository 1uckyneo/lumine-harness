# Project contract

## Shared entry points and storage

- .lumine/root.json identifies the project root; .lumine/project.json controls language, repositories, capabilities, and knowledge configuration.
- .agents/skills/ distributes four daily capabilities: lumine-plan, lumine-run, lumine-knowledge, and lumine-design. Questioning and domain-modeling modules ship inside planning. Reuse or generate project extensions as needed without global installation. Initialization and maintenance use lumine-harness.
- AGENTS.md keeps basic safety and authorization boundaries, necessary repository identity, minimal stage gates, and task-based standards routing. Its fixed Required standards section explicitly designates an index or attachments. Read applicable standards, templates, and examples in full before editing, independently of search matches. Report missing or inapplicable standards instead of generating empty pages. Keep business root rules host-neutral and maintain actual Adapter configuration separately.
- Keep architecture maps and detailed standards in Wiki rather than generating root ARCHITECTURE.md by default. Migrate unique content and repair references before retiring old files under [Migration policy](migration-policy.md); preserve and report them when retirement is unsafe.
- Specs default to docs/product-specs/, Plans to docs/exec-plans/active/, execution history to completed/, evidence to docs/validation/, and Wiki to one configured root, normally docs/repo-wiki/. Do not create separate docs/domain/ or docs/decisions/ ledgers.
- .lumine/wiki-state/ preserves durable knowledge state. Only .lumine/local/wiki/ holds rebuildable caches and machine state; other local material may be protected private input.

## Artifact roles and authority

Product Spec owns the product proposal's goals, scope, scenarios, rules, acceptance criteria, and open questions. Exec Plan derives the relevant technical approach, tradeoffs, execution and verification arrangements, progress, and implementation records from applicable Specs/AC items. Validation preserves actual actions, results, and original evidence. After necessary questioning, write each round of answers into the applicable Spec/Plan, distinguishing decisions, directions, assumptions, and open choices. An answer is not stage-handoff confirmation.

Wiki holds verified implementation and confirmed reusable domain language, context boundaries, lasting decisions, standards, examples, and guides. Preserve complete terms with meanings and relevant aliases, relationships, and invariants; distinguish overloaded terms by context. Keep necessary ADR context, alternatives, decision, and consequences in the relevant Wiki topic, linked to its originating Spec/Plan. Proposed choices for this change remain in the Plan. Confirmed language or policy does not prove implementation; state that distinction in prose and diagrams.

AGENTS may explicitly authorize Wiki standards as rule attachments. Distinguish standards, explanatory examples, and factual knowledge. Ordinary synchronization cannot relax standards or authorization based on legacy source. Review affected content when standards change. Relate Wiki pages through prose and relations rather than source snapshots.

Do not copy framework-maintenance explanations, adoption discussions, full architecture maps, or technical details into the root entry point. Backend, frontend, test, plugin, icon, and similar rules live in their owning standards; a task index preserves required reading and priority. Update detailed rules in their owning standard, changing the root only when applicability or routing changes. Adoption and upgrades map each existing rule's source, role, destination, authority, and reading trigger. Preserving a file does not establish reconciliation.

Put original material in references, retired material in archives, and personal configuration or private originals in ignored local storage. Maintain one current body per item without parallel business-memory ledgers.

## Identity and language

Specs/Plans use stable id and type; Wiki uses stable IDs from its knowledge interface. AC headings use explicit AC-001 IDs, with stable references for important sections and diagrams. Resolve CLI targets by ID, path, or unambiguous name.

Project locale is zh-CN or en, resolved before proposals and fingerprints. New prose and topic filenames follow locale by default, retaining README, template names, and necessary technical terms. Do not bulk-translate or rename existing documents. Use Windows-compatible names: no reserved names, control characters, or `< > : " / \ | ? *`, no trailing dot/space, and no case/Unicode-normalization collisions. Renames preserve stable identities and necessary old path/section redirects. Protocol fields, status values, and technical Skill names are not translated.

## Work and evidence

Complete product work uses Spec → (necessary design → update Spec) → Exec Plan → Run with explicit human confirmation at [stage handoffs](../../assets/locales/en/skills/lumine-plan/references/stage-handoff.md). Work autonomously within a stage without repeating confirmation. A Spec-only change needs no Plan. Verification during or after Run needs no separate confirmation; verification-only work does not repair.

Runtime supplies deterministic checks; the four capabilities own semantic judgment. Adoption delivery reuses Validation, Wiki coverage, and versioned knowledge evidence in .lumine/tasks/. Report installation, content completion, and actual verification separately without changing migration complete or adding another state machine. See [Checks and evidence](runtime-checks.md).

Use done, continue, and blocked as public control states, explaining the cause and next action separately. Status grants no authorization. Diagnostic done may include failing findings; only knowledge synchronization promised in this request affects completion.

## Knowledge presentation

Markdown and Mermaid text are one content source, with HTML DOM cards. Models process text only; browsers render diagrams on demand without knowledge images, thumbnails, or vision-model input. Explain actual mechanisms or confirmed concepts and their status while preserving prose reading and text copy/export.
