#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <target-root>" >&2
  exit 1
fi

target_root="$1"

if [ ! -d "$target_root" ]; then
  echo "Target root does not exist: $target_root" >&2
  exit 1
fi

cd "$target_root"

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  has_git=1
else
  has_git=0
fi

child_repos="$(find . -mindepth 2 -maxdepth 2 -type d -name .git -prune 2>/dev/null | sed 's#^\./##;s#/.git$##' | sort | paste -sd, -)"

backend_signal=0
frontend_signal=0
db_signal=0

if find . -maxdepth 4 \( -name pom.xml -o -name build.gradle -o -name go.mod -o -name pyproject.toml -o -name requirements.txt \) | grep -q .; then
  backend_signal=1
fi

if find . -maxdepth 5 \( -name package.json -o -name vite.config.ts -o -name next.config.js -o -name nuxt.config.ts \) | grep -q .; then
  frontend_signal=1
fi

if find . -maxdepth 6 \( -name '*.sql' -o -path '*/migrations/*' -o -name '*.prisma' \) | grep -q .; then
  db_signal=1
fi

topology="unknown-traditional"
if [ -n "$child_repos" ] || [ -f pnpm-workspace.yaml ] || [ -f turbo.json ] || [ -d apps ] || [ -d packages ]; then
  topology="workspace-with-child-repos"
elif [ "$backend_signal" -eq 1 ] && [ "$frontend_signal" -eq 1 ]; then
  topology="single-fullstack"
elif [ "$backend_signal" -eq 1 ]; then
  topology="backend-only"
elif [ "$frontend_signal" -eq 1 ]; then
  topology="frontend-only"
fi

ai_surfaces=()
for p in AGENTS.md CLAUDE.md .agents/skills .harness .codex/skills .codex/agents .codex/hooks .codex/hooks.json .qoder/settings.json .trae/hooks.json .cursor/hooks.json .opencode/plugins .zcode .dsh .claude/skills .claude/docs; do
  [ -e "$p" ] && ai_surfaces+=("$p")
done

missing_docs=()
for dir in docs/drafts docs/design-docs docs/product-specs docs/exec-plans/active docs/exec-plans/completed docs/validation docs/generated docs/references docs/templates; do
  [ -d "$dir" ] || missing_docs+=("$dir")
done

not_applicable=()
if [ "$frontend_signal" -eq 0 ]; then
  not_applicable+=("frontend-routes" "frontend-components" "browser-design-check")
fi
if [ "$backend_signal" -eq 0 ]; then
  not_applicable+=("backend-api-runtime")
fi
if [ "$db_signal" -eq 0 ]; then
  not_applicable+=("db-schema")
fi

echo "TARGET_ROOT=$PWD"
echo "TOPOLOGY=$topology"
echo "HAS_GIT=$has_git"
echo "CHILD_REPOS=${child_repos:-none}"
echo "BACKEND_SIGNAL=$backend_signal"
echo "FRONTEND_SIGNAL=$frontend_signal"
echo "DB_SIGNAL=$db_signal"
echo "AI_WORKFLOW_SURFACES=${ai_surfaces[*]:-none}"
echo "MISSING_DOCS_CONTRACT=${missing_docs[*]:-none}"
echo "NOT_APPLICABLE_CHECKS=${not_applicable[*]:-none}"
echo "README_PRESENT=$([ -f README.md ] && echo 1 || echo 0)"
echo "AGENTS_PRESENT=$([ -f AGENTS.md ] && echo 1 || echo 0)"
echo "CODEX_HOOKS_JSON_PRESENT=$([ -f .codex/hooks.json ] && echo 1 || echo 0)"
echo "QODER_SETTINGS_PRESENT=$([ -f .qoder/settings.json ] && echo 1 || echo 0)"
echo "TRAE_HOOKS_PRESENT=$([ -f .trae/hooks.json ] && echo 1 || echo 0)"
echo "CURSOR_HOOKS_PRESENT=$([ -f .cursor/hooks.json ] && echo 1 || echo 0)"
echo "OPENCODE_PLUGIN_PRESENT=$([ -f .opencode/plugins/harness.mjs ] && echo 1 || echo 0)"
echo "ZCODE_ADAPTER_PRESENT=$([ -f .harness/adapters/zcode/marketplace/marketplace.json ] && echo 1 || echo 0)"
echo "ZCODE_RUNTIME_EVIDENCE_PRESENT=$([ -f .harness/runtime/zcode/latest-hook.json ] && echo 1 || echo 0)"
echo "DEEPSEEK_HARNESS_BUNDLE_PRESENT=$([ -f .harness/adapters/deepseek-harness/bundle/package.json ] && echo 1 || echo 0)"
echo "DEEPSEEK_HARNESS_RUNTIME_EVIDENCE_PRESENT=$([ -f .harness/runtime/deepseek-harness/latest-hook.json ] && echo 1 || echo 0)"
echo "KIMI_USER_CONFIG_PRESENT=$([ -f "${KIMI_CODE_HOME:-$HOME/.kimi-code}/config.toml" ] && echo 1 || echo 0)"
echo "HARNESS_DIR_PRESENT=$([ -d .harness ] && echo 1 || echo 0)"
