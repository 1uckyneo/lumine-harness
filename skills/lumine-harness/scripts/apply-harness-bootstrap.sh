#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <target-root> [codex,qoder,trae,kimi,cursor,opencode,zcode,deepseek-harness]" >&2
  exit 1
fi

skill_root="$(cd "$(dirname "$0")/.." && pwd)"
target_root="$(cd "$1" && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"
selected_products="${2:-codex}"

IFS=',' read -r -a requested_products <<< "$selected_products"
for product in "${requested_products[@]}"; do
  case "$product" in
    codex|qoder|trae|kimi|cursor|opencode|zcode|deepseek-harness) ;;
    *)
      echo "Unknown adapter product: $product" >&2
      exit 2
      ;;
  esac
done

cd "$target_root"

if git rev-parse --show-toplevel >/dev/null 2>&1; then
  has_git=1
else
  has_git=0
fi

if [ "$has_git" -eq 0 ]; then
  backup_dir=".harness/local/harness-backup/$timestamp"
  mkdir -p "$backup_dir"
  for p in AGENTS.md harness .harness .codex/hooks.json .qoder/settings.json .trae/hooks.json .cursor/hooks.json .opencode/plugins/harness.mjs .agents/skills/lumine-harness-navigate .agents/skills/lumine-harness-draft .agents/skills/lumine-harness-generated .agents/skills/lumine-harness-design .agents/skills/lumine-harness-plan .agents/skills/lumine-harness-run .agents/skills/lumine-harness-check; do
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
implementation_surface="当前是 ${topology}。业务实现 surface 由 AGENTS.md 的实现入口速查和 ARCHITECTURE.md 继续细化。"
repo_rules_entry="AGENTS.md、ARCHITECTURE.md、README.md，以及目标模块自己的 README / docs / skills"
directory_map="- \`.\`：当前 harness 根和默认业务实现入口。"
fact_index_targets="- \`AGENTS.md\`\n- \`ARCHITECTURE.md\`\n- \`README.md\`\n- \`.agents/skills/\`\n- \`.harness/\`\n- \`docs/\`"

case ",$selected_products," in *,codex,*) fact_index_targets+="\n- \`.codex/hooks.json\`" ;; esac
case ",$selected_products," in *,qoder,*) fact_index_targets+="\n- \`.qoder/settings.json\`" ;; esac
case ",$selected_products," in *,trae,*) fact_index_targets+="\n- \`.trae/hooks.json\`" ;; esac
case ",$selected_products," in *,cursor,*) fact_index_targets+="\n- \`.cursor/hooks.json\`" ;; esac
case ",$selected_products," in *,opencode,*) fact_index_targets+="\n- \`.opencode/plugins/harness.mjs\`" ;; esac
case ",$selected_products," in *,zcode,*) fact_index_targets+="\n- \`.harness/adapters/zcode/marketplace/\`" ;; esac
case ",$selected_products," in *,deepseek-harness,*) fact_index_targets+="\n- \`.harness/adapters/deepseek-harness/bundle/\`" ;; esac

if [ "$topology" = "workspace-with-child-repos" ] && [ "$child_repos" != "none" ]; then
  implementation_surface="当前是 workspace；根仓负责 harness 协调，业务实现默认进入对应子仓或 app。"
  directory_map=""
  IFS=',' read -r -a children <<< "$child_repos"
  for child in "${children[@]}"; do
    directory_map+="- \`$child\`：业务子仓或 app，详细规则以该目录内 README/AGENTS/源码为准。\n"
    fact_index_targets+="\n- \`$child/README.md\`\n- \`$child/AGENTS.md\`\n- \`$child/CLAUDE.md\`"
  done
fi

mkdir -p docs/drafts docs/design-docs docs/product-specs docs/exec-plans/active docs/exec-plans/completed docs/validation docs/generated docs/references/browser-automation docs/references/vendor-llms docs/templates .agents/skills .harness

legacy_skill_backup=".harness/local/harness-backup/$timestamp/legacy-skills"
for old_skill in harness-navigate harness-draft harness-generated harness-design harness-plan harness-run harness-check; do
  if [ -e ".agents/skills/$old_skill" ]; then
    mkdir -p "$legacy_skill_backup"
    mv ".agents/skills/$old_skill" "$legacy_skill_backup/$old_skill"
  fi
done

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

cp -R "$skill_root/assets/harness/." .harness/
chmod +x .harness/cli
cp -R "$skill_root/assets/skills/." .agents/skills/

case ",$selected_products," in
  *,codex,*) mkdir -p .codex; cp "$skill_root/assets/codex/hooks.json" .codex/hooks.json ;;
esac
case ",$selected_products," in
  *,qoder,*) mkdir -p .qoder; cp "$skill_root/assets/qoder/settings.json" .qoder/settings.json ;;
esac
case ",$selected_products," in
  *,trae,*) mkdir -p .trae; cp "$skill_root/assets/trae/hooks.json" .trae/hooks.json ;;
esac
case ",$selected_products," in
  *,cursor,*) mkdir -p .cursor; cp "$skill_root/assets/cursor/hooks.json" .cursor/hooks.json ;;
esac
case ",$selected_products," in
  *,opencode,*) mkdir -p .opencode/plugins; cp "$skill_root/assets/opencode/plugins/harness.mjs" .opencode/plugins/harness.mjs ;;
esac

touch .gitignore
grep -qxF '/.harness/runtime/' .gitignore || echo '/.harness/runtime/' >> .gitignore
grep -qxF '/.harness/local/' .gitignore || echo '/.harness/local/' >> .gitignore

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
cp "$skill_root/assets/docs-templates/"*.json docs/templates/

./.harness/cli generated refresh all

cat <<REPORT
Harness bootstrap applied.
TOPOLOGY=$topology
HAS_GIT=$has_git
BACKUP_DIR=$([ "$has_git" -eq 0 ] && echo "$backup_dir" || echo "not-created-git-available")
SELECTED_ADAPTERS=$selected_products
KIMI_INSTALL=$([[ ",$selected_products," == *,kimi,* ]] && echo "requires-separate-approval: ./.harness/cli adapter install kimi" || echo "not-selected")
ZCODE_INSTALL=$([[ ",$selected_products," == *,zcode,* ]] && echo "requires-manual-plugin-install: ./.harness/cli adapter install zcode" || echo "not-selected")
DEEPSEEK_HARNESS_INSTALL=$([[ ",$selected_products," == *,deepseek-harness,* ]] && echo "requires-separate-profile-install: ./.harness/cli adapter install deepseek-harness" || echo "not-selected")
Next: review docs/generated/*.md, update review metadata, fill ARCHITECTURE.md TODOs, then run ./.harness/cli check all.
REPORT
