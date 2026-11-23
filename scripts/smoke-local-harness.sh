#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> smoke-local-harness: workflow + session log + ACP workflow notify"
pnpm exec vitest run packages/wanwu-workflow/src/modeSync.test.ts packages/wanwu-cli/src/native/workflowSession.test.ts
pnpm --filter wanwu-shell exec tsx src/renderer/agent/sessionLog.test.ts

echo "==> smoke-local-harness: native ACP workflow (verify mode, no API key)"
pnpm exec tsx scripts/acp-workflow-native.mts

echo "==> smoke-local-harness OK"
