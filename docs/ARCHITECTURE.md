# Wanwu-Code 架构

## 总览

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/wanwu-ide (Code-OSS fork, 后期)                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ ACP
┌─────────────────────────────▼───────────────────────────────────┐
│ extensions/wanwu-vscode (MVP ACP Client)                        │
│  Chat / Plan UI · Diff Review · Permission Gate · Sessions      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ spawn / connect
┌─────────────────────────────▼───────────────────────────────────┐
│ wanwu CLI / Agent Runtime                                       │
│  优先：桥接 grok-build ACP；后期：原生 runtime                   │
│  Session · Tools · MCP · Skills · Hooks · Memory · Sandbox      │
└───────────────┬─────────────────────────┬───────────────────────┘
                │                         │
        Model Providers            wanwu-cloud (后期)
        (多模型对等 BYOK)           runners / worktrees
```

## 协议分层

| 层 | 协议 | 用途 |
|---|---|---|
| 编辑器 ↔ Agent | **ACP**（JSON-RPC over stdio） | 会话、流式更新、工具权限、diff |
| Agent ↔ 外部工具 | **MCP** | 数据库、浏览器、内部 API 等 |
| 编辑器 ↔ 语言服务 | **LSP** | 诊断、跳转、补全（沿用 VS Code） |

## 设计原则

1. **UI 是 adapter**：TUI / headless / VS Code / IDE 共享同一 session 语义
2. **权限先于能力**：deny-first，OS sandbox 作最后防线
3. **Plan / Act / Verify 分离**：Verify 使用独立上下文（maker-checker）
4. **纯文本记忆优先**：`WANWU.md`、skills markdown
5. **多模型对等**：配置层不锁定单一厂商
6. **商标与许可证干净**：Apache/MIT 归因；产品品牌为 Wanwu

## 运行时策略（已锁定）

### 短期：Grok Build ACP 桥接

```
wanwu acp  →  配置归一化 / 品牌包装 / 工作流注入  →  grok ACP (stdio)
```

`wanwu` 负责：

- 统一 `~/.wanwu/config.toml`
- 装载 `WANWU.md` / `AGENTS.md`
- Plan/Verify 模式提示与状态
- 多模型 provider 路由（能走 grok 的走桥接；其他走 wanwu provider 层）

### 中期：能力内聚

按需 vendor/裁剪 grok-build 关键 crate（sandbox、workspace、tools），去品牌化为 `wanwu-*`。

## 包边界

| 路径 | 职责 |
|---|---|
| `extensions/wanwu-vscode` | IDE 脸面（ACP client） |
| `packages/wanwu-protocol` | 共享类型与 schema |
| `packages/wanwu-config` | 配置发现与合并 |
| `packages/wanwu-workflow` | Plan/Act/Verify 状态机 |
| `packages/wanwu-cloud` | 云任务（占位） |
| `crates/` | Rust agent / 桥接实现 |
| `apps/wanwu-ide` | Code-OSS 整机（后期） |

## 工作流状态机

```
Idle → Explore → PlanDraft → PlanApproved → Acting → Verifying → Done
                      │                         │
                      └─────(reject/revise)──────┘
```

详见 `packages/wanwu-workflow` 与 `docs/ROADMAP.md`。

## 配置

- 用户级：`~/.wanwu/config.toml`
- 工作区：`.wanwu/settings.toml`、`WANWU.md`、`.wanwu/skills/`、`.wanwu/hooks/`
- CLI / 扩展 / 云端读取同一合并结果（Codex 风格统一配置）
