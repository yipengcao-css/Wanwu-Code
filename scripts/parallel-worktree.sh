#!/usr/bin/env bash
# Create or demo isolated git worktrees for parallel Wanwu agents.
set -euo pipefail
cd "$(dirname "$0")/.."

cmd="${1:-demo}"
case "$cmd" in
  demo)
    pnpm wanwu parallel demo --cleanup
    ;;
  create)
    name="${2:-agent-$(date +%s)}"
    branch="wanwu/${name}"
    dir=".wanwu/worktrees/${name}"
    mkdir -p .wanwu/worktrees
    if git show-ref --verify --quiet "refs/heads/${branch}"; then
      echo "branch exists: ${branch}" >&2
      exit 1
    fi
    git worktree add -b "$branch" "$dir"
    echo "created worktree: $dir (branch $branch)"
    echo "cleanup: git worktree remove $dir && git branch -D $branch"
    ;;
  *)
    echo "usage: $0 [demo|create <name>]" >&2
    exit 2
    ;;
esac