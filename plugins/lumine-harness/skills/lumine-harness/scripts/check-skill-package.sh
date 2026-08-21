#!/usr/bin/env bash
set -euo pipefail

skill_root="$(cd "$(dirname "$0")/.." && pwd)"

required_files=(
  "SKILL.md"
  "references/target-topology.md"
  "references/migration-policy.md"
  "references/harness-contract.md"
  "references/generated-and-checks.md"
  "references/worker-coordination.md"
  "assets/root/AGENTS.md"
  "assets/root/ARCHITECTURE.md"
  "assets/harness/cli"
  "assets/harness/root.json"
  "assets/harness/adapter-capabilities.json"
  "assets/harness/adapter-manager.mjs"
  "assets/harness/adapter-cli.mjs"
  "assets/harness/core/contracts.d.ts"
  "assets/harness/core/root-resolver.mjs"
  "assets/harness/core/session-context.mjs"
  "assets/harness/core/stop-policy.mjs"
  "assets/harness/core/work-status.mjs"
  "assets/harness/check.mjs"
  "assets/harness/generated.mjs"
  "assets/codex/hooks.json"
  "assets/qoder/settings.json"
  "assets/trae/hooks.json"
  "assets/cursor/hooks.json"
  "assets/opencode/plugins/harness.mjs"
  "assets/harness/adapters/zcode/hooks/dispatch.mjs"
  "assets/harness/adapters/zcode/marketplace/marketplace.json"
  "assets/harness/adapters/zcode/marketplace/plugins/lumine-harness-adapter/.zcode-plugin/plugin.json"
  "assets/harness/adapters/zcode/marketplace/plugins/lumine-harness-adapter/hooks/hooks.json"
  "assets/harness/adapters/zcode/marketplace/plugins/lumine-harness-adapter/hooks/installed-dispatcher.mjs"
  "assets/harness/adapters/deepseek-harness/hooks.json"
  "assets/harness/adapters/deepseek-harness/hooks/dispatch.mjs"
  "assets/harness/adapters/deepseek-harness/bundle/package.json"
  "assets/harness/adapters/deepseek-harness/bundle/cordis.patch.yml"
  "assets/harness/adapters/codex/hooks/session-start.mjs"
  "assets/harness/adapters/codex/hooks/stop-gate.mjs"
  "assets/harness/adapters/codex/hooks/lib/session-start-context.mjs"
  "assets/harness/adapters/codex/hooks/lib/stop-gate.mjs"
  "assets/harness/adapters/qoder/hooks/prompt-submit.mjs"
  "assets/harness/adapters/qoder/hooks/tool-before.mjs"
  "assets/harness/adapters/qoder/hooks/tool-after.mjs"
  "assets/harness/adapters/qoder/hooks/stop.mjs"
  "assets/harness/adapters/trae/hooks/session-start.mjs"
  "assets/harness/adapters/trae/hooks/stop.mjs"
  "assets/harness/adapters/kimi/hooks/dispatch.mjs"
  "assets/harness/adapters/kimi/installed-dispatcher.mjs"
  "assets/harness/adapters/cursor/hooks/session-start.mjs"
  "assets/harness/adapters/cursor/hooks/after-agent-response.mjs"
  "assets/harness/adapters/cursor/hooks/stop.mjs"
  "assets/harness/tests/session-start.test.mjs"
  "assets/harness/tests/stop-gate.test.mjs"
  "assets/harness/tests/multi-agent-adapters.test.mjs"
  "assets/docs-templates/draft.md"
  "assets/docs-templates/DESIGN.md"
  "assets/docs-templates/component-map.md"
  "assets/docs-templates/handoff.md"
  "assets/docs-templates/handoff.design.json"
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
  "assets/skills/lumine-harness-navigate/SKILL.md"
  "assets/skills/lumine-harness-draft/SKILL.md"
  "assets/skills/lumine-harness-generated/SKILL.md"
  "assets/skills/lumine-harness-design/SKILL.md"
  "assets/skills/lumine-harness-plan/SKILL.md"
  "assets/skills/lumine-harness-run/SKILL.md"
  "assets/skills/lumine-harness-check/SKILL.md"
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

if ! grep -q '^name: lumine-harness$' "$skill_root/SKILL.md"; then
  echo "SKILL.md frontmatter name is wrong" >&2
  exit 1
fi

if grep -R -n -E "HARNESS-SKILL:BEGIN|local-first|harness-workspace-|harness_draft_planner|harness_implementation_worker|harness_verifier|unified-develop|/Users/N/Documents/Develop/zdx/unified-develop-workspace" "$skill_root" \
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

if grep -R -n -i -E "GPT-IMAGE-2|GPT-[0-9]|Claude[-_. ][0-9]|Gemini[-_. ][0-9]|Qwen[-_. ]?[0-9]|DeepSeek-(V|R)[0-9]|由[[:space:]]*Codex|让[[:space:]]*Codex|给[[:space:]]*Codex|Codex[[:space:]]*(判断|根据|内部|只更新|维护|可以)|Codex Chrome plugin|Codex in-app Browser|codex-chrome-plugin|codex-in-app-browser" \
  "$skill_root/SKILL.md" \
  "$skill_root/assets/skills" \
  "$skill_root/assets/root/AGENTS.md" \
  "$skill_root/assets/docs-seed/workflow-artifacts.md" \
  "$skill_root/assets/docs-seed/drafts-index.md" \
  "$skill_root/assets/docs-seed/design-docs" \
  "$skill_root/assets/docs-seed/references/browser-automation/index.md" \
  "$skill_root/assets/docs-templates" \
  --exclude-dir=.git; then
  echo "Found a specific model identifier or fixed Agent-product actor in the public Harness workflow" >&2
  exit 1
fi

if grep -R -n -E "assets/codex/(agents|hooks/|tests)|\.codex/(hooks/(session|stop)|lumine-harness-check|lumine-harness-generated)|(^|[^.])\./harness (check|generated)" "$skill_root/SKILL.md" "$skill_root/references" "$skill_root/assets" "$skill_root/scripts" \
  --exclude-dir=.git \
  --exclude='check-skill-package.sh'; then
  echo "Found old Codex-only harness asset references; use .harness/ plus .codex/hooks.json only" >&2
  exit 1
fi

if [ -d "$skill_root/assets/codex/agents" ] || [ -d "$skill_root/assets/codex/hooks" ] || [ -d "$skill_root/assets/codex/tests" ]; then
  echo "assets/codex must only contain hooks.json" >&2
  exit 1
fi

for forbidden in assets/qoder/skills assets/trae/skills assets/kimi-code/skills assets/qoder/rules assets/trae/rules assets/cursor/rules assets/zcode/skills assets/zcode/rules assets/dsh/skills; do
  if [ -e "$skill_root/$forbidden" ]; then
    echo "Found forbidden product-specific Rule or Skill source: $forbidden" >&2
    exit 1
  fi
done

if ! grep -q '"stopGate": "unsupported"' "$skill_root/assets/harness/adapter-capabilities.json"; then
  echo "OpenCode capability must declare stopGate unsupported" >&2
  exit 1
fi

if grep -q '"SessionStart"' "$skill_root/assets/qoder/settings.json"; then
  echo "Qoder IDE project hooks do not currently expose SessionStart; use UserPromptSubmit fallback" >&2
  exit 1
fi

if ! grep -q '"install": "local-marketplace+manual"' "$skill_root/assets/harness/adapter-capabilities.json"; then
  echo "ZCode capability must declare local Marketplace installation" >&2
  exit 1
fi

if ! grep -q '"verifiedBridgeVersion": "0.1.0-rc.7"' "$skill_root/assets/harness/adapter-capabilities.json"; then
  echo "DeepSeek Harness capability must pin the verified bridge version" >&2
  exit 1
fi

if grep -R -n -E '(^|[/`])harness-(navigate|draft|generated|design|plan|run|check)([/`]|$)' "$skill_root" \
  --exclude-dir=.git \
  --exclude='apply-harness-bootstrap.sh' \
  --exclude='check-skill-package.sh'; then
  echo "Found an unprefixed project Harness Skill; generated Skills must use lumine-harness-*" >&2
  exit 1
fi

if grep -R -n -E "docs/(drafts|product-specs|exec-plans/(active|completed))/(<domain>|<domain>/<slug>|<domain>/<feature|<domain>/<plan|[^[:space:]()]+/[^[:space:]()]+\.md)|docs/design-docs/[^[:space:]()]+/[^[:space:]()]+/DESIGN\.md|domain: \"\"|domain/slug" "$skill_root/SKILL.md" "$skill_root/references" "$skill_root/assets" \
  --exclude-dir=.git \
  --exclude='check-skill-package.sh'; then
  echo "Found old domain/slug harness path wording; use slug-only planning docs and docs/design-docs/<slug>/ instead" >&2
  exit 1
fi

echo "Skill package looks complete: $skill_root"
