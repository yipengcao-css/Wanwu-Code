# Wanwu-Code 架构

## 总览

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/wanwu-shell  (自研 Electron · Wanwu Lattice · Monaco)       │
│  Orbit Bar · Files · Editor · Agent Studio · Terminal           │
└─────────────────────────────┬───────────────────────────────────┘
                              │ ACP (stdio) / 可选
┌─────────────────────────────▼───────────────────────────────────┐
│ extensions/wanwu-vscode（可选宿主适配器）                        │
│  Chat / Plan UI · Diff Review · Permission Gate · Sessions      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ packages/wanwu-acp-client
                              │ spawn / connect
┌─────────────────────────────▼───────────────────────────────────┐
│ wanwu CLI / Agent Runtime                                       │
│  默认：wanwu-native ACP；可选：桥接 grok ACP                     │
│  Session · Tools · MCP · Skills · Hooks · Memory · Sandbox      │
└───────────────┬─────────────────────────┬───────────────────────┘
                │                         │
        Model Providers            wanwu-cloud
        (多模型对等 BYOK)           runners / worktrees
```

`apps/wanwu-ide`（Code-OSS）**已退役**，见 [ADR 0005](./ADRs/0005-custom-electron-shell.md)。

## 协议分层

| 层 | 协议 | 用途 |
|---|---|---|
| 编辑器 ↔ Agent | **ACP**（JSON-RPC over stdio） | 会话、流式更新、工具权限、diff |
| Agent ↔ 外部工具 | **MCP** | 见 `docs/MCP.md`：stdio client，工具名 `mcp__server__tool` |
| 编辑器语言能力 | Monaco + Shell 多语言 LSP（见 `docs/LSP.md`） | TS/JS 内置；rust/python/go/c/cpp 经 PATH |

## 设计原则

1. **UI 是 adapter**：TUI / headless / VS Code 扩展 / 自研壳共享同一 session 语义  
2. **权限先于能力**：deny-first，OS sandbox 作最后防线  
3. **Plan / Act / Verify 分离**  
4. **纯文本记忆优先**：`WANWU.md`、skills markdown  
5. **多模型对等**  
6. **商标与许可证干净**：视觉系统 Wanwu Lattice 原创；不发行 VS Code 外观套壳  

## 包边界

| 路径 | 职责 |
|---|---|
| `apps/wanwu-shell` | 品牌桌面整机 |
| `extensions/wanwu-vscode` | 可选 VS Code/Cursor 适配器 |
| `packages/wanwu-acp-client` | 无 UI 依赖的 ACP JSON-RPC client |
| `packages/wanwu-cli` | CLI + wanwu-native ACP server |
| `packages/wanwu-protocol` | 共享类型 |
| `packages/wanwu-config` | 配置发现与合并 |
| `packages/wanwu-workflow` | Plan/Act/Verify 状态机 |
| `packages/wanwu-cloud` | 云任务 / worktree / Docker |
| `apps/wanwu-ide` | DEPRECATED Code-OSS 脚本 |

## 工作流状态机

```
Idle → Explore → PlanDraft → PlanApproved → Acting → Verifying → Done
                      │                         │
                      └─────(reject/revise)──────┘
```

## 配置

- 用户级：`~/.wanwu/config.toml`
- 工作区：`.wanwu/settings.toml`、`WANWU.md`、`.wanwu/skills/`、`.wanwu/hooks/`
- CLI / 扩展 / 桌面壳读取同一合并结果
