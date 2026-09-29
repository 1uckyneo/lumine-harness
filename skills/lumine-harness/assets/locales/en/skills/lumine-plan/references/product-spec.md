# Product specification

<!-- LH-SPEC-01 -->
A Spec first explains whose problem is being solved, then goals, scope, scenarios, product rules, and acceptance. Clarify incomplete requirements in that same document, without a preliminary draft copy. Include technical constraints, interface behavior, and data requirements only when they affect product choices. Detailed implementation belongs in the Exec Plan.

<!-- LH-SPEC-02 -->
Use docs/templates/product-spec.md as guidance and omit irrelevant parts. Start with a product overview; describe user actions, system feedback, outcomes, and applicable failure/recovery behavior. Use Mermaid for product flows when useful. Link extensive parameters and logs to their sources. Readers should understand goals and acceptance without first reading chat or code.

<!-- LH-SPEC-03 -->
Use a stable id, type: product-spec, the document's own locale, and truthful status. Derive readable filenames from titles; Chinese characters and spaces are supported. Identity is not derived from filenames or headings. Give acceptance items stable headings such as `### AC-001: Users can recover their existing conversation`; never reuse a retired ID. New requirements receive new IDs, while revisions retain their identity and record their impact.

<!-- LH-SPEC-04 -->
Keep one current set of requirements. Move superseded batches and findings to a clearly marked historical section or existing history file. Plans reference applicable AC subsets and their content baselines; re-evaluate only affected references. Formatting, titles, and renames do not automatically revoke approval. Fingerprints detect changes; approval and its scope need separate evidence.

<!-- LH-SPEC-05 -->
Review whether the proposal solves the stated problem, normal/failure behavior is consistent, exclusions are clear, acceptance is observable, and constraints are compatible. Judge realistic scenarios rather than section count, length, or field validation.
