#!/bin/sh
# Use the existing Node runtime; do not change any global configuration.
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)" || exit 1
if ! command -v node >/dev/null 2>&1; then
  codex_node='/Users/stealth/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin'
  if [ -x "$codex_node/node" ]; then PATH="$codex_node:$PATH"; export PATH; else echo 'Node.js 22.12 or later is required.' >&2; exit 1; fi
fi
if command -v npm >/dev/null 2>&1; then exec npm "$@"; fi
if [ -f .runtime/npm/bin/npm-cli.js ]; then exec node .runtime/npm/bin/npm-cli.js "$@"; fi
echo 'npm is required. Install Node.js with npm, then run npm install.' >&2
exit 1
