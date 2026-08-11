# Wanwu VS Code 扩展手工测试清单

## 准备

```bash
pnpm install
pnpm --filter wanwu-code run package
# 安装生成的 extensions/wanwu-vscode/wanwu-code-1.0.0-beta.vsix
# 或在仓库根目录用 VS Code/Cursor 打开后 F5 跑 Extension Development Host
# GUI 长录屏（本环境产物示例）：
#   /opt/cursor/artifacts/wanwu-ide-walkthrough.mp4
#   /opt/cursor/artifacts/wanwu-ide-walkthrough-demo.mp4
```

### GUI 长录屏复现

```bash
# 需 DISPLAY 或 xvfb
bash apps/wanwu-ide/scripts/launch.sh /workspace/examples/failing-test-demo --disable-gpu --disable-workspace-trust
# 另开终端录制 ≥30s，例如：
# ffmpeg -y -f x11grab -video_size 1920x1080 -i "$DISPLAY" -t 40 /tmp/wanwu-ide-walkthrough.mp4
```

确保设置 `wanwu.useMockAcp` 为 `true`（默认），除非已安装 `grok`。

## 用例

1. **New Chat**
   - 命令面板：`Wanwu: New Chat`
   - 发送 “hello” → 出现 mock 回复与 tool timeline（Bash/Read）

2. **Plan 模式**
   - Mode=Plan，发送“修复 failing-test-demo”
   - 期望：回复带 `[MODE=plan]` 语义；不直接改仓库文件
   - 另开终端：`pnpm wanwu plan -p "..."` 应生成 `.wanwu/plans/*.plan.md`

3. **权限弹窗**
   - 在 Chat 发送包含 `[SIMULATE_DANGEROUS]` 的消息
   - 期望：弹出 Allow once / Allow session / Deny
   - 选 Deny → 回复包含 `Blocked by permission`

4. **Diff Review Demo**
   - `Wanwu: Demo Diff Review` → Accept/Reject 可选

5. **Doctor / Verify**
   - `Wanwu: Doctor` → 信息框显示 active provider，终端跑 doctor
   - `Wanwu: Run Verify` → 终端执行 `pnwu wanwu verify`（应为绿）

6. **真实 Grok（可选）**
   - 安装 Grok Build，设置 `wanwu.useMockAcp=false`
   - New Chat 应拉起 `wanwu acp` → `grok acp`
