#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
canonical="$repo_root/skills/lumine-harness"
wrapper="$repo_root/plugins/lumine-harness/skills/lumine-harness"

if [ ! -f "$canonical/SKILL.md" ]; then
  echo "Canonical Skill is missing: $canonical" >&2
  exit 1
fi

mkdir -p "$wrapper"
rsync -a --delete --exclude='.DS_Store' "$canonical/" "$wrapper/"
echo "Plugin wrapper synchronized from $canonical"
