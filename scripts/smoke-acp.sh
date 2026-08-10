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
pnpm wanwu inspect | tee /tmp/wanwu-inspect.json | head -n 50
grep -q 'WANWU.md' /tmp/wanwu-inspect.json

echo "==> smoke-acp: mock ACP client integration"
pnpm --filter wanwu-code run test

if [[ -n "${WANWU_ACP_COMMAND:-}" ]]; then
  echo "==> smoke-acp: live backend via WANWU_ACP_COMMAND (timeout 2s)"
  set +e
  timeout 2 pnpm wanwu acp
  code=$?
  set -e
  echo "acp exit=$code"
else
  echo "==> smoke-acp: skipping external ACP stdio (set WANWU_ACP_COMMAND to enable)"
fi

echo "==> smoke-acp OK"