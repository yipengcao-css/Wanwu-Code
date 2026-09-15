# Wanwu Code — VS Code Extension

MVP 脸面：作为 **ACP Client** 连接 `wanwu acp`（可桥接开源 Grok Build ACP）。

## 当前状态

- `Wanwu: New Chat` 打开 Webview，支持 Ask / Plan / Agent / Verify，多会话
- 内置 ACP Client（JSON-RPC over stdio），支持 `session/load` / `session/cancel`
- **默认对接真实 `wanwu acp`**（`wanwu.useMockAcp` 默认 `false`；mock 仅供开发冒烟）
- Quick Fix「用 Wanwu 修复」：诊断（文件/行号/消息）自动带入 Agent 会话并发起修复
- Diff 审阅：`vscode.diff` 内联视图 + WorkspaceEdit 落盘

## 开发

```bash
pnpm install
pnpm --filter @wanwu/vscode run typecheck
pnpm --filter @wanwu/vscode run test
```

在 VS Code / Cursor 中：打开本仓库 → 运行扩展（F5 或安装开发版）→ 命令面板执行 `Wanwu: New Chat`。

## 设计

见仓库根目录 `docs/ARCHITECTURE.md` 与 `docs/ACP_INTEGRATION.md`。
