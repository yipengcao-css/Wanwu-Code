# Wanwu Cloud Runner (Docker)

把与本地 `wanwu cloud submit --run` 相同的 **review-first** headless 工作流跑进容器。

## 构建 / 运行

```bash
# 从仓库根目录
pnpm wanwu cloud submit -p "在容器里跑异步任务" --docker

# 或手动
docker build -f apps/wanwu-cloud-runner/Dockerfile -t wanwu-cloud-runner:local .
WANWU_CLOUD_PROMPT="fix demo" docker compose -f apps/wanwu-cloud-runner/docker-compose.yml run --rm wanwu-cloud-runner
```

## 行为

- 容器内执行 `wanwu cloud submit --run`
- 在 git worktree 中写 review artifact，**不 merge 到主分支**
- 任务状态/diff 落在宿主机 `.wanwu/cloud-tasks/`（bind mount）

## 依赖

- Docker Engine
- 首次 build 会 `pnpm install`（需网络）

## Nested overlay / CI

部分 Cloud VM（嵌套 overlay）上 `docker run` 会失败。默认行为是**回退本地 worktree runner**，并在 `docker-runner.log` 写入：

```text
[fallback] docker run failed on nested overlay; using local worktree runner
```

若要**禁止回退**（例如 GitHub Actions 纯 Docker 验收）：

```bash
WANWU_DOCKER_REQUIRE=1 pnpm wanwu cloud submit -p "must use real docker" --docker
```

权威纯 Docker 验收在 CI job `docker-cloud`（`ubuntu-latest`），不依赖本机嵌套环境。
