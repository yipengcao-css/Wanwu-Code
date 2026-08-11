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

> 私有仓库下 `irm https://raw.githubusercontent.com/... | iex` 会 **404**（无匿名 raw 访问）。  
> 公司演示请用离线包脚本：

```powershell
git lfs install
git clone https://github.com/yipengcao-css/Wanwu-Code.git
cd Wanwu-Code
git lfs pull
Set-ExecutionPolicy -Scope Process Bypass -Force
.\demo-dist\v1.0.0-beta\install-windows.ps1
```

仅 CLI（仓库内）：

```powershell
$env:WANWU_INSTALL_FROM="demo"   # 或 local（dist-bin）
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

## Desktop（Wanwu Shell 安装包）

```bash
pnpm shell:dist
# 产物在 apps/wanwu-shell/release/（已 gitignore）
```

| 平台 | 产物 |
|---|---|
| Linux | `Wanwu-Code-<ver>-linux-x64.AppImage`（另有 `.deb`） |
| Windows | `Wanwu-Code-<ver>-win-x64.zip`（解压后运行 `Wanwu Code.exe`） |
| macOS | `Wanwu-Code-<ver>-mac-x64.zip` / `…-mac-arm64.zip`（未签名） |

开发态：`pnpm shell:dev` / `pnpm shell`。

### macOS 备注

Linux 主机交叉产出的 mac zip **未签名**，Gatekeeper 可能拦截。在 Mac 上：

```bash
codesign --sign - -f "Wanwu Code.app"
xattr -cr "Wanwu Code.app"
```

### Windows 备注

当前默认产出 **zip 便携包**（本机 Linux 交叉构建 NSIS 依赖完整 wine 环境）。需要 `.exe` 安装器时请在 Windows 主机运行 `electron-builder --win nsis`。
