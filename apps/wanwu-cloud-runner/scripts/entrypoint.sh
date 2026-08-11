#!/usr/bin/env bash
set -euo pipefail
cd /workspace

# Stock node slim image may lack git/pnpm
if ! command -v git >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq git ca-certificates >/dev/null
fi

git config --global --add safe.directory /workspace || true
git config --global user.email "wanwu-cloud@example.com" || true
git config --global user.name "Wanwu Cloud Runner" || true

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@10.33.3 --activate
fi

if [[ ! -d node_modules/.pnpm ]]; then
  pnpm install --frozen-lockfile
fi

if [[ -n "${WANWU_CLOUD_TASK_ID:-}" ]]; then
  echo "[wanwu-cloud-runner] running task id=${WANWU_CLOUD_TASK_ID}"
  pnpm wanwu cloud run "$WANWU_CLOUD_TASK_ID"
elif [[ -n "${WANWU_CLOUD_PROMPT:-}" ]]; then
  echo "[wanwu-cloud-runner] submit+run prompt=${WANWU_CLOUD_PROMPT}"
  pnpm wanwu cloud submit -p "$WANWU_CLOUD_PROMPT" --run
else
  echo "Set WANWU_CLOUD_TASK_ID or WANWU_CLOUD_PROMPT" >&2
  exit 2
fi

echo "[wanwu-cloud-runner] done"