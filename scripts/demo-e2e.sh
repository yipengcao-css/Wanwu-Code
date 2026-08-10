#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1) Show failing demo test (expected fail)"
set +e
pnpm --filter @wanwu/failing-test-demo run test:demo
demo_code=$?
set -e
echo "demo_exit=$demo_code (expect non-zero)"

echo "==> 2) Create Wanwu plan artifact"
pnpm wanwu plan -p "修复 examples/failing-test-demo 中 sum 函数，使测试通过"

echo "==> 3) Apply the known minimal fix in a temp copy (do not mutate repo demo permanently)"
tmp="$(mktemp -d)"
cp -R examples/failing-test-demo "$tmp/demo"
python3 - <<'PY' "$tmp/demo/src/sum.js"
from pathlib import Path
import sys
Path(sys.argv[1]).write_text("export function sum(a, b) {\n  return a + b;\n}\n", encoding="utf-8")
PY
echo "==> 4) Verify temp demo turns green"
(cd "$tmp/demo" && node --test src/sum.test.js)

echo "==> 5) Repo verify gate still green"
pnpm wanwu verify

echo "==> demo-e2e OK (repo demo left intentionally failing)"