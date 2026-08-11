# Wanwu Cloud（本地 headless 编排）

Review-first：任务在独立 git worktree 中运行，**永不自动 merge**。

## 单任务

```bash
pnpm wanwu cloud submit -p "修复 failing test" --run
pnpm wanwu cloud list
pnpm wanwu cloud diff <taskId>
```

Docker（可选）：

```bash
pnpm wanwu cloud submit -p "..." --docker
```

## 多任务编排（E2-D）

```bash
pnpm wanwu cloud orchestrate \
  -p "任务 A：写计划" \
  -p "任务 B：写计划" \
  --concurrency 2 \
  --pr-dry-run
```

- 每个 prompt → 独立 `wanwu/cloud-<taskId>` 分支与 `.wanwu/worktrees/<taskId>`
- 产物：`.wanwu/cloud-tasks/<taskId>/review.diff` + `runner.log`
- `--pr-dry-run`：只写 `pr-draft.md`（推荐默认）
- `--pr`：`git push` + `gh pr create --draft`（需远端权限；**仍不 merge**）

单独开 PR：

```bash
pnpm wanwu cloud open-pr <taskId> --dry-run
# 或真实 draft：
# pnpm wanwu cloud open-pr <taskId>
```

## 环境变量

| Env | 说明 |
|---|---|
| `WANWU_CLOUD_OPEN_PR=1` | orchestrate 默认尝试开 PR |
| `WANWU_CLOUD_PR_DRY_RUN=1` | 强制只写 draft 文件 |
| `WANWU_CLOUD_BASE_BRANCH` | PR base（默认探测 `origin/HEAD` → `main`） |

## 清理

```bash
pnpm wanwu cloud cleanup          # 移除 worktree/分支
pnpm wanwu cloud cleanup --purge  # 同时删除 task 记录
```
