# 产品缺陷与改进对照（2026-08-12）

> 范围：当前仓库代码 + 文档；对照 **Kimi Code CLI**（Moonshot，2026-06+）公开能力。
> 结论：**Wanwu-Code 是“能跑通的 beta 骨架”，不是 Kimi 级成品 Agent**。差距主要在 Agent 质量、安全执行、会话/工具生态、文档一致性。

---

## 0. 现状速览（诚实版）

| 面 | 现状 |
|---|---|
| CLI | `wanwu doctor/inspect/acp/exec/plan/verify/check-perm/hooks/cloud/parallel` |
| Agent | 默认 `wanwu-native` ACP；无 key 时走确定性启发式（demo 向）；有 key 走 OpenAI-compat 多轮工具 |
| 工具 | Read / Glob / Grep / Edit / Bash；MCP/LSP 在 **PR #9 / #10**（未合入本分支） |
| 桌面 | `apps/wanwu-shell`：Monaco + xterm + ACP chat + Diff modal |
| 扩展 | VS Code ACP client，但 `wanwu.useMockAcp` 默认 `true` |
| 安全 | 路径白名单 + 正则 deny；**无 OS sandbox**；native 不发权限请求 |
| 分发 | CLI 矩阵 + VSIX；mac 签名/公证门控在 **PR #11** |

---

## 1. 对照 Kimi Code 的差距

| Kimi Code 能力 | Wanwu 现状 | 差距 |
|---|---|---|
| 单二进制、开箱即用 | 有 `build:cli:native`，但桌面/CLI 仍偏工程化 | 安装与首启体验未打磨 |
| 打磨过的 TUI | **无 TUI**；CLI 为一次性/ACP | 缺主力交互入口 |
| 内建子代理（coder/explore/plan） | 无子代理；`parallel` 只是 worktree 脚本 | 缺并行/隔离上下文 |
| `/mcp-config` 对话式配置 MCP | MCP 刚在 PR #9 起步（手写 stdio client） | 生态与易用性差 |
| 权限审批（read-only 自动放行，写/执行需确认） | 正则 deny + mode；**native ACP 不发 `session/request_permission`** | 安全模型未闭环 |
| 生命周期 hooks（可带工具上下文） | hooks 只收 `WANWU_HOOK_EVENT`，无 tool/args | 门禁能力弱 |
| 视频/多模态输入 | 无 | 远期 |
| 插件/技能市场 | skills 仅 `inspect` 发现，**不加载进 Agent** | 生态空转 |
| ACP 接入 Zed/JetBrains/VS Code | 自研 Shell + VS Code 扩展（mock 默认） | 宿主覆盖与真实联调不足 |
| 后台任务 / shell mode | 无 | 长任务体验缺失 |

---

## 2. 关键产品缺陷（按严重度）

### P0 — 安全与正确性

1. **Edit 先写盘后 Diff Review**
   - `packages/wanwu-cli/src/native/toolDispatch.ts`：`toolEdit(..., { apply: true })`
   - `apps/wanwu-shell/src/renderer/app/App.tsx`：`onAccept` 再 `fs.write`，`onReject` 不回滚
   - 结果：UI 审阅形同虚设。

2. **Plan/Ask 模式 Bash 拦截为空**
   - `toolDispatch.ts` 中 `if (writeBlocked && !readonly) { /* 空 */ }` 后直接 `toolBash`
   - 结果：声明的模式约束不生效。

3. **sandbox 配置只报告不执行**
   - `config.sandbox = off|workspace|strict` 仅出现在 doctor/inspect；Bash 用 `spawnSync(..., { shell: true, env: process.env })`
   - 结果：密钥可被 Bash 子进程继承/外泄。

4. **deny 规则是脆弱正则**
   - `permission.ts` 可被编码/变体绕过；`assessToolCall` 未接入 `dispatchTool`。

5. **路径沙箱未 realpath 校验**
   - `workspacePaths.ts` 先 `resolve` 再 `relative`，符号链接可逃逸。

### P1 — Agent 质量

6. **无 key 时是 demo 级启发式**
   - `agentLoop.ts` 硬编码 `examples/failing-test-demo/src/sum.js`；Plan 是模板 markdown（`plan.ts`）。

