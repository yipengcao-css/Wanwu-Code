#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Wanwu-Code bootstrap"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install: npm i -g pnpm" >&2
  exit 1
fi

pnpm install
pnpm typecheck
pnpm test
echo "==> bootstrap OK"