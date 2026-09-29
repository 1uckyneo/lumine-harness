# Understanding the project and building its Wiki

<!-- LH-BUILD-01 -->
Inspect real entry points, registrations, configuration, tests, and valid decisions to identify major capabilities, shared mechanisms, dependencies, and runtime boundaries. Structure the hierarchy around project purpose and reader questions. Libraries, CLIs, single-client apps, and multi-repository systems need different structures. Include getting started, API, frontend, or deployment topics only when relevant; do not create empty categories. Label examples, unconnected modules, and historical content.

<!-- LH-BUILD-02 -->
Maintain topic hierarchy, sibling order, questions, source scopes, document references, and gaps in `.lumine/wiki-state/coverage.json`, the single navigation source. Give each page one primary location; use explained relations elsewhere. Stable important sections support progressive reading without separate approval or task state machines. Revisit the hierarchy when modules are added, split, replaced, or removed.

<!-- LH-BUILD-03 -->
Cover all major modules in depth by default unless the user narrows or defers the scope. Ask concrete questions: how entry points, data, and external dependencies cooperate; how normal, failed, cancelled, and recovery paths work; which constraints and invariants matter; what changes affect and how to verify them. Measure coverage through these questions, not page, word, or diagram counts or per-file inventories.

<!-- LH-BUILD-04 -->
The Agent/model reads sources, writes coherent explanations, tradeoffs, and Mermaid, and verifies cross-module paths. Cite recorded rationale; label code-derived rationale as inference. Separate source facts, observed operation, and deployment. Explain shared mechanisms once and module-specific differences locally. Cards and section summaries reuse the same body rather than maintaining separate knowledge.

<!-- LH-BUILD-05 -->
Work in batches for large projects. Parallel workers need exclusive pages and explicit sources and questions; integrate relations and hierarchy serially. Preserve completed topics, remaining questions, conflicts, and recovery locations. Report tool installation, semantic writing, and content acceptance separately. Partial work is not comprehensive completion. Without an active Agent, Runtime can only preserve pending work.

<!-- LH-BUILD-06 -->
Have a reviewer who did not write the content answer mechanism, change-impact, failure, and verification questions against source; check cross-module paths separately. Structural checks, unchanged sources, and author checks are not independent semantic review. Record body revision, source snapshot, scope, findings, and limits. Then let a cold-start Agent independently choose Wiki or source for real questions to test discoverability, understanding, and source location.
