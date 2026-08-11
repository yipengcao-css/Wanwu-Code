#!/usr/bin/env bash
# Prettier-style PostToolUse hook: format check when prettier is available, else no-op success.
set -euo pipefail
cd "$(dirname "$0")/../.."
if pnpm exec prettier --version >/dev/null 2>&1; then
  pnpm exec prettier --check "packages/wanwu-protocol/src/index.ts" "packages/wanwu-workflow/src/index.ts"
  echo "[wanwu-hook] prettier check ok"
else
  echo "[wanwu-hook] prettier not installed; skip format check (ok)"
fi