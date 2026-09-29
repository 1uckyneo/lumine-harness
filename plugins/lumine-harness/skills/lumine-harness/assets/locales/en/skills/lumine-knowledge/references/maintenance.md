# Maintaining and reading knowledge

<!-- LH-WIKI-01 -->
Identify sources by registered repository identity, relative path, and content baseline. Maintain exact references and topic watch scopes so new, unreferenced files are also detected. Missing files, renames, branches, and uncommitted changes trigger assessment of affected topics; no old reference match does not imply no change. Respect ignore rules and exclude secrets, private local material, Runtime copies, caches, backups, and semantic candidates.

<!-- LH-WIKI-02 -->
Bind a work package to sources, watch scopes, body baselines, and configuration versions. Recheck relevant inputs before applying it; preserve candidates and reassess drift instead of declaring them current. Merge using the previous generated baseline, current human content, and candidate result. Protect pages without a baseline and apply only conflict-free changes. Keep body and persistent state in one revision and report each topic separately; partial success is not full completion.

<!-- LH-WIKI-03 -->
Configuration selects the body root. .lumine/wiki-state/ preserves generation baselines, identities, source versions, human protection, useful semantic candidates, and unresolved conflicts. Version shared state without allowing Runtime upgrades to overwrite it. .lumine/local/wiki/ holds only indexes, scan caches, and machine state recoverable from durable content. Clearing caches must preserve user decisions, unique candidates, and recovery material; the entire local directory is not disposable.

<!-- LH-WIKI-04 -->
Knowledge cards reuse body summaries and render as HTML DOM. Index diagram titles, labels, explanations, and relationships as text; Mermaid in the body is the only diagram source. Models read text, not rendered SVG. Render diagrams on demand in the browser with navigation, zoom, and text copy/export; generate no image or thumbnail files.

<!-- LH-WIKI-05 -->
Organize pages around real questions and explain mechanisms, technical choices, costs, and change boundaries. Choose architecture/component, sequence, flow, state, or genuinely needed data-relationship diagrams, with sources and applicability. Split complex diagrams; diagram count is not acceptance. Assess human edits, diagrams, summaries, and sources together. Separate observed operation from source implementation and do not infer deployment.

<!-- LH-WIKI-06 -->
Use wiki check for structure and references, then source and evidence for semantic review. A query does not require a full Wiki update; apply changes only when maintenance is in scope. Close out updates with readable results, coverage, conflicts, and unresolved items. A fresh clone must allow existing knowledge to be read and searched without caches or model calls.


## CLI and knowledge fields

```bash
./.lumine/cli wiki scan
./.lumine/cli wiki query "topic question" --limit 6
./.lumine/cli wiki show <id-or-path>
./.lumine/cli wiki update prepare <id>
./.lumine/cli wiki update apply <packet-id> --candidate <candidate.json>
./.lumine/cli wiki check
```

Commands accept --root <root> and --json. prepare saves a work package and returns its identity. The apply candidate file has shape `{ "candidates": [{ "id": "knowledge-id", "markdown": "complete Markdown" }] }`. Preserve candidates as recoverable state, not already-applied body content.

See docs/templates/repo-wiki.md. Knowledge frontmatter includes id, title, summary, type, status, locale, sources, and watchScopes; status is current/proposed/historical. Sources use repoId and a relative path. The diagrams array declares id, title, caption, and sources in the order of Mermaid blocks in the body. Diagram identity never depends on rendered DOM IDs.
