#!/usr/bin/env bash
# Copy packaged Wanwu VSIX contents into Code-OSS built-in extensions folder.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
DEST="$ROOT/code-oss"
EXT_DIR="$DEST/extensions/wanwu-code"

if [[ ! -d "$DEST" ]]; then
  echo "missing code-oss — fetch first" >&2
  exit 1
fi

cd "$REPO_ROOT"
pnpm package:extension
VSIX="$(ls -1 "$REPO_ROOT/extensions/wanwu-vscode/"*.vsix | head -1)"
TMP="$(mktemp -d)"
unzip -q "$VSIX" -d "$TMP"
rm -rf "$EXT_DIR"
mkdir -p "$EXT_DIR"
cp -R "$TMP/extension/." "$EXT_DIR/"
rm -rf "$TMP"
echo "installed built-in extension → $EXT_DIR"