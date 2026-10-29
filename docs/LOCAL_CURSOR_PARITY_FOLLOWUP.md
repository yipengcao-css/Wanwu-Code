# 本地 Cursor 对标后续计划（UI / Agent / Harness）

> 范围：**仅本地桌面 Shell、VS Code 扩展、wanwu-native ACP、harness 脚本**。  
> 明确排除：Cloud Agents、远程 VM、`docs/CLOUD.md`、云端计费/同步。  
> 基线：`docs/CURSOR_PARITY_2026-09-15.md`（历史审计）+ 文内「仍未做」+ 本文件自验缺口。

## 现状摘要（2026-10-29 · `cursor/ref-scm-628e`）

| 域 | 已接近 Cursor | 仍缺 / 半成品 |
|---|---|---|
| **UI（Shell）** | Agent Studio 流式、工具卡片、Diff 审阅、Plan「按此计划执行」、检查点撤销、@ 补全 | 工作流可视化（**本 PR**）、MCP prompts UI、自定义 Mode |
| **Agent（ACP）** | 工具面、lint 闭环、子代理、会话持久化 | `WorkflowMachine` 与 UI 同步（**本 PR**）、MCP **prompts** |
| **Harness** | `smoke-acp.sh`、`demo-e2e.sh`、handshake 脚本、bench | Shell↔ACP 无 Electron 的契约 smoke（**本 PR**）、扩展 `@vscode/test-electron` |

## 优先级（P0 → P2）

### P0 — 本 PR 已做

1. **工作流状态 ACP → Shell**：`session/update` 增加 `workflow_state`；Agent Studio **WorkflowRail**（探索→计划→执行→验证→完成）+ 空会话快捷入口。
2. **本地 harness**：`scripts/smoke-local-harness.sh` + `scripts/acp-workflow-native.mts`（无 API key 跑 Verify 模式并断言工作流通知）。

### P1 — 下一批（仍本地）

1. **扩展侧栏**：与 Shell 对齐 workflow 条 / token 用量（只读展示）。
2. **Apply 流**：多文件 diff 队列在扩展与 Shell 行为完全一致（拒绝无 diff 的占位项 — 已部分做，需 E2E 录屏验收）。
3. **Harness**：`examples/failing-test-demo` 走 Shell 驱动的一键脚本（Playwright 或 devtools 协议），仍不碰 cloud CI。

### P2 — 延后

1. MCP **prompts**（resources/tools 已有）。
2. `registry.wanwu.dev` 插件市场。
3. DAP / Bugbot / Cloud Agents（产品红线：不做）。

## 本 PR 刻意未改

- `packages/wanwu-cloud/*`、`apps/wanwu-cloud-runner/*`、CI 里 cloud runner 步骤（仅新增本地 smoke，不改 cloud 逻辑）。
- `docs/CLOUD.md` 及一切云端编排文档。

## 验证（维护者）

```bash
pnpm lint && pnpm typecheck && pnpm test
./scripts/smoke-local-harness.sh
./scripts/smoke-acp.sh
```

Shell 手动：打开 Agent Studio → 空会话点「运行 Verify」→ 顶栏 WorkflowRail 应进入「验证」并在结束后显示「完成/执行」。
