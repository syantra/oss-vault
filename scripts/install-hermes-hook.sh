#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook_src="$repo_root/integrations/hermes/oss-vault"
hook_dst="${HERMES_HOME:-$HOME/.hermes}/hooks/oss-vault"

mkdir -p "$hook_dst"
cp "$hook_src/HOOK.yaml" "$hook_dst/HOOK.yaml"
cp "$hook_src/handler.py" "$hook_dst/handler.py"

echo "Installed oss-vault Hermes hook to $hook_dst"
echo "Restart Hermes with: hermes gateway restart"
