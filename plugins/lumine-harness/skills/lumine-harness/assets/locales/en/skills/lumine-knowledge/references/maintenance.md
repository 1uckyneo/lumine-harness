# Maintaining and reading knowledge

<!-- LH-WIKI-01 -->
Identify sources by registered repository identity, relative path, and content baseline. Maintain exact references and topic watch scopes so new, unreferenced files are also detected. For an unreferenced file, `wiki classify` records whether a topic needs more explanation, already covers it, or defers it, with the topic, scope, file fingerprint, and reason. Changes to the file, scope, or linked Wiki explanation require reassessment; an old decision is not a permanent ignore rule. Missing files, renames, branches, and uncommitted changes trigger assessment of affected topics; no old reference match does not imply no change. Respect ignore rules and exclude secrets, private local material, Runtime copies, caches, backups, and semantic candidates.

<!-- LH-WIKI-02 -->
Bind a work package to sources, watch scopes, body baselines, and configuration versions. Recheck relevant inputs before applying it; preserve candidates and reassess drift instead of declaring them current. Merge using the previous generated baseline, current human content, and candidate result. Protect pages without a baseline and apply only conflict-free changes. Keep body and persistent state in one revision and report each topic separately; partial success is not full completion.

<!-- LH-WIKI-03 -->
Configuration selects the body root. .lumine/wiki-state/ preserves generation baselines, identities, source versions, human protection, useful semantic candidates, and unresolved conflicts. Version shared state without allowing Runtime upgrades to overwrite it. .lumine/local/wiki/ holds only indexes, scan caches, and machine state recoverable from durable content. Clearing caches must preserve user decisions, unique candidates, and recovery material; the entire local directory is not disposable.

<!-- LH-WIKI-04 -->
Knowledge cards reuse body summaries and render as HTML DOM. Index diagram titles, labels, explanations, and relationships as text; Mermaid in the body is the only diagram source. Models read text, not rendered SVG. Render diagrams on demand in the browser with navigation, zoom, and text copy/export; generate no image or thumbnail files.

<!-- LH-WIKI-05 -->
Organize pages around real questions and explain mechanisms, technical choices, costs, and change boundaries. Choose architecture/component, sequence, flow, state, or genuinely needed data-relationship diagrams, with sources and applicability. Split complex diagrams; diagram count is not acceptance. Assess human edits, diagrams, summaries, and sources together. Separate observed operation from source implementation and do not infer deployment.

<!-- LH-WIKI-06 -->
Use wiki check for structure and references, then source and evidence for semantic review. Preserve reusable findings from the investigation in affected knowledge within authorization; explicit read-only requests receive a report only. Do not rewrite the entire library. A task promising knowledge synchronization records changed sources, the decision and reason, the knowledge revision, and verified scope. Retaining existing prose still needs a verified reason; changing a task status alone is insufficient. Unchanged sources establish snapshot equality, not semantic correctness, which needs its own review record. Close out updates with readable results, coverage, conflicts, and unresolved items. A fresh clone must allow existing knowledge to be read and searched without caches or model calls.


## CLI and knowledge fields

```bash
./.lumine/cli wiki scan
./.lumine/cli wiki classify <repo:path> --topic <id> --scope <repo:path> --fingerprint <sha256> --decision covered --reason <text>
./.lumine/cli wiki query "topic question" --limit 6
./.lumine/cli wiki show <id-or-path>
./.lumine/cli wiki update prepare <id>
./.lumine/cli wiki update apply <packet-id> --candidate <candidate.json>
./.lumine/cli wiki format plan
./.lumine/cli wiki format apply <document-id>
./.lumine/cli wiki check
```

Commands accept --root <root> and --json. `classify` also accepts `needs-explanation` or `deferred`; its reason, scope, and file fingerprint remain durable. `format plan` lists per-page eligibility without writing, while `format apply` converts one page transactionally and leaves pages with unresolved update packets in the old format. prepare saves a work package and returns its identity. The update apply candidate file has shape `{ "candidates": [{ "id": "knowledge-id", "markdown": "complete Markdown" }] }`. Preserve candidates as recoverable state, not already-applied body content.

See docs/templates/repo-wiki.md. Knowledge pages keep only id, title, summary, type, status, and locale at the top. Source, watch scope, relation, section, and diagram declarations live in a structured `lumine-wiki-metadata:v1` comment at the end of the same Markdown file; the reader, outline, and search omit that block. Status is current/proposed/historical. Sources use repoId and a relative path. The diagrams array declares id, title, caption, and sources in the order of Mermaid blocks in the body. Diagram identity never depends on rendered DOM IDs. Legacy detailed headers remain readable; ordinary creation and edits use the new form. Format migration protects body, baseline, human edits, and pending candidates.

## Sections, hierarchy, and change groups

Put a standalone `<a id="stable-section-id"></a>` before an important heading. Keep the ID when the title changes. The trailing block can associate exact evidence with `sections: [{id: "section-id", sources: ["source-id"]}]`; otherwise results show page sources without inventing section-level provenance. Relations use `{target: "document-id#fragment-id", kind: related|depends_on|decision, note: "explanation"}`. Maintain parentage only in the knowledge map.

