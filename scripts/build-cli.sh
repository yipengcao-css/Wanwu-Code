#!/usr/bin/env bash
# Bundle a single-file Node CLI entry for local install / CI artifact.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist-bin
pnpm exec esbuild packages/wanwu-cli/src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile=dist-bin/wanwu.body.mjs \
  --packages=bundle
# Ensure a single leading shebang (source file also has one; Node ESM allows only one).
{
  printf '%s\n' '#!/usr/bin/env node'
  sed '1{/^#!/d;}' dist-bin/wanwu.body.mjs
} > dist-bin/wanwu.mjs
chmod +x dist-bin/wanwu.mjs
rm -f dist-bin/wanwu.body.mjs
echo "built dist-bin/wanwu.mjs"
./dist-bin/wanwu.mjs help | head -n 8