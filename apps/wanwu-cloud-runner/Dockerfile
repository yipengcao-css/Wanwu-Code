# Wanwu cloud runner — headless review-first agent in Docker
FROM node:20.18.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.33.3 --activate

WORKDIR /workspace

# Warm dependency layers (bind-mount overrides sources at runtime)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY extensions ./extensions
COPY examples ./examples
COPY scripts ./scripts
COPY tsconfig.base.json vitest.config.ts ./
COPY AGENTS.md WANWU.md README.md ./

RUN pnpm install --frozen-lockfile

COPY apps/wanwu-cloud-runner/scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]