#!/usr/bin/env bash
# 本地一键：failing-test-demo 黄金路径（不启动 Shell/Electron，不改 cloud CI）。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> demo-failing-test-local: 1) 预期失败的 demo 测试"
set +e
pnpm --filter @wanwu/failing-test-demo run test:demo
demo_code=$?
set -e
echo "demo_exit=$demo_code (expect non-zero)"

echo "==> 2) wanwu plan 工件"
pnpm wanwu plan -p "修复 examples/failing-test-demo 中 sum 函数，使测试通过"

echo "==> 3) 在临时目录应用最小修复并验证变绿"
tmp="$(mktemp -d)"
cp -R examples/failing-test-demo "$tmp/demo"
python3 - <<'PY' "$tmp/demo/src/sum.js"
from pathlib import Path
import sys
Path(sys.argv[1]).write_text("export function sum(a, b) {\n  return a + b;\n}\n", encoding="utf-8")
PY
(cd "$tmp/demo" && node --test src/sum.test.js)

echo "==> 4) 仓库 verify 门禁（demo 源码仍保持 failing）"
pnpm wanwu verify

echo "==> 5) 本地 UI/Agent harness"
./scripts/smoke-local-harness.sh

echo "==> demo-failing-test-local OK"
