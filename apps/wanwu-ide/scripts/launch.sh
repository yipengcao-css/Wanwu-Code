#!/usr/bin/env bash
# DEPRECATED: launch apps/wanwu-shell instead.
# Launch legacy Wanwu IDE (Code-OSS) in development mode.
echo "WARNING: Code-OSS launch is DEPRECATED. Use: pnpm --filter wanwu-shell dev" >&2
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OSS="$ROOT/code-oss"
export PATH="${WANWU_NODE20_BIN:-$HOME/.nvm/versions/node/v20.18.0/bin}:$PATH"

[[ -x "$OSS/.build/electron/wanwu-code" ]] || {
  echo "Electron binary missing. Run bootstrap first:" >&2
  echo "  WANWU_FETCH_CODE_OSS=1 $ROOT/scripts/fetch-code-oss.sh" >&2
  echo "  $ROOT/scripts/apply-branding.sh && $ROOT/scripts/install-wanwu-extension.sh" >&2
  echo "  (cd $OSS && npm install && npm run compile && node build/lib/preLaunch.js)" >&2
  exit 1
}

cd "$OSS"
export VSCODE_SKIP_PRELAUNCH="${VSCODE_SKIP_PRELAUNCH:-1}"
if [[ -n "${DISPLAY:-}" ]]; then
  exec ./scripts/code.sh "$@"
fi
if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a ./scripts/code.sh "$@"
fi
echo "No DISPLAY and no xvfb-run; cannot launch GUI" >&2
exit 1