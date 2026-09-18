#!/usr/bin/env bash
# Compatibility wrapper — implementation is Node-only (Windows has no bash).
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/build-cli.mjs
