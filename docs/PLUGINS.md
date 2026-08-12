# 插件市场（MVP）

Wanwu 插件市场当前只支持 **skills（markdown）** 与 **MCP server 配置片段** 的安装；不下载执行任意代码，不发布 hooks。

## 命令

```bash
wanwu plugin list [--kind skill|mcp] [--registry <url>]
wanwu plugin search <query>
wanwu plugin show <id>
wanwu plugin install <id>[@version] [--scope user|workspace] [--yes]
wanwu plugin remove <id> [--scope user|workspace]
```

默认 registry：`https://registry.wanwu.dev/plugins/index.json`（可用 `WANWU_PLUGIN_REGISTRY` 或 `--registry file://...` 覆盖）。

## 信任等级

| 等级 | 含义 | 安装行为 |
|---|---|---|
| `official` | 官方索引 | 可直接 `--yes` |
| `community` | 社区条目 | 交互确认，显示 command/args |
| `local` / `untrusted` | 非默认源 | 需 `--yes` 并自担风险 |

## 安全

- skill：仅复制文本到 `~/.wanwu/plugins/cache` 或 `.wanwu/skills/`
- MCP：仅写入 `.wanwu/mcp.toml` 配置；**不会**在安装时启动进程
- 所有条目要求 `sha256`；不匹配拒绝安装
- 运行时仍走 hooks + 权限门控

## 本地缓存

```text
~/.wanwu/plugins/
  cache/sha256-<hex>/     # 内容寻址缓存
  installed.json          # 已安装记录
```

工作区启用：

```text
.wanwu/skills/<id>.md
.wanwu/mcp.toml
```
