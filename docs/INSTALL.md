# 安装 Wanwu CLI

版本资产命名：`wanwu-<version>-<os>-<arch>`（另附通用 `wanwu-<version>.mjs`）。

## 一键安装（推荐）

### Linux / macOS

```bash
# 从 GitHub Release 安装（需已发布对应 tag）
curl -fsSL https://raw.githubusercontent.com/yipengcao-css/Wanwu-Code/main/scripts/install.sh | bash

# 或克隆仓库后从本地 dist-bin 安装
pnpm build:cli:native
WANWU_INSTALL_FROM=local bash scripts/install.sh
export PATH="$HOME/.wanwu/bin:$PATH"
wanwu doctor
```

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `WANWU_INSTALL_VERSION` | `1.0.0-beta` | 版本号（不含 `v` 前缀） |
| `WANWU_INSTALL_DIR` | `~/.wanwu/bin` | 安装目录 |
| `WANWU_INSTALL_FROM` | `release` | `release` 或 `local` |
| `WANWU_INSTALL_REPO` | `yipengcao-css/Wanwu-Code` | GitHub 仓库 |

### Windows（PowerShell）

```powershell
# Release
irm https://raw.githubusercontent.com/yipengcao-css/Wanwu-Code/main/scripts/install.ps1 | iex

# 本地
$env:WANWU_INSTALL_FROM="local"
.\scripts\install.ps1
```

将安装目录加入用户 PATH 后执行 `wanwu doctor`。

## 开发态（无需安装）

```bash
pnpm install
pnpm wanwu doctor
pnpm build:cli          # dist-bin/wanwu.mjs
pnpm build:cli:native   # linux / macos / win 二进制 + SHA256SUMS
```

## 产物清单

`pnpm build:cli:native` 生成：

- `wanwu-<ver>.mjs` — Node 单文件（需系统 Node ≥20）
- `wanwu-<ver>-linux-x64`
- `wanwu-<ver>-macos-x64`
- `wanwu-<ver>-macos-arm64`（在 Linux 交叉编译时可能需在 Mac 上 `codesign --sign -`）
- `wanwu-<ver>-win-x64.exe`
- `SHA256SUMS`

## IDE 安装包

自研 Electron 壳见 `apps/wanwu-shell`（`pnpm shell`）。完整桌面安装包（dmg/msi）属后续评估，不在本发行矩阵硬验收内。

## macOS 备注

未签名的 macOS 二进制可能被 Gatekeeper 拦截。分发前请在 macOS 上执行：

```bash
codesign --sign - wanwu-*-macos-*
```
