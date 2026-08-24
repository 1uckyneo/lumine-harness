#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <reviewed-proposal.json>" >&2
  echo "Create one first with: node $SCRIPT_DIR/harness-manager.mjs proposal <target-root> --adapters none|list --output <proposal.json>" >&2
  exit 2
fi

exec node "$SCRIPT_DIR/harness-manager.mjs" adopt --proposal "$1"
