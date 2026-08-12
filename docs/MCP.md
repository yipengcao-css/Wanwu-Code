# MCP 工具面（Wanwu-native）

Wanwu 通过 **Model Context Protocol（stdio JSON-RPC）** 接入外部工具。本产品不是 Anthropic/OpenAI 官方发行；MCP 仅为开放协议桥接。

## 配置

按 **first-wins** 读取第一个存在的文件：

1. `.wanwu/mcp.toml`
2. `.wanwu/mcp.json`
3. `.mcp.json`（Cursor 风格）

### TOML

```toml
[mcp.servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]
```

### JSON

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

`env` 可选：在 server 子进程环境中注入额外变量（密钥仍应来自本机环境 / `credentials.env`，勿写入仓库）。

## 工具命名

暴露给 LLM 的工具名为：

```text
mcp__<server>__<tool>
```

示例：`mcp__filesystem__read_file`。

## 运行时

- `wanwu-native` ACP 在 `initialize` / 首次 LLM 回合时懒加载 MCP servers
- 工具调用走 `dispatchTool`，与内建工具一样经过 **PreToolUse / PostToolUse** hooks
- `wanwu doctor` / `wanwu inspect` 会报告配置路径与 server 列表（不会自动拉起进程做健康检查）

## 安全

任意 MCP server ≈ **用户级 RCE**。请：

- 只启用信任的 command
- 用 `.wanwu/hooks.toml` 做 PreToolUse 门禁
- 勿把 API 密钥写进 mcp 配置文件后提交到 git

## 验证

```bash
# 单元：fake stdio server
pnpm --filter @wanwu/cli exec vitest run src/mcp

# 手工：配置后 wanwu inspect | jq .mcpServers
wanwu doctor
```
