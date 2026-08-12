#!/usr/bin/env bash
# Build Wanwu Shell installers for linux / win / mac (hard requirement).
# Bundles wanwu-cli ACP backend under resources/wanwu-cli (no pnpm/tsx at runtime).
#
# macOS signing / notarize (optional, secrets-gated):
#   CSC_LINK, CSC_KEY_PASSWORD          — Developer ID Application .p12
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID — notarize
# Without secrets (default): unsigned zips; Linux hosts cannot codesign.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/wanwu-shell"

VER="$(node -p "require('./package.json').version")"
mkdir -p release build

if [[ ! -f build/icon.png ]]; then
  echo "missing build/icon.png (need ≥512x512)" >&2
  exit 1
fi

echo "==> build CLI (mjs + native matrix for ACP bundling)"
(cd "$ROOT" && pnpm build:cli:native)

echo "==> build app (vite + electron main)"
pnpm run build

# Signing only on macOS with a provided identity; otherwise force unsigned.
if [[ "$(uname -s)" == "Darwin" && -n "${CSC_LINK:-}" ]]; then
  echo "==> macOS signing enabled (CSC_LINK present)"
  export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-true}"
else
  echo "==> unsigned desktop build (no CSC_LINK or non-Darwin host)"
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi

# WANWU_SHELL_TARGETS=all|linux|win|mac  (default: all)
TARGETS="${WANWU_SHELL_TARGETS:-all}"

if [[ "$TARGETS" == "all" || "$TARGETS" == "linux" ]]; then
  echo "==> linux AppImage + deb"
  bash "$ROOT/scripts/stage-shell-acp.sh" linux
  pnpm exec electron-builder --linux AppImage deb --x64 --config electron-builder.yml
fi

if [[ "$TARGETS" == "all" || "$TARGETS" == "win" ]]; then
  echo "==> windows zip (portable distribution; NSIS needs stable wine)"
  bash "$ROOT/scripts/stage-shell-acp.sh" win
  pnpm exec electron-builder --win zip --x64 --config electron-builder.yml
fi

if [[ "$TARGETS" == "all" || "$TARGETS" == "mac" ]]; then
  echo "==> mac zip (x64 + arm64)"
  bash "$ROOT/scripts/stage-shell-acp.sh" mac-x64
  pnpm exec electron-builder --mac zip --x64 --config electron-builder.yml
  bash "$ROOT/scripts/stage-shell-acp.sh" mac-arm64
  pnpm exec electron-builder --mac zip --arm64 --config electron-builder.yml
fi

normalize() {
  local src="$1" dest="$2"
  if [[ -f "$src" ]]; then
    cp -f "$src" "$dest"
    echo "  $dest"
  fi
}

normalize "release/Wanwu Code-${VER}-linux-x86_64.AppImage" "release/Wanwu-Code-${VER}-linux-x64.AppImage"
normalize "release/Wanwu Code-${VER}-linux-amd64.deb" "release/Wanwu-Code-${VER}-linux-amd64.deb"
normalize "release/Wanwu Code-${VER}-win-x64.zip" "release/Wanwu-Code-${VER}-win-x64.zip"
normalize "release/Wanwu Code-${VER}-mac-x64.zip" "release/Wanwu-Code-${VER}-mac-x64.zip"
normalize "release/Wanwu Code-${VER}-mac-arm64.zip" "release/Wanwu-Code-${VER}-mac-arm64.zip"

echo "==> checklist"
ls -lah release/Wanwu-Code-${VER}-* 2>/dev/null || ls -lah release/ | head -40

if [[ "$TARGETS" == "all" || "$TARGETS" == "linux" ]]; then
  test -f "release/Wanwu-Code-${VER}-linux-x64.AppImage"
fi
if [[ "$TARGETS" == "all" || "$TARGETS" == "win" ]]; then
  test -f "release/Wanwu-Code-${VER}-win-x64.zip"
fi
if [[ "$TARGETS" == "all" || "$TARGETS" == "mac" ]]; then
  test -f "release/Wanwu-Code-${VER}-mac-x64.zip"
  test -f "release/Wanwu-Code-${VER}-mac-arm64.zip"
fi

echo "OK: shell dist targets=${TARGETS} (ACP bundled)"
if [[ "$TARGETS" == "all" || "$TARGETS" == "mac" ]]; then
  if [[ "$(uname -s)" == "Darwin" && -n "${CSC_LINK:-}" ]]; then
    echo "OK: mac signing attempted (notarize if APPLE_* secrets set)"
  else
    echo "NOTE: mac artifacts unsigned — see docs/SIGNING.md"
  fi
fi
