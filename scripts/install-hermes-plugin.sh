#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_src="$repo_root/integrations/hermes/oss-vault-plugin"
plugin_dst="${HERMES_HOME:-$HOME/.hermes}/plugins/oss-vault"
old_hook="${HERMES_HOME:-$HOME/.hermes}/hooks/oss-vault"
disabled_hooks="${HERMES_HOME:-$HOME/.hermes}/disabled-hooks"

mkdir -p "$plugin_dst"
cp "$plugin_src/plugin.yaml" "$plugin_dst/plugin.yaml"
cp "$plugin_src/__init__.py" "$plugin_dst/__init__.py"

if [[ -d "$old_hook" ]]; then
  mkdir -p "$disabled_hooks"
  mv "$old_hook" "$disabled_hooks/oss-vault.$(date +%Y%m%d%H%M%S)"
fi

hermes plugins enable oss-vault

echo "Installed oss-vault Hermes plugin to $plugin_dst"
echo "Restart Hermes with: hermes gateway restart"
