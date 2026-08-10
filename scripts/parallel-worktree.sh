#!/usr/bin/env bash
# Phase 5 stub: create an isolated git worktree for a parallel agent session.
set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:-agent-$(date +%s)}"
branch="wanwu/${name}"
dir="../Wanwu-Code-${name}"

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "branch exists: ${branch}" >&2
  exit 1
fi

git worktree add -b "$branch" "$dir"
echo "created worktree: $dir (branch $branch)"
echo "run agents inside the worktree to avoid file collisions"
echo "cleanup: git worktree remove $dir && git branch -D $branch"