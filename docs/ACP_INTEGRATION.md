# ACP 集成说明

## 什么是 ACP

[Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction) 标准化 **编辑器（Client）** 与 **Coding Agent（Server）** 的通信，类似 LSP 之于语言服务。

- 传输：默认 JSON-RPC over stdio（本地子进程）
- 能力：会话、流式消息/thinking、工具调用与权限、diff 展示等

## Wanwu 中的角色

| 组件 | ACP 角色 |
|---|---|
| `extensions/wanwu-vscode` | Client |
| `wanwu acp` | Agent 入口（默认 **wanwu-native**；可桥接 `grok`） |
| `apps/wanwu-shell` | Client（品牌整机；随包 ACP） |
| `apps/wanwu-ide` | ~~Client~~（已退役） |
| Zed / JetBrains | Client（外部配置，见 `docs/IDE_HOSTS.md`） |

## 拓扑

```
VS Code Extension / Wanwu Shell (ACP Client)
        │ stdin/stdout JSON-RPC
        ▼
   wanwu ACP backend
        │
        ├─ Shell 安装包 → resources/wanwu-cli/wanwu[.exe] --wanwu-internal-acp
        │                 （回退 wanwu.mjs + ELECTRON_RUN_AS_NODE；无 pnpm/tsx）
        ├─ Shell 开发   → dist-bin/wanwu.mjs --wanwu-internal-acp
        ├─ CLI wanwu acp → acpBridge.resolveAcpLaunch → wanwu-native / grok
        └─ WANWU_ACP_COMMAND 可覆盖任意后端
```

### wanwu-native（E2-A）

- 默认后端；**不依赖**系统 `grok` 二进制
- 工具：Read / Edit / Bash / Glob / Grep
- 权限：复用 deny-first `assessBash` + workspace path sandbox
- 无 API key 时使用确定性 tool loop（便于本地/CI）
- 黄金路径：`pnpm exec tsx scripts/acp-handshake-native.mts`

### 桥接层职责

1. 解析 `~/.wanwu/config.toml` 与工作区配置
2. `wanwu doctor` 报告 native / grok 可用性
3. 注入 Wanwu 系统上下文（`WANWU.md`、Plan/Agent 模式）
4. 统一日志与错误码
5. 多模型：LLM 调用为后续增强；当前 native 可无密钥运行

## 扩展侧最小流程

1. `activate` → 注册命令与侧栏
2. 用户发消息 → 确保 ACP 子进程存活
3. `initialize` / `session/new`
4. 订阅 `session/update` 渲染流式内容与 tool timeline
5. 权限请求 → Allow once / session / Deny
6. 编辑 → Diff Review → apply / reject

扩展默认仍可用 mock ACP（`wanwu.useMockAcp`）；关闭 mock 且 `acp_backend=wanwu-native` 时走真实 native。

## 兼容性策略

- 协议类型见 `packages/wanwu-protocol`
- `scripts/smoke-acp.sh`：mock + **native** 握手
- grok 未安装时：使用默认 native，不崩溃

## 参考

- https://github.com/agentclientprotocol/agent-client-protocol
- https://github.com/xai-org/grok-build（可选桥接）
- `docs/ADRs/0001-agent-runtime-base.md`
- `docs/EPIC2_BACKLOG.md`（E2-A）
