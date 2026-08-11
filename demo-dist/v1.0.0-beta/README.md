# Wanwu-Code 公司演示包（v1.0.0-beta）

本目录为**离线/跨机器演示分发包**，包含 Desktop IDE、CLI 与 VS Code 扩展。

> 大文件通过 **Git LFS** 存储。克隆后请确保已安装 Git LFS：  
> `git lfs install && git lfs pull`

## 目录结构

```
demo-dist/v1.0.0-beta/
  README.md                 ← 本说明
  COMPONENTS.md             ← 组件清单与校验
  desktop/                  ← 桌面 IDE 安装包
  cli/                      ← 命令行 wanwu
  extension/                ← VS Code / Cursor 扩展 VSIX
  docs/                     ← INSTALL / PROVIDERS / CLOUD 文档副本
```

## Windows 一键安装（推荐）

> ⚠️ **不要**再使用（私有仓库会 404）：  
> `irm https://raw.githubusercontent.com/.../install.ps1 | iex`

请先克隆并拉取 LFS，再在本目录执行离线脚本：

```powershell
# 1) 安装 Git LFS 后克隆
git lfs install
git clone https://github.com/yipengcao-css/Wanwu-Code.git
cd Wanwu-Code
git lfs pull

# 2) 安装 Desktop + CLI（可改路径）
Set-ExecutionPolicy -Scope Process Bypass -Force
cd demo-dist\v1.0.0-beta
.\install-windows.ps1
# 或指定目录：
# .\install-windows.ps1 -InstallDir "$env:USERPROFILE\WanwuCode"
```

然后**新开** PowerShell：`wanwu doctor`，并用开始菜单/快捷方式打开 `Wanwu Code`。

## 快速安装（按平台）

### 1) Desktop IDE（推荐演示主界面）

| 系统 | 文件 | 用法 |
|---|---|---|
| Linux | `desktop/Wanwu-Code-1.0.0-beta-linux-x64.AppImage` | `chmod +x …AppImage && ./…AppImage` |
| Windows | `desktop/Wanwu-Code-1.0.0-beta-win-x64.zip` | 优先用上面的 `install-windows.ps1`；或手动解压运行 `Wanwu Code.exe` |
| macOS Intel | `desktop/Wanwu-Code-1.0.0-beta-mac-x64.zip` | 解压后打开 `.app`（需解除隔离/签名，见下） |
| macOS Apple Silicon | `desktop/Wanwu-Code-1.0.0-beta-mac-arm64.zip` | 同上 |

**macOS 首次打开：**

```bash
xattr -cr "Wanwu Code.app"
codesign --sign - -f "Wanwu Code.app"   # 可选 ad-hoc 签名
open "Wanwu Code.app"
```

### 2) CLI（`wanwu`）

| 系统 | 文件 |
|---|---|
| Linux | `cli/wanwu-1.0.0-beta-linux-x64` |
| macOS Intel | `cli/wanwu-1.0.0-beta-macos-x64` |
| macOS ARM | `cli/wanwu-1.0.0-beta-macos-arm64` |
| Windows | `cli/wanwu-1.0.0-beta-win-x64.exe` |
| 通用 Node | `cli/wanwu-1.0.0-beta.mjs`（需 Node ≥20：`node wanwu-….mjs doctor`） |

```bash
# Linux 示例
chmod +x cli/wanwu-1.0.0-beta-linux-x64
sudo cp cli/wanwu-1.0.0-beta-linux-x64 /usr/local/bin/wanwu
wanwu doctor
```

多模型演示（OpenAI 兼容代理，如 DeepSeek / Moonshot）：

```bash
export OPENAI_API_KEY="你的密钥"
export OPENAI_BASE_URL="https://api.deepseek.com"   # 或 https://api.moonshot.cn/v1
export WANWU_MODEL="deepseek-chat"                  # Moonshot 可用 moonshot-v1-8k
wanwu exec -p "只回复一个词：pong"
```

### 3) VS Code / Cursor 扩展

安装 `extension/wanwu-code-1.0.0-beta.vsix`：

- VS Code：扩展视图 → `…` → Install from VSIX  
- 或：`code --install-extension extension/wanwu-code-1.0.0-beta.vsix`

## 建议演示剧本（10 分钟）

1. 打开 Desktop，加载示例工程 `examples/failing-test-demo`（需另备仓库 clone）  
2. `Ctrl/Cmd+I` 打开 Agent Studio，Ask/Plan/Agent 切换  
3. CLI：`wanwu doctor` → `wanwu exec -p "用工具读取 README 并给出标题"`  
4. （可选）`wanwu cloud orchestrate -p "A" -p "B" --concurrency 2 --pr-dry-run`

## 校验

各子目录有 `SHA256SUMS`：

```bash
cd desktop && sha256sum -c SHA256SUMS
cd ../cli && sha256sum -c SHA256SUMS
cd ../extension && sha256sum -c SHA256SUMS
```

## 注意

- 本包为 **beta 演示**，mac 安装包未做 Apple 公证；Win 为 zip 便携形态。  
- **不要**把 API Key 写进仓库或分享给无关人员。  
- 完整源码在仓库根目录；本目录仅为演示安装物。
