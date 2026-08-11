# 竞品能力分析与吸收清单

> 目的：明确“偷师”边界，避免做成四不像，也避免重复造轮子。

## 1. Grok Build（xai-org/grok-build）

**开源，Apache-2.0，Rust。**

| 所长 | Wanwu 吸收方式 |
|---|---|
| TUI / headless / ACP / leader 同一 runtime | `wanwu` 多入口，UI 仅作 projection |
| OS sandbox（Landlock / Seatbelt） | 桥接期复用；原生期对齐策略 |
| MCP / skills / plugins / hooks | 配置与发现层对齐 |
| Workspace checkpoint + VCS 意识 | Act 后可 rewind / 对照 diff |
| Subagent + worktree | Phase 5 并行的基础 |

**策略**：MVP 允许直接桥接 `grok` ACP；不在第一天完整 fork 巨型 workspace。

## 2. VS Code / Code-OSS

| 所长 | Wanwu 吸收方式 |
|---|---|
| 编辑 / 调试 / SCM / 终端 | 扩展内复用宿主；整机期预装 |
| Diff / Problems / 多根工作区 | Agent 上下文与 Review UI |
| 扩展生态与用户习惯 | Extension-first，降低迁移成本 |

**策略**：先做 `extensions/wanwu-vscode`，再考虑 `apps/wanwu-ide` 品牌化发行。

## 3. OpenAI Codex

| 所长 | Wanwu 吸收方式 |
|---|---|
| CLI + IDE + Cloud 同配置 | `~/.wanwu/config.toml` 单一真相 |
| 云端异步任务 | `packages/wanwu-cloud`（后期） |
| 并行 agent + worktree | 本地先做，云端后做 |
| Review-first / PR 工作流 | Diff accept/reject 默认路径 |

## 4. Claude Code

| 所长 | Wanwu 吸收方式 |
|---|---|
| Plan Mode | `Ask / Plan / Agent / Verify` 模式 |
| `CLAUDE.md` 纯文本记忆 | `WANWU.md` + 兼容读取 |
| gather → act → verify | workflow 状态机 |
| Hooks 与权限纪律 | deny-first + Pre/PostTool hooks |
| Subagent 上下文隔离 | Verify 与 Act 分离 |

## 5. Wanwu 差异化

1. **协议原生**：ACP 一等公民，不绑死单一厂商 Agent
2. **多模型对等**：产品身份不绑定某一模型公司
3. **工作流产品化**：Plan/Verify 不是提示词彩蛋，而是状态机与 UI 模式
4. **开源桥接务实**：能复用 grok-build 就复用，避免“从零重写 harness”
