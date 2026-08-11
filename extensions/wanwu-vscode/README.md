# Wanwu Code — VS Code Extension

MVP 脸面：作为 **ACP Client** 连接 `wanwu acp`（可桥接开源 Grok Build ACP）。

## 当前状态

Phase 3 初版：

- `Wanwu: New Chat` 打开 Webview，支持 Ask / Plan / Agent / Verify
- 内置 ACP Client（JSON-RPC over stdio）
- 默认 `wanwu.useMockAcp=true`，对接 `packages/wanwu-cli` 的 mock ACP
- 安装 grok 后可关闭 mock，走 `wanwu acp` → Grok Build 桥接

## 开发

```bash
pnpm install
pnpm --filter @wanwu/vscode run typecheck
pnpm --filter @wanwu/vscode run test
```

在 VS Code / Cursor 中：打开本仓库 → 运行扩展（F5 或安装开发版）→ 命令面板执行 `Wanwu: New Chat`。

## 设计

见仓库根目录 `docs/ARCHITECTURE.md` 与 `docs/ACP_INTEGRATION.md`。
