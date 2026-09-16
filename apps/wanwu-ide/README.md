# apps/wanwu-ide — Wanwu Code（Electron IDE 壳）

轻量 **Electron + React + Monaco** 整机壳，目标是把 `wanwu` Agent（ACP）、编辑器、终端整合成可安装、可跨平台运行的产品外形。

> 说明：这是相对 Code-OSS fork 更轻的整机路线（本目录同时保留了 `product.json` 与 Code-OSS fork 脚本作为后续可选方案）。当前 MVP 以本 Electron 壳为准。

## 能力（本期）

- 文件树：懒加载、含 dotfiles / `.wanwu` / `.git`（不再隐藏）、新建 / 重命名 / 删除
- 编辑器：Monaco，多标签，`Ctrl/Cmd+S` 保存（UTF-8，二进制文件识别）
- 终端：`xterm.js` + `node-pty` 真 PTY；跨平台 shell 解析（Windows `pwsh`/`powershell`/`cmd`，POSIX `$SHELL` 回退）
- Agent 面板：Ask / Plan / Agent / Verify 模式；对话流 + 工具时间线
- ACP：内置后端（mock / `wanwu` CLI 桥接 grok），用 Electron 作 Node 运行，**不依赖 pnpm/tsx**
- 权限确认弹窗；Diff 评审弹窗（接受后才写盘）
- 全局文本搜索；Git 状态视图
- 文件监听：磁盘变更自动刷新

## P0 修复对应

- **ACP 后端打包**：`scripts/bundle-backend.mjs` 用 esbuild 把 CLI + mock 打成单文件到 `resources/`，`electron-builder` 以 `extraResources` 内置为 `resources/backend`；运行时以 `process.execPath + ELECTRON_RUN_AS_NODE` 启动 —— 见 `src/main/acp/resolveBackend.ts`。
- **Windows 终端 + 真 PTY**：`src/main/terminal.ts` 的 `resolveShell()` 不再写死 `/bin/bash`，并用 `node-pty` 提供交互式 PTY。
- **切换工作区重建 ACP**：`src/main/acp/manager.ts` 的 `restartForWorkspace()` 销毁旧后端并按新 cwd 重建 `session`（非单例）。

## 开发

```bash
pnpm --filter @wanwu/ide install        # 首次会 rebuild node-pty (electron ABI)
pnpm --filter @wanwu/ide rebuild:native # 如 node-pty 未匹配 Electron ABI 时手动重建
pnpm --filter @wanwu/ide dev            # electron-vite 开发模式（含后端打包）
pnpm --filter @wanwu/ide build          # 产出 out/
pnpm --filter @wanwu/ide package:linux  # electron-builder --linux dir
```

首次运行若无外部模型：Agent 面板默认使用内置 **mock ACP**，可切到 `wanwu CLI (grok)` 后端（需本机安装 grok 或设置 `WANWU_ACP_COMMAND`）。

## 目录

```
src/main       # 主进程：窗口 / IPC / 工作区&fs / node-pty 终端 / ACP 管理
src/preload    # contextBridge 安全 API
src/renderer   # React UI：文件树 / 编辑器 / 终端 / Agent 面板 / 弹窗
src/shared     # 主/预加载/渲染共享的 IPC 契约与 API 类型
scripts        # bundle-backend.mjs（后端打包）+ Code-OSS fork 脚本（可选）
resources      # 生成的后端 bundle（gitignore）
```
