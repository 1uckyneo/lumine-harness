# Project contract

## Shared entry points and storage

- .lumine/root.json identifies the project root; .lumine/project.json controls language, repositories, capabilities, and knowledge configuration.
- .agents/skills/ distributes four canonical daily capabilities: lumine-plan, lumine-run, lumine-knowledge, and lumine-design. Initialization and maintenance still use lumine-harness.
- AGENTS.md contains host-neutral engineering rules and the map; ARCHITECTURE.md is the architecture overview. Root rules do not carry host configuration navigation or community Adapter compatibility notes; maintain actual adapter configuration separately. Mandatory rules cannot depend solely on knowledge retrieval.
- Specs default to docs/product-specs/, Plans to docs/exec-plans/active/, execution history to completed/, and evidence to docs/validation/.
- Knowledge body defaults to docs/repo-wiki/, with one authoritative configured root. .lumine/wiki-state/ preserves durable maintenance state; .lumine/local/wiki/ holds only rebuildable caches and machine state.

## Identity and language

Specs/Plans use id and type; Wiki units use stable IDs defined by the knowledge interface. Separate titles, filenames, and identity; readable names may contain Chinese characters and spaces. AC headings use explicit IDs such as AC-001; diagrams and important sections have stable references. Resolve CLI targets by ID, path, or unambiguous name, never by guessing between duplicates.

Project locale is zh-CN or en and is resolved before proposals and fingerprints. New content follows the default; existing documents keep their own language. Interface or temporary response-language changes do not translate bodies. Language resources share semantics; protocol fields, status values, and technical Skill names are not translated.

## Work and evidence

Planning may produce a Spec only; complete feature work normally uses Spec and Plan. The Plan owns the technical change, stable implemented knowledge moves into Wiki, and intended behavior never overwrites current facts prematurely. The Agent selects among the four capabilities using the goal and repository facts, assesses design needs, and judges readiness; users need not invoke each Skill. Product Spec, optional design and Spec update, Exec Plan, and Run handoffs require explicit human confirmation under the [stage handoff guidance](../../assets/locales/en/skills/lumine-plan/references/stage-handoff.md). Work autonomously within a stage and do not request the same confirmation again. Verification during or after Run needs no separate confirmation; verification-only work does not repair.

Runtime supplies deterministic checks; the four capabilities own their semantic reviews. Completion evidence matches the current request, applicable acceptance subset, content baseline, and actual operations. Distinguish tests, runtime behavior, deployment, and user acceptance. Task records under .lumine/tasks/ bind the current session and mode; see [Checks and evidence](runtime-checks.md).

Use done, continue, and blocked as public control states; explain the specific blocker and next action separately. Status grants no authorization, and automatic follow-ups share budgets and deduplication. Diagnostic done may include failing findings. Only knowledge synchronization explicitly within the current task affects its completion.

## Knowledge presentation

Markdown and Mermaid text are one content source, with HTML DOM cards. Models process text only; diagrams render on demand in the browser without images, thumbnails, or vision-model input. Explain real mechanisms and cite sources while preserving prose reading and text copy/export.
