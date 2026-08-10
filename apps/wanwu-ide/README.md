# Wanwu IDE（Code-OSS shell）

Phase 6：基于 Microsoft Code-OSS 的品牌化 IDE 整机。

## 策略

1. **不维护完整 fork 历史**：用脚本浅克隆指定 tag，再打 patch  
2. **预装** `extensions/wanwu-vscode`（开发期可用 `pnpm package:extension` 产物）  
3. **品牌**：产品名 Wanwu Code、默认布局偏 Agent + Diff + Terminal  
4. MVP 仍以扩展优先；本目录是整机发行路径

## 本机构建

依赖：Node **20.18.x**、Python3、`build-essential`、`libkrb5-dev`、约 10GB+ 磁盘；无显示器时需 `xvfb`。

```bash
# 一键（会下载 vscode tag 并 compile）
./apps/wanwu-ide/scripts/bootstrap-and-compile.sh

# 启动（有 DISPLAY 或自动 xvfb-run）
./apps/wanwu-ide/scripts/launch.sh

# 仅校验树完整性
./apps/wanwu-ide/scripts/smoke-ide-tree.sh
```

已在云环境验证：`product.nameLong=Wanwu Code`、Electron 二进制名为 `wanwu-code`、`npm run compile` 0 errors、内置 `extensions/wanwu-code`。

> CI 默认仍不拉取 Code-OSS；本地/云 agent 需显式 `WANWU_FETCH_CODE_OSS=1`。

## 文件

| 路径 | 说明 |
|---|---|
| `product.json` | 品牌覆盖模板 |
| `scripts/fetch-code-oss.sh` | 浅克隆 vscode 指定 tag → `code-oss/` |
| `scripts/apply-branding.sh` | 合并 product 字段 |
| `scripts/install-wanwu-extension.sh` | 拷贝/链接 Wanwu VSIX 为内置扩展 |
| `patches/` | 额外 diff（可选） |

`code-oss/` 已加入 `.gitignore`，不会提交上游源码树。
