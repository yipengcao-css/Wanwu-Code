#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/code-oss"
if [[ ! -f "$DEST/product.json" ]]; then
  echo "missing $DEST/product.json — run fetch-code-oss.sh first" >&2
  exit 1
fi

node --input-type=module - "$ROOT" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2];
const upstream = JSON.parse(readFileSync(join(root, "code-oss/product.json"), "utf8"));
const brand = JSON.parse(readFileSync(join(root, "product.json"), "utf8"));
const merged = { ...upstream, ...brand };
writeFileSync(join(root, "code-oss/product.json"), JSON.stringify(merged, null, 2) + "\n");
console.log("branding merged:", merged.nameLong, merged.applicationName);
NODE