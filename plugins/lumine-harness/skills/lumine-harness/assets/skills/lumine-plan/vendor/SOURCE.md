# Bundled modules: source and adaptation

- Upstream: [https://github.com/mattpocock/skills](https://github.com/mattpocock/skills), commit `49dd158d1076134a641b33efb035946536778336`.
- Copyright (c) 2026 Matt Pocock. Distributed and adapted under the [MIT License](LICENSE).
- This directory is a Lumine-maintained adaptation of the complete `grilling` and `domain-modeling` instruction modules, including both domain formats. The upstream `grill-me` and `grill-with-docs` files are aliases that invoke these modules; they are not additional runtime dependencies.
- The shared vendor directory is distributed unchanged to either locale. The modules follow the project language. They are internal `lumine-plan` resources, not separately discovered Skills; module entries are named `INSTRUCTIONS.md` to avoid recursive `SKILL.md` discovery.

## Changes from the pinned originals

| File | Lumine changes |
|---|---|
| `grilling/INSTRUCTIONS.md` | Remove standalone Skill frontmatter; scope automatic use to material uncertainties; support available investigation/delegation; explicitly retain partial answers and outstanding facts; write each reply before the next round; reuse existing stage confirmation without adding a gate. Preserve the design tree, whole frontier, numbered questions, recommendations, yes semantics and shared-understanding finish. |
| `domain-modeling/INSTRUCTIONS.md` | Remove standalone Skill frontmatter; route language, context maps and important decisions into existing authoritative material/Repo Wiki; ordinary answers into Spec/Plan; preserve all challenges, edge cases, code checks, immediate term capture, pure glossary and all three ADR gates. Add evidence, lifecycle, supersession and affected-acceptance handling. |
| `domain-modeling/GLOSSARY-FORMAT.md` | Preserve concise domain-only definitions, Avoid synonyms, grouping and complete context-map relationships; replace default root file layout with lazy existing/Wiki topics and metadata. |
| `domain-modeling/ADR-FORMAT.md` | Preserve the short paragraph format, optional useful context, all three gates and all qualifying examples; adapt storage, identity, lifecycle and evidence to Wiki without another ADR tree. |
| `LICENSE` | Unchanged upstream MIT text. |

`manifest.json` maps each distributed file to its upstream path and original SHA-256 where applicable, and records the adapted SHA-256 checked by Runtime. For an exact diff, fetch the upstream file at the pinned commit and compare it with the mapped local file; no network is needed to use the bundled modules. Adaptation notes have no upstream file. Updating a module requires reviewing its upstream diff and behavioral preservation, then updating both hashes deliberately; never update the pinned revision during installation.
