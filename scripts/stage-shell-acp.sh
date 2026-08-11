#!/usr/bin/env bash
# Stage wanwu CLI ACP backend into apps/wanwu-shell/resources/wanwu-cli for electron-builder.
# Usage: stage-shell-acp.sh <linux|win|mac-x64|mac-arm64>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "usage: $0 <linux|win|mac-x64|mac-arm64>" >&2
  exit 2
fi

VER="$(node -p "require('$ROOT/package.json').version")"
SRC="$ROOT/dist-bin"
DEST="$ROOT/apps/wanwu-shell/resources/wanwu-cli"

if [[ ! -f "$SRC/wanwu.mjs" ]]; then
  echo "==> build CLI mjs"
  (cd "$ROOT" && pnpm build:cli)
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -f "$SRC/wanwu.mjs" "$DEST/wanwu.mjs"

copy_native() {
  local from="$1" to="$2"
  if [[ -f "$from" ]]; then
    cp -f "$from" "$to"
    chmod +x "$to" 2>/dev/null || true
    echo "  staged native → $to"
  else
    echo "  WARN: native binary missing ($from); packaged app will use wanwu.mjs + ELECTRON_RUN_AS_NODE" >&2
  fi
}

case "$TARGET" in
  linux)
    copy_native "$SRC/wanwu-${VER}-linux-x64" "$DEST/wanwu"
    ;;
  win)
    copy_native "$SRC/wanwu-${VER}-win-x64.exe" "$DEST/wanwu.exe"
    ;;
  mac-x64)
    copy_native "$SRC/wanwu-${VER}-macos-x64" "$DEST/wanwu"
    ;;
  mac-arm64)
    copy_native "$SRC/wanwu-${VER}-macos-arm64" "$DEST/wanwu"
    ;;
  *)
    echo "unknown target: $TARGET" >&2
    exit 2
    ;;
esac

echo "OK: staged $DEST"
ls -lah "$DEST"
