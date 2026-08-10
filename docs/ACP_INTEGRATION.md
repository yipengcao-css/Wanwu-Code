# ACP 集成说明

## 什么是 ACP

[Agent Client Protocol](https://agentclientprotocol.com/get-started/introduction) 标准化 **编辑器（Client）** 与 **Coding Agent（Server）** 的通信，类似 LSP 之于语言服务。

- 传输：默认 JSON-RPC over stdio（本地子进程）
- 能力：会话、流式消息/thinking、工具调用与权限、diff 展示等

## Wanwu 中的角色

| 组件 | ACP 角色 |
|---|---|
| `extensions/wanwu-vscode` | Client |
| `wanwu acp` | Agent 入口（可桥接到 `grok` ACP） |
| 未来 `apps/wanwu-ide` | Client（内置） |

## MVP 桥接拓扑

```
VS Code Extension (ACP Client)
        │ stdin/stdout JSON-RPC
        ▼
   wanwu acp
        │  (可选直通或包装)
        ▼
   grok ACP / 未来 wanwu-native
```

### 桥接层职责

1. 解析 `~/.wanwu/config.toml` 与工作区配置
2. 检查 `grok` 是否可用（`wanwu doctor`）
3. 注入 Wanwu 系统上下文（`WANWU.md`、模式：Plan/Act/Verify）
4. 统一日志与错误码（扩展可展示友好提示）
5. 多模型：若后端暂仅支持部分厂商，在桥接层说明降级策略

## 扩展侧最小流程

1. `activate` → 注册命令与侧栏
2. 用户发消息 → 确保 ACP 子进程存活
3. `initialize` / `session/new`（以实际 schema 版本为准）
4. 订阅 `session/update` 渲染流式内容与 tool timeline
5. 收到权限请求 → 弹窗 Allow once / session / Deny
6. 收到编辑 → Diff Review → apply / reject

## 兼容性策略

- 锁定并记录所实现的 ACP schema 版本于 `packages/wanwu-protocol`
- 增加 `scripts/smoke-acp.sh` 做握手 + 单轮 prompt 黄金路径
- grok 未安装时：扩展显示安装指引，不崩溃

## 参考

- https://github.com/agentclientprotocol/agent-client-protocol
- https://github.com/xai-org/grok-build（ACP 模式）
- `docs/ADRs/0001-agent-runtime-base.md`
