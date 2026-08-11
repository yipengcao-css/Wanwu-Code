#!/usr/bin/env bash
# Remove locally fetched Code-OSS tree (not part of product path anymore).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/code-oss"
if [[ -d "$TARGET" ]]; then
  echo "Removing $TARGET …"
  rm -rf "$TARGET"
  echo "done"
else
  echo "nothing to purge ($TARGET missing)"
fi
