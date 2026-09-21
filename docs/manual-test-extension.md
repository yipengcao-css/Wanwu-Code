# Wanwu VS Code 扩展手工测试清单

## 准备

```bash
pnpm install
pnpm --filter wanwu-code run package
# 安装生成的 extensions/wanwu-vscode/wanwu-code-1.0.0-beta.vsix
# 或在仓库根目录用 VS Code/Cursor 打开后 F5 跑 Extension Development Host
```

默认对接真实 `wanwu acp`（`wanwu.useMockAcp=false`）。桌面整机请用 `pnpm shell:dev`（`apps/wanwu-shell`），不要跑已退役的 `apps/wanwu-ide`。

## 用例

1. **侧栏 Agent**
   - Activity Bar 打开 Wanwu 视图
   - 发送 “hello” → 出现回复与 tool timeline

2. **Plan 模式**
   - Mode=Plan，发送“修复 failing-test-demo”
   - 期望：回复带 `[MODE=plan]` 语义；不直接改仓库文件
   - 另开终端：`pnpm wanwu plan -p "..."` 应生成 `.wanwu/plans/*.plan.md`

3. **权限弹窗**
   - 在 Chat 发送包含 `[SIMULATE_DANGEROUS]` 的消息
   - 期望：弹出 Allow once / Allow session / Deny
   - 选 Deny → 回复包含 `Blocked by permission`

4. **停止 / 恢复**
   - 命令面板：`Wanwu: Cancel` 中止进行中的回合
   - `Wanwu: Resume Session` 从 `.wanwu/sessions/` 恢复

5. **Doctor / Verify**
   - `Wanwu: Doctor` → 信息框显示 active provider
   - `Wanwu: Run Verify` → 终端执行 `pnpm wanwu verify`

6. **Mock（仅开发冒烟）**
   - 设置 `wanwu.useMockAcp=true` 可走 mock ACP
   - `Wanwu: Demo Diff Review` 仅用于开发演示
