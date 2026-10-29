# 本地 Cursor 对标后续计划（UI / Agent / Harness）

> 范围：**仅本地桌面 Shell、VS Code 扩展、wanwu-native ACP、harness 脚本**。  
> 明确排除：Cloud Agents、远程 VM、`docs/CLOUD.md`、云端计费/同步。  
> 基线：`docs/CURSOR_PARITY_2026-09-15.md`（历史审计）+ 文内「仍未做」+ 本文件自验缺口。

## 现状摘要（2026-10-29 · `cursor/ref-scm-628e`）

| 域 | 已接近 Cursor | 仍缺 / 半成品 |
|---|---|---|
| **UI（Shell）** | Agent Studio 流式、工具卡片、Diff 审阅、Plan「按此计划执行」、WorkflowRail | MCP prompts UI、自定义 Mode |
| **UI（扩展）** | 侧栏 ACP、Diff 审阅、会话恢复 | ~~workflow / token~~ → **P1 已做** |
| **Agent（ACP）** | 工具面、lint 闭环、子代理、`workflow_state` 推送 | MCP **prompts** |
| **Harness** | smoke-acp、demo-e2e、smoke-local-harness | Shell Playwright E2E（P2） |

## 优先级（P0 → P2）

### P0 — 已完成

1. **工作流状态 ACP → Shell**：`session/update` → `workflow_state`；Agent Studio **WorkflowRail** + 空会话快捷入口。
2. **本地 harness**：`scripts/smoke-local-harness.sh` + `scripts/acp-workflow-native.mts`。

### P1 — 已完成（2026-10-29 跟进）

1. **扩展侧栏**：WorkflowRail（只读）+ 回合 **token in/out** 展示；ACP `workflow` / `thought` 事件接线。
2. **Apply 流**：扩展 **DiffReviewQueue** 串行多文件队列，跳过 `before === after`（与 Shell `App.tsx` 一致）。
3. **Harness**：[`scripts/demo-failing-test-local.sh`](../scripts/demo-failing-test-local.sh) — failing-test-demo + plan + 临时修复 + verify + smoke-local-harness。

### P2 — 延后

1. MCP **prompts**（resources/tools 已有）。
2. 插件注册表 `registry.wanwu.dev`。
3. Shell 驱动 failing-test-demo 的 GUI E2E（Playwright / devtools）。
4. DAP / Bugbot / Cloud Agents（产品红线：不做）。

## 本 PR 刻意未改

- `packages/wanwu-cloud/*`、`apps/wanwu-cloud-runner/*`、CI 里 cloud runner 步骤。
- `docs/CLOUD.md` 及一切云端编排文档。

## 验证（维护者）

```bash
pnpm lint && pnpm typecheck && pnpm test
./scripts/smoke-local-harness.sh
./scripts/demo-failing-test-local.sh
./scripts/smoke-acp.sh
```

Shell 手动：Agent Studio 空会话 →「运行 Verify」→ WorkflowRail。  
扩展手动：Activity Bar → Wanwu Agent → 发 Verify 模式消息 → 顶栏 workflow 与 token 只读更新。
