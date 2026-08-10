#!/usr/bin/env bash
# Shallow-clone Microsoft vscode (Code-OSS) at a pinned tag.
set -euo pipefail
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