7. **Anthropic 路径不支持 tools**
   - `packages/wanwu-providers/src/anthropic.ts` 未传 `tools` / 不处理 `tool_use`。

8. **Verify 不是隔离子代理**
   - `verify.ts` 直接 `spawnSync pnpm typecheck/test/lint`；`WorkflowMachine` 仅状态打印。

9. **skills 不进上下文**
   - `.wanwu/skills` 只被 `inspect` 列出。

10. **`session/cancel` 是 no-op**
    - `acpServer.ts` 收到 cancel 只回 `{}`。

### P2 — 体验与生态

11. **无 TUI**，CLI 交互弱。
12. **VS Code 扩展默认 mock**，真实 ACP 未成为默认路径。
13. **hooks 无工具参数**，无法做细粒度门禁。
14. **多会话/取消/竞态** 在 Shell 侧较薄。
15. **Cloud** 是本地 worktree + 可选 Docker，非真正异步云。

### P3 — 文档与叙事

16. **核心文档过期**
    - `docs/PLAN.md` 仍写“几乎空仓”“Code-OSS Phase 6”
    - `WANWU.md` 仍写“扩展优先 / acp_backend=grok”
    - `docs/ROADMAP.md` Post-1.0 顺序与 `EPIC2_BACKLOG.md` 不一致
    - ADR 0001/0002 未标注被 ADR 0005 部分取代

17. **README/架构宣称 MCP/Sandbox**，代码尚未对齐（MCP/LSP 在 PR 中）。

---

## 3. 改进措施（建议顺序）

| 优先级 | 措施 | 落点 |
|---|---|---|
| P0 | Edit 改为 **propose-then-apply**：native 返回 diff，Shell 接受后才落盘；拒绝即无变更 | `toolDispatch.ts` / `acpServer.ts` / `DiffReview.tsx` |
| P0 | 修复 Plan/Ask 的 Bash 空拦截；接入 `assessToolCall`；deny 表外默认 ask | `toolDispatch.ts` / `permission.ts` |
| P0 | Bash 默认 **最小 env**（剥离 `*_API_KEY` 等），提供 `WANWU_BASH_ENV=full` 开关 | `tools.ts` |
| P0 | `assertInsideWorkspace` 增加 `realpath` 校验 | `workspacePaths.ts` |
| P1 | native ACP 实现 `session/request_permission`，Shell 弹窗真正门控 Bash/Edit | `acpServer.ts` / `ipc/acp.ts` |
| P1 | Anthropic provider 支持 tool_use / tool_result | `packages/wanwu-providers/src/anthropic.ts` |
| P1 | Plan 由 LLM 生成（非模板）；Verify 作为独立 reviewer 子流程 | `plan.ts` / `verify.ts` |
| P1 | 加载 `.wanwu/skills` 进系统提示或工具描述 | `llmAgentLoop.ts` / `agentLoop.ts` |
| P2 | 增加最小 TUI（或明确 CLI 定位 headless/ACP） | `packages/wanwu-cli` |
| P2 | 扩展默认关 mock，接真实 `wanwu acp` | `extensions/wanwu-vscode` |
| P2 | hooks 注入 `WANWU_TOOL_NAME` / `WANWU_TOOL_ARGS` | `hooks.ts` / `toolDispatch.ts` |
| P3 | 刷新 `PLAN.md` / `WANWU.md` / `ROADMAP.md` / ADR 0001-0002 状态 | `docs/` |
| P3 | 合入 MCP #9、LSP #10、签名 #11 后更新 README 能力表 | 仓库根 |

---

## 4. 已做对的（保持）

- 品牌壳 + Monaco + ACP 分层清晰（ADR 0005）
- 密钥走 `~/.wanwu/credentials.env`（0600），不进仓库
- 随包 ACP（`resources/wanwu-cli`），不依赖 pnpm/tsx
- CI 意图完整；签名/公证密钥门控设计正确（PR #11）

---

## 5. 下一步建议

1. 先合入 #9（MCP）、#10（LSP）、#11（签名）
2. 立即做 **P0 安全四项**（Edit 落盘顺序、Bash 拦截、env 最小化、realpath）
3. 再做 **P1 Agent 质量**（权限 RPC、Anthropic tools、真 Plan/Verify）
4. 最后统一文档叙事，避免“宣称 > 实现”
