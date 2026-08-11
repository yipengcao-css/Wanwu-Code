#!/usr/bin/env bash
# DEPRECATED: Code-OSS is no longer the product shell. Use apps/wanwu-shell.
# Shallow-clone Microsoft vscode (Code-OSS) at a pinned tag (legacy only).
set -euo pipefail
echo "WARNING: apps/wanwu-ide Code-OSS path is DEPRECATED. Prefer apps/wanwu-shell." >&2
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
TAG="${CODE_OSS_TAG:-1.96.0}"
DEST="$ROOT/code-oss"

if [[ "${WANWU_FETCH_CODE_OSS:-}" != "1" ]]; then
  echo "Refusing to fetch Code-OSS unless WANWU_FETCH_CODE_OSS=1"
  echo "This download is large. Example:"
  echo "  WANWU_FETCH_CODE_OSS=1 $0"
  exit 0
fi

if [[ -d "$DEST/.git" ]]; then
  echo "already present: $DEST"
  exit 0
fi

rm -rf "$DEST"
git clone --depth 1 --branch "$TAG" https://github.com/microsoft/vscode.git "$DEST"
echo "fetched Code-OSS $TAG → $DEST"
echo "next: $ROOT/scripts/apply-branding.sh"