# 桌面签名与公证（macOS）

Wanwu Shell 安装包默认可 **无密钥构建**（本地 / Linux CI 交叉出 unsigned mac zip）。签名与 Apple 公证仅在密钥齐全时启用，**密钥禁止写入仓库**。

## 所需密钥（环境变量 / GitHub Secrets）

| 变量 | 用途 |
|---|---|
| `CSC_LINK` | Developer ID Application 证书 `.p12`（文件路径或 base64） |
| `CSC_KEY_PASSWORD` | `.p12` 密码 |
| `APPLE_ID` | Apple ID（公证） |
| `APPLE_APP_SPECIFIC_PASSWORD` | App 专用密码 |
| `APPLE_TEAM_ID` | Team ID |

可选：

| 变量 | 用途 |
|---|---|
| `WANWU_SKIP_NOTARIZE=1` | 已签名但跳过公证 |
| `CSC_IDENTITY_AUTO_DISCOVERY` | 由 `scripts/build-shell-dist.sh` 管理 |

Windows Authenticode **本阶段不做**（仍发 unsigned zip）。

## 本地（macOS 主机）

```bash
export CSC_LINK=/path/to/DeveloperID.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=...
export APPLE_APP_SPECIFIC_PASSWORD=...
export APPLE_TEAM_ID=...
pnpm shell:dist
```

钩子：`apps/wanwu-shell/scripts/afterSign-notarize.cjs`（经 `electron-builder.yml` `afterSign`）。

无 `CSC_LINK` 或非 Darwin 主机：强制 `CSC_IDENTITY_AUTO_DISCOVERY=false`，产出 unsigned zip。

## CI

`.github/workflows/release.yml` 的 `desktop-mac` job 在 `macos-latest` 上构建 mac zip，并在 Secrets 配置齐全时签名+公证，上传到同一 GitHub Release。未配置 Secrets 时仍产出 **unsigned** mac zip（不阻断 CLI/VSIX 发布）。

## 用户侧（unsigned）

见 `docs/INSTALL.md`：`codesign --sign -` + `xattr -cr`。
