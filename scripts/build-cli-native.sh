#!/usr/bin/env bash
# Build multi-platform CLI binaries via @yao-pkg/pkg.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VER="$(node -p "require('./package.json').version")"
mkdir -p dist-bin

echo "==> esbuild CJS entry for pkg"
pnpm exec esbuild packages/wanwu-cli/src/index.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --outfile=dist-bin/wanwu.cjs \
  --packages=bundle

bash scripts/build-cli.sh

echo "==> pkg multi-target (node22)"
TARGETS="node22-linux-x64,node22-macos-x64,node22-macos-arm64,node22-win-x64"
pnpm exec pkg dist-bin/wanwu.cjs \
  --targets "$TARGETS" \
  --output "dist-bin/wanwu-${VER}" \
  --compress GZip \
  --public \
  || pnpm exec pkg dist-bin/wanwu.cjs \
    --targets "$TARGETS" \
    --output "dist-bin/wanwu-${VER}" \
    --compress GZip

# Normalize names when pkg uses short suffixes
normalize() {
  local src="$1" dest="$2"
  if [[ -f "$src" && "$src" != "$dest" ]]; then
    mv -f "$src" "$dest"
  fi
  if [[ -f "$dest" ]]; then
    chmod +x "$dest" 2>/dev/null || true
    echo "  ok $dest ($(du -h "$dest" | awk '{print $1}'))"
  fi
}

normalize "dist-bin/wanwu-${VER}-linux" "dist-bin/wanwu-${VER}-linux-x64"
normalize "dist-bin/wanwu-${VER}-linux-x64" "dist-bin/wanwu-${VER}-linux-x64"
normalize "dist-bin/wanwu-${VER}-macos" "dist-bin/wanwu-${VER}-macos-x64"
normalize "dist-bin/wanwu-${VER}-macos-x64" "dist-bin/wanwu-${VER}-macos-x64"
normalize "dist-bin/wanwu-${VER}-macos-arm64" "dist-bin/wanwu-${VER}-macos-arm64"
normalize "dist-bin/wanwu-${VER}-win.exe" "dist-bin/wanwu-${VER}-win-x64.exe"
normalize "dist-bin/wanwu-${VER}-win-x64.exe" "dist-bin/wanwu-${VER}-win-x64.exe"

cp -f dist-bin/wanwu.mjs "dist-bin/wanwu-${VER}.mjs"

echo "==> SHA256SUMS"
(
  cd dist-bin
  FILES=()
  for f in "wanwu-${VER}.mjs" "wanwu-${VER}-linux-x64" "wanwu-${VER}-macos-x64" "wanwu-${VER}-macos-arm64" "wanwu-${VER}-win-x64.exe"; do
    [[ -f "$f" ]] && FILES+=("$f")
  done
  if command -v sha256sum >/dev/null; then
    sha256sum "${FILES[@]}" > SHA256SUMS
  else
    shasum -a 256 "${FILES[@]}" > SHA256SUMS
  fi
  cat SHA256SUMS
)

echo "==> smoke linux binary"
LINUX="dist-bin/wanwu-${VER}-linux-x64"
if [[ -x "$LINUX" ]]; then
  "$LINUX" help | head -n 12
  "$LINUX" doctor | head -n 10
  WANWU_FORCE_DETERMINISTIC=1 "$LINUX" exec -p "列出 README 标题" | head -n 20
else
  echo "ERROR: linux binary missing" >&2
  exit 1
fi

echo "done → dist-bin/"
