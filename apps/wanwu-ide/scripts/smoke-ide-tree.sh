#!/usr/bin/env bash
# Validate Wanwu IDE tree without a full Electron build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OSS="$ROOT/code-oss"

fail() { echo "FAIL: $*" >&2; exit 1; }

[[ -d "$OSS" ]] || fail "code-oss missing — run fetch-code-oss.sh"
[[ -f "$OSS/product.json" ]] || fail "product.json missing"
name="$(node -e "console.log(require('$OSS/product.json').nameLong)")"
[[ "$name" == "Wanwu Code" ]] || fail "branding not applied (nameLong=$name)"
[[ -f "$OSS/extensions/wanwu-code/package.json" ]] || fail "built-in wanwu-code extension missing"
[[ -f "$OSS/extensions/wanwu-code/out/extension.js" ]] || fail "extension not compiled"
[[ -d "$OSS/src/vs" ]] || fail "upstream sources incomplete"

echo "OK: Wanwu IDE tree smoke"
echo "  product: $name"
echo "  extension: $OSS/extensions/wanwu-code"
echo "  note: full Electron boot requires npm install + native toolchain on a desktop host"