For creation, splits, or hierarchy changes, use `wiki update prepare --manifest changes.json`. A `schemaVersion: 1` manifest contains `changes` with `kind: create|update`, `id`, the required new-page `path`, relevant `sourceRefs`, `watchScopes`, and optional `group`. By default, new sources and watch scopes are added to the existing sets. After a source move, an update change may explicitly set `replaceSources: true` and `replaceWatchScopes: true` with nonempty replacement `sourceRefs` and `watchScopes`. Prepare still requires the replacement sources to exist; apply still checks snapshots, the candidate, and human edits. It can include `coverage` and `referenceMoves`. Creation requires the destination to be absent. Grouped body, hierarchy, and identity changes cannot become partially visible as a successful result. `coverage.topics` uses `id/title/parentId?/questions/sourceScopes/documentRefs/status/reason?`; array order is sibling order. Status is planned/partial/covered/deferred, and covered requires actual content evidence.

Use `wiki update review --file review.json` for a semantic review without rewriting the page. Record `documentId/revision/sourceFingerprint/reviewedAt/reviewer/outcome/scope/findings/limitations`. The reviewer identifies an actual agent or human and author or independent role; an author check is not independent review. Source checks, semantic review, and runtime evidence are separate.

After investigating reusable findings, update affected knowledge within authorization; explicit read-only requests receive a report only. Do not rewrite the entire library. Unchanged sources establish snapshot equality, not semantic correctness. Only saved recoverable content counts as a baseline. Creation checks expected absence; updates compare baseline, current human content, and candidate. Splits maintain overview, children, and references together. Resolve conflicts and interruptions with `wiki update decide/recover`, following command help for exact objects and reasons; never force human edits aside.

## Artifact authority and stable language

Read applicable AGENTS-authorized standards in full, unconstrained by ordinary retrieval budgets. Distinguish standards, examples, implementation knowledge, and user guides. Legacy code differing from a standard is not a reason to relax it. Explain the valid basis for a standards change and review affected content; ordinary synchronization cannot change policy.

Confirmed domain language, contexts, and lasting decisions may be current Wiki knowledge while explicitly distinguishing confirmed concepts/rules from implementation facts. Preserve complete terms, overloaded terms by context, and necessary ADRs in relevant topics, linked to valid Spec/Plan evidence; unconfirmed directions remain in the current Spec/Plan. Link Wiki pages through prose and relations, not mutual sources/watchScopes; relations do not automatically invalidate freshness. Superseded lasting decisions retain their formation evidence and identity.

## Storage compaction and recovery

Upgrade Runtime first, then explicitly migrate legacy projects. Reads never migrate storage.

```text
./.lumine/cli wiki storage inspect --json
./.lumine/cli wiki storage check --json
./.lumine/cli wiki storage compact --plan --output <plan.json> --json
./.lumine/cli wiki storage compact --apply <plan.json> --expect <plan-sha256> --json
./.lumine/cli wiki storage recover <operation-id> --json
./.lumine/cli wiki storage recover <operation-id> --rollback --json
```

Planning is read-only. Review exact inputs, expected savings and protected records before applying within authorization. expect is the SHA-256 of the plan file's exact bytes. Content-addressed objects share payloads; completed packets/transactions retain receipts while active candidates and generated merge baselines remain protected. Do not manually remove updates, transactions or objects; resolve unknown formats, corruption and concurrency explicitly. Migration changes project schemaVersion to 3 while workflowVersion stays 2, so old Runtime refuses writes. Ignored .lumine-migrations recovery material is never automatically cleared. Rollback reports conflicts with later human edits; restore old state/config before downgrade. Report current storage, recovery backup and Git history separately; ordinary commits do not erase historical size.

## Maintain the reading path

Use `wiki audit --json` to find missing placements, conflicting roles, and reading signals. Check summaries, roles, entry points, exceptions and diagrams against real behavior. When splitting or replacing material, preserve old references and update related modules. The CLI does not verify semantic accuracy.

After upgrading the Runtime, preview with `wiki storage compact --plan --editorial --output <plan.json> --json`, then apply using the plan's SHA-256. This moves project configuration to schema 4 while preserving workflowVersion 2 and the object storage format. Reads never upgrade. Recover the editorial changes before downgrading the version fence to an older writer.

Add `navigation` to a change manifest with `schemaVersion: 1`, `overview` (current Wiki ID), `groups`, `unlisted` and `norms`. Groups use the understand, operate, and reference IDs, with sections holding `id/title/description?/documents`. Give each page one primary position or a stated `unlisted: [{id,reason}]` reason. Place current business features and scenarios under understand and historical content under reference.

Register AGENTS-authorized standards under operate with `norms: [{id,scope}]`. For changes to their text, scope, or authority, confirm the applicable authorization and supply `normativeChanges: [{id,reason}]`. The tool records intent; authority comes from the project and user. Keep security standards visible and readable in full. A navigation-only change can use an empty `changes` list and empty candidates with the same transaction and recovery.
