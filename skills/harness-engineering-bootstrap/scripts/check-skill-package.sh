#!/usr/bin/env bash
set -euo pipefail

skill_root="$(cd "$(dirname "$0")/.." && pwd)"

required_files=(
  "SKILL.md"
  "references/target-topology.md"
  "references/migration-policy.md"
  "references/harness-contract.md"
  "references/generated-and-checks.md"
  "references/subagent-lanes.md"
  "assets/root/AGENTS.md"
  "assets/root/ARCHITECTURE.md"
  "assets/harness"
  "assets/codex/harness-check.mjs"
  "assets/codex/harness-generated.mjs"
  "assets/codex/hooks.json"
  "assets/codex/hooks/session-start.mjs"
  "assets/codex/hooks/stop-gate.mjs"
  "assets/codex/hooks/lib/session-start-context.mjs"
  "assets/codex/hooks/lib/stop-gate.mjs"
  "assets/codex/tests/session-start.test.mjs"
  "assets/codex/tests/stop-gate.test.mjs"
  "assets/docs-templates/draft.md"
  "assets/docs-templates/DESIGN.md"
  "assets/docs-templates/component-map.md"
  "assets/docs-templates/product-spec.md"
  "assets/docs-templates/exec-plan.md"
  "assets/docs-seed/workflow-artifacts.md"
  "assets/docs-seed/FRONTEND.md"
  "assets/docs-seed/drafts-index.md"
  "assets/docs-seed/design-docs/index.md"
  "assets/docs-seed/design-docs/core-beliefs.md"
  "assets/docs-seed/design-docs/design-gate.md"
  "assets/docs-seed/generated/index.md"
  "assets/docs-seed/references/index.md"
  "assets/docs-seed/references/browser-automation/index.md"
  "assets/docs-seed/references/vendor-llms/index.md"
  "assets/skills/harness-navigate/SKILL.md"
  "assets/skills/harness-draft/SKILL.md"
  "assets/skills/harness-generated/SKILL.md"
  "assets/skills/harness-design/SKILL.md"
  "assets/skills/harness-plan/SKILL.md"
  "assets/skills/harness-run/SKILL.md"
  "assets/skills/harness-check/SKILL.md"
  "assets/codex/agents/harness_repo_mapper.toml"
  "assets/codex/agents/harness_generated_reviewer.toml"
  "assets/codex/agents/harness_doc_normalizer.toml"
  "assets/codex/agents/harness_backend_data_worker.toml"
  "assets/codex/agents/harness_frontend_ui_worker.toml"
  "assets/codex/agents/harness_integration_worker.toml"
  "assets/codex/agents/harness_bugfix_investigator.toml"
  "assets/codex/agents/harness_runtime_verifier.toml"
  "scripts/inspect-target.sh"
  "scripts/apply-harness-bootstrap.sh"
)

missing=0
for relative_path in "${required_files[@]}"; do
  if [ ! -f "$skill_root/$relative_path" ]; then
    echo "Missing: $relative_path" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  exit 1
fi

if ! grep -q "name: harness-engineering-bootstrap" "$skill_root/SKILL.md"; then
  echo "SKILL.md frontmatter name is wrong" >&2
  exit 1
fi

if grep -R -n -E "HARNESS-SKILL:BEGIN|managed block|local-first|harness-workspace-|harness_draft_planner|harness_implementation_worker|harness_verifier|unified-develop" "$skill_root" \
  --exclude-dir=.git \
  --exclude='check-skill-package.sh'; then
  echo "Found old workflow or workspace-specific residue" >&2
  exit 1
fi

if grep -R -n -E "prototype\.html|component-map\.md|review_viewports" "$skill_root/SKILL.md" "$skill_root/references" "$skill_root/assets" \
  --exclude-dir=.git \
  --exclude='check-skill-package.sh'; then
  echo "Found old single-page design handoff wording; use prototypes[] with prototypes/, component-maps/, and screenshots/<page-id>/ instead" >&2
  exit 1
fi

if grep -R -n -E "docs/(drafts|product-specs|exec-plans/(active|completed))/(<domain>|<domain>/<slug>|<domain>/<feature|<domain>/<plan|[^[:space:]()]+/[^[:space:]()]+\.md)|docs/design-docs/[^[:space:]()]+/[^[:space:]()]+/DESIGN\.md|domain: \"\"|domain/slug" "$skill_root/SKILL.md" "$skill_root/references" "$skill_root/assets" \
  --exclude-dir=.git \
  --exclude='check-skill-package.sh'; then
  echo "Found old domain/slug harness path wording; use slug-only planning docs and docs/design-docs/<slug>/ instead" >&2
  exit 1
fi

echo "Skill package looks complete: $skill_root"
