#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <target-root>" >&2
  exit 1
fi

skill_root="$(cd "$(dirname "$0")/.." && pwd)"
target_root="$(cd "$1" && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"

cd "$target_root"

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  has_git=1
else
  has_git=0
fi

if [ "$has_git" -eq 0 ]; then
  backup_dir=".codex/local/harness-backup/$timestamp"
  mkdir -p "$backup_dir"
  for p in AGENTS.md .codex/hooks.json .codex/hooks .codex/agents .agents/skills/harness-navigate .agents/skills/harness-draft .agents/skills/harness-generated .agents/skills/harness-design .agents/skills/harness-plan .agents/skills/harness-run .agents/skills/harness-check; do
    if [ -e "$p" ]; then
      mkdir -p "$backup_dir/$(dirname "$p")"
      cp -R "$p" "$backup_dir/$p"
    fi
  done
fi

inspect_output="$("$skill_root/scripts/inspect-target.sh" "$target_root")"
topology="$(printf '%s\n' "$inspect_output" | awk -F= '/^TOPOLOGY=/{print $2}')"
child_repos="$(printf '%s\n' "$inspect_output" | awk -F= '/^CHILD_REPOS=/{print $2}')"
backend_signal="$(printf '%s\n' "$inspect_output" | awk -F= '/^BACKEND_SIGNAL=/{print $2}')"
frontend_signal="$(printf '%s\n' "$inspect_output" | awk -F= '/^FRONTEND_SIGNAL=/{print $2}')"
db_signal="$(printf '%s\n' "$inspect_output" | awk -F= '/^DB_SIGNAL=/{print $2}')"

project_name="$(basename "$target_root")"
implementation_surface="当前是 ${topology}。业务实现 surface 由 AGENTS.md 的主要目录速查和 ARCHITECTURE.md 继续细化。"
repo_rules_entry="AGENTS.md、ARCHITECTURE.md、README.md，以及目标模块自己的 README / docs / skills"
directory_map="- \`.\`：当前 harness 根和默认业务实现入口。"
fact_index_targets="- \`AGENTS.md\`\n- \`ARCHITECTURE.md\`\n- \`README.md\`\n- \`.agents/skills/\`\n- \`.codex/agents/\`\n- \`.codex/hooks/\`\n- \`docs/\`"

if [ "$topology" = "workspace-with-child-repos" ] && [ "$child_repos" != "none" ]; then
  implementation_surface="当前是 workspace；根仓负责 harness 协调，业务实现默认进入对应子仓或 app。"
  directory_map=""
  IFS=',' read -r -a children <<< "$child_repos"
  for child in "${children[@]}"; do
    directory_map+="- \`$child\`：业务子仓或 app，详细规则以该目录内 README/AGENTS/源码为准。\n"
    fact_index_targets+="\n- \`$child/README.md\`\n- \`$child/AGENTS.md\`\n- \`$child/CLAUDE.md\`"
  done
fi

mkdir -p docs/drafts docs/design-docs docs/product-specs docs/exec-plans/active docs/exec-plans/completed docs/validation docs/generated docs/references/browser-automation docs/references/vendor-llms docs/templates .agents/skills .codex/agents .codex/hooks/lib .codex/tests

sed \
  -e "s#{{project_name}}#$project_name#g" \
  -e "s#{{target_root}}#$target_root#g" \
  -e "s#{{implementation_surface}}#$implementation_surface#g" \
  -e "s#{{repo_rules_entry}}#$repo_rules_entry#g" \
  -e "s#{{directory_map}}#$directory_map#g" \
  -e "s#{{fact_index_targets}}#$fact_index_targets#g" \
  "$skill_root/assets/root/AGENTS.md" > AGENTS.md

sed \
  -e "s#{{project_name}}#$project_name#g" \
  -e "s#{{topology}}#$topology#g" \
  -e "s#{{implementation_surfaces}}#${child_repos:-.}#g" \
  -e "s#{{tech_signals}}#backend=$backend_signal, frontend=$frontend_signal, db=$db_signal#g" \
  -e "s#{{context_entry_points}}#TODO: fill after reading generated indexes and project docs.#g" \
  -e "s#{{detailed_directory_map}}#TODO: fill real module map.#g" \
  -e "s#{{backend_path}}#TODO: fill backend path or mark not applicable.#g" \
  -e "s#{{frontend_path}}#TODO: fill frontend path or mark not applicable.#g" \
  -e "s#{{mobile_path}}#TODO: fill mobile path or mark not applicable.#g" \
  -e "s#{{data_path}}#TODO: fill data/script path or mark not applicable.#g" \
  -e "s#{{domain_map}}#TODO: fill domain map.#g" \
  -e "s#{{verification_entry_points}}#TODO: fill startup/test/browser verification commands.#g" \
  "$skill_root/assets/root/ARCHITECTURE.md" > ARCHITECTURE.md

cp "$skill_root/assets/harness" harness
chmod +x harness
cp "$skill_root/assets/codex/harness-check.mjs" .codex/harness-check.mjs
cp "$skill_root/assets/codex/harness-generated.mjs" .codex/harness-generated.mjs
cp "$skill_root/assets/codex/hooks.json" .codex/hooks.json
cp -R "$skill_root/assets/codex/hooks/." .codex/hooks/
cp -R "$skill_root/assets/codex/tests/." .codex/tests/
cp -R "$skill_root/assets/codex/agents/." .codex/agents/
cp -R "$skill_root/assets/skills/." .agents/skills/

cp "$skill_root/assets/docs-seed/workflow-artifacts.md" docs/workflow-artifacts.md
cp "$skill_root/assets/docs-seed/FRONTEND.md" docs/FRONTEND.md
cp "$skill_root/assets/docs-seed/drafts-index.md" docs/drafts/index.md
cp "$skill_root/assets/docs-seed/design-docs/index.md" docs/design-docs/index.md
cp "$skill_root/assets/docs-seed/design-docs/core-beliefs.md" docs/design-docs/core-beliefs.md
cp "$skill_root/assets/docs-seed/design-docs/design-gate.md" docs/design-docs/design-gate.md
cp "$skill_root/assets/docs-seed/generated/index.md" docs/generated/index.md
cp "$skill_root/assets/docs-seed/references/index.md" docs/references/index.md
cp "$skill_root/assets/docs-seed/references/browser-automation/index.md" docs/references/browser-automation/index.md
cp "$skill_root/assets/docs-seed/references/vendor-llms/index.md" docs/references/vendor-llms/index.md
cp "$skill_root/assets/docs-templates/"*.md docs/templates/

./harness generated refresh all

cat <<REPORT
Harness bootstrap applied.
TOPOLOGY=$topology
HAS_GIT=$has_git
BACKUP_DIR=$([ "$has_git" -eq 0 ] && echo "$backup_dir" || echo "not-created-git-available")
Next: review docs/generated/*.md, update review metadata, fill ARCHITECTURE.md TODOs, then run ./harness check all.
REPORT
