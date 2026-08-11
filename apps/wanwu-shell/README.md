# Wanwu Shell（自研 Electron 桌面壳）

**品牌整机路径**（取代已退役的 Code-OSS `apps/wanwu-ide`）。

- Electron + React + Monaco + xterm  
- 视觉：Wanwu Lattice（见 `docs/DESIGN_SYSTEM.md`）  
- Agent：`wanwu-native` ACP（随包分发 `resources/wanwu-cli`，运行时不依赖 pnpm/tsx）  

## 开发

```bash
# 仓库根目录
pnpm install
# 若 pnpm 忽略了 electron / node-pty 的 install 脚本：
#   node node_modules/electron/install.js
<<<<<<< HEAD
# 首次会自动 pnpm build:cli → dist-bin/wanwu.mjs（ACP 后端）
=======
#   pnpm --filter wanwu-shell rebuild:native
>>>>>>> 5a30db1 (feat(shell): use node-pty and platform shell resolution)
pnpm --filter wanwu-shell dev
# 或
pnpm shell:dev
```

无显示器环境：

```bash
xvfb-run -a pnpm --filter wanwu-shell start
```

## 构建

```bash
pnpm --filter wanwu-shell build
pnpm --filter wanwu-shell start
```

## 布局

Orbit 顶栏 · 文件树 · Monaco 标签编辑器 · Agent Studio · 终端抽屉。  
**没有** VS Code Activity Bar / Workbench。

终端：`node-pty` 真 PTY；Windows 优先 `pwsh` / `powershell` / `cmd`，POSIX 用 `$SHELL`（不再写死 `/bin/bash`）。
