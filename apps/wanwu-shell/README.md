# Wanwu Shell（自研 Electron 桌面壳）

**品牌整机路径**（取代已退役的 Code-OSS `apps/wanwu-ide`）。

- Electron + React + Monaco + xterm  
- 视觉：Wanwu Lattice（见 `docs/DESIGN_SYSTEM.md`）  
- Agent：`wanwu-native` ACP  

## 开发

```bash
# 仓库根目录
pnpm install
# 若 pnpm 忽略了 electron 的 install 脚本，需手动拉取二进制：
#   node node_modules/electron/install.js
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
