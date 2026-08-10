# Wanwu Code — VS Code Extension

MVP 脸面：作为 **ACP Client** 连接 `wanwu acp`（可桥接开源 Grok Build ACP）。

## 当前状态

Phase 1 骨架：命令已注册（`Wanwu: New Chat` / `Doctor` / `Plan` / `Verify`），UI 与 ACP 进程管理在 Phase 3 实现。

## 开发

```bash
pnpm install
pnpm --filter @wanwu/vscode run typecheck
```

## 设计

见仓库根目录 `docs/ARCHITECTURE.md` 与 `docs/ACP_INTEGRATION.md`。
