#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
canonical="$repo_root/skills/lumine-harness"
wrapper="$repo_root/plugins/lumine-harness/skills/lumine-harness"

if [ ! -f "$wrapper/SKILL.md" ]; then
  echo "Plugin wrapper is missing. Run scripts/sync-plugin-wrapper.sh." >&2
  exit 1
fi

if ! diff -qr --exclude='.DS_Store' "$canonical" "$wrapper"; then
  echo "Plugin wrapper drifted from the canonical Skill. Run scripts/sync-plugin-wrapper.sh." >&2
  exit 1
fi

if grep -n -E "卢米安的[^[:space:]]*[[:space:]]*Harness|Lumine(['’]s).*Harness" \
  "$repo_root/README.md" \
  "$repo_root/README.zh-CN.md" \
  "$repo_root/plugins/lumine-harness/.codex-plugin/plugin.json" \
  "$canonical/SKILL.md"; then
  echo "Lumine Harness must be described as a technical brand, not personal ownership." >&2
  exit 1
fi

if ! grep -q '品牌词 Lumine 的中文名为“卢米安”' "$repo_root/README.zh-CN.md" || ! grep -q '品牌词 Lumine 的中文名为“卢米安”' "$canonical/SKILL.md"; then
  echo "Chinese brand introductions must state that Lumine is named 卢米安 in Chinese." >&2
  exit 1
fi

if grep -n 'Lumine Harness（卢米安）' "$repo_root/README.zh-CN.md" "$canonical/SKILL.md"; then
  echo "卢米安 names Lumine, not the complete Lumine Harness brand." >&2
  exit 1
fi

echo "Canonical Skill and Plugin wrapper are identical."
