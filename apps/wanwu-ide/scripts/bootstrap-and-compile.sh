#!/usr/bin/env bash
# End-to-end bootstrap: fetch → brand → install extension → npm install → compile → preLaunch
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
export PATH="${WANWU_NODE20_BIN:-$HOME/.nvm/versions/node/v20.18.0/bin}:$PATH"

if ! command -v node >/dev/null || [[ "$(node -v)" != v20.* ]]; then
  echo "Need Node 20.x on PATH (recommended 20.18.0). Current: $(node -v 2>/dev/null || echo missing)" >&2
  exit 1
fi

export WANWU_FETCH_CODE_OSS=1
"$ROOT/scripts/fetch-code-oss.sh"
"$ROOT/scripts/apply-branding.sh"
cd "$REPO" && pnpm package:extension
"$ROOT/scripts/install-wanwu-extension.sh"

cd "$ROOT/code-oss"
if [[ ! -d node_modules/gulp ]]; then
  echo "npm install (requires libkrb5-dev / build-essential on Linux)..."
  npm install --no-fund --no-audit
fi
npm run compile
node build/lib/preLaunch.js
"$ROOT/scripts/smoke-ide-tree.sh"
echo "Bootstrap complete. Launch with: $ROOT/scripts/launch.sh"