#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> smoke-acp: resolve launch plan"
LAUNCH="$(pnpm exec tsx -e 'import { resolveAcpLaunch } from "./packages/wanwu-cli/src/acpBridge.ts"; console.log(JSON.stringify(resolveAcpLaunch()))')"
echo "launch: $LAUNCH"
echo "$LAUNCH" | grep -qE 'grok-bridge|WANWU_ACP_COMMAND|wanwu-native'

echo "==> smoke-acp: doctor"
pnpm wanwu doctor

echo "==> smoke-acp: inspect (memory should include WANWU.md)"
pnpm wanwu inspect | tee /tmp/wanwu-inspect.json | head -n 80
grep -q 'WANWU.md' /tmp/wanwu-inspect.json
grep -q 'demo-fix-test.md' /tmp/wanwu-inspect.json

echo "==> smoke-acp: mock ACP client integration"
pnpm --filter wanwu-code run test

echo "==> smoke-acp: handshake through wanwu acp + mock backend"
pnpm exec tsx scripts/acp-handshake.mts

echo "==> smoke-acp: handshake through wanwu-native ACP (no grok)"
pnpm exec tsx scripts/acp-handshake-native.mts

echo "==> smoke-acp: wanwu exec via native"
pnpm wanwu exec -p "列出 README 标题" | tee /tmp/wanwu-exec-native.json
grep -qE 'README|标题|Wanwu' /tmp/wanwu-exec-native.json

if [[ -n "${WANWU_ACP_COMMAND:-}" ]]; then
  echo "==> smoke-acp: extra live backend via WANWU_ACP_COMMAND (timeout 2s)"
  set +e
  timeout 2 pnpm wanwu acp
  code=$?
  set -e
  echo "acp exit=$code"
fi

echo "==> smoke-acp OK"