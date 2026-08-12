# 竞品对照：Kimi Code / Claude Code / Codex（2026-08-12）

> 基于当前 `main`（`68a0161`）与公开文档。结论：**Wanwu 是“能跑通的集成骨架”，还不是日常主力 coding agent**。

---

## 1. 能力对照表

| 能力 | Kimi Code | Claude Code | Codex | Wanwu 现状 |
|---|---|---|---|---|
| 单二进制安装 | ✅ | ✅ | ✅ | ✅（`build:cli:native`） |
| 打磨 TUI | ✅ pi-tui | ✅ | ✅ | ⚠️ readline 最小实现 |
| 流式输出 | ✅ | ✅ | ✅ | ❌（providers 无 stream） |
| 内建子代理 | ✅ coder/explore/plan | ✅ subagents | ✅ cloud attempts | ⚠️ `Task` 工具，同工作区 |
| 子代理隔离 | ✅ 独立上下文 | ✅ | ✅ 容器 | ⚠️ 仅上下文隔离，无 worktree/容器 |
| MCP | ✅ `/mcp-config` 对话式 | ✅ `/mcp` + 项目/用户配置 | ✅ | ⚠️ 文件配置 + 手写 stdio client |
| 权限模型 | ✅ read-only 自动放行，写/执行需确认 | ✅ allow/ask/deny + 模式 | ✅ Suggest/Auto Edit/Full Auto | ⚠️ 正则 deny + 模式 + RPC 弹窗 |
| OS sandbox | ❌（文档未强调） | ✅ Seatbelt/Landlock | ✅ 云容器 | ❌（config.sandbox 未执行） |
| 会话管理 | ✅ `/sessions` / resume | ✅ `/resume` / compact | ✅ cloud list/apply | ❌ cancel no-op；无 resume |
| 后台任务 | ✅ `Ctrl+B` + `/tasks` | ✅ background agents | ✅ cloud 异步 | ⚠️ `cloud --async` 本地子进程 |
| 真云端 | ❌（本地/ACP 为主） | ⚠️ 有 web/desktop | ✅ Codex Cloud 容器 + diff apply | ⚠️ HTTP runner 骨架，无快照/容器 |
| 多模型 | ✅ Kimi + 兼容 | ❌ Claude 为主 | ❌ OpenAI 为主 | ✅ xAI/OpenAI/Anthropic/Ollama/custom |
| IDE 覆盖 | ✅ Zed/JetBrains/VS Code | ✅ 终端/VS Code/JetBrains/桌面/Web | ✅ CLI/IDE/Slack/GitHub | ⚠️ 自研 Shell + VS Code 扩展 |
| 插件/技能市场 | ✅ marketplace + GitHub 安装 | ✅ skills/hooks 生态 | ✅ | ⚠️ 本地 registry MVP |
| 视频/多模态 | ✅ 视频输入 | ❌ | ✅ 图像 | ❌ |
| hooks 生命周期 | ✅ 丰富 | ✅ 20+ 事件 | ✅ | ⚠️ Pre/PostToolUse/Stop 3 个 |
| Verify/Plan | ✅ plan 模式 | ✅ plan + verify | ✅ cloud review | ⚠️ Plan 模板/LLM；Verify 硬编码 pnpm |

---

## 2. 关键差距（按用户影响排序）

### P0 — 决定能否 trusted daily use

1. **无真实执行 sandbox**
   - Bash 是 `spawnSync(..., { shell: true })`；`config.sandbox` 只报告不执行
   - 影响：不敢让 Agent 自由跑命令

2. **云端不是真异步编码**
   - 当前 runner 主要写 plan/review 工件；无容器隔离、无快照上传、无 diff apply 回本地
   - 影响：无法替代 Codex Cloud / Claude 远程任务

3. **会话不可恢复/不可取消**
   - `session/cancel` 是 no-op；`loadSession: false`；无 compact/resume
   - 影响：长任务或卡住时体验差

### P1 — 决定日常效率

4. **Agent 循环质量天花板低**
   - `maxTurns` 默认 6；Glob/Grep 朴素；无流式输出；无 checkpoint/rewind
   - 影响：复杂任务成功率低

5. **权限模型脆弱**
   - 正则 deny 易绕过；低风险默认放行；无 Claude 式 allow/ask/deny 列表
   - 影响：安全与信任不足

6. **TUI 非产品级**
   - readline + ANSI；无 pi-tui 类多 pane/持久工具面板/主题
   - 影响：终端优先用户流失

7. **Verify/Plan 不通用**
   - Verify 硬编码 `pnpm typecheck/test/lint`；Plan 模板化
   - 影响：换项目即失效

### P2 — 生态与覆盖

8. **子代理缺真实隔离**
   - 同工作区、同进程；无 worktree/容器级隔离
   - 影响：并行 coder 价值有限

9. **MCP/插件 UX 不完整**
   - 文件配置为主；无 `/mcp-config` 对话式安装/OAuth
   - 影响：生态冷启动慢

10. **IDE/宿主覆盖窄**
    - 仅自研 Shell + VS Code；无 JetBrains/Zed/桌面/Web/Slack/GitHub 集成
    - 影响：用户触达面小

11. **无多模态/后台长任务**
    - 无视频/图像输入；Bash 60s 同步超时
    - 影响：现代工作流缺失

---

## 3. 已具备的优势（保持）

- **多模型对等**：xAI / OpenAI / Anthropic / Ollama / custom 第一天起对等
- **ACP 原生**：编辑器 ↔ Agent 协议统一
- **自研品牌壳**：Wanwu Lattice + Monaco + 多语言 LSP
- **安全基线**：Edit propose-then-apply、权限 RPC、hooks、最小 env、realpath
- **工程化**：benchmark、签名门控、文档对齐、小 PR 节奏

---

## 4. 建议下一步（按 ROI）

| 优先级 | 事项 | 理由 |
|---|---|---|
| 1 | **真实 sandbox**（bubblewrap/Seatbelt 或容器默认） | 解锁 Bash 信任 |
| 2 | **会话 cancel + resume + compact** | 长任务可用性 |
| 3 | **流式 providers**（SSE） | 交互体验 |
| 4 | **云端容器执行 + diff apply** | 对标 Codex Cloud |
| 5 | **权限规则文件**（`.wanwu/permissions.toml` allow/ask/deny） | 对标 Claude |
| 6 | **TUI 升级**（ink 或自研多 pane） | 对标 Kimi |
| 7 | **通用 Verify**（检测项目类型：pnpm/npm/cargo/go） | 闭环质量 |
| 8 | **子代理 worktree 隔离** | 并行安全 |
| 9 | **MCP 对话式配置**（`/mcp-config`） | 生态易用 |
| 10 | **JetBrains/Zed ACP 适配** | 宿主覆盖 |

---

## 5. 结论

Wanwu 当前是 **架构正确、工程节奏好、安全基线已补** 的 beta 产品；与 Kimi Code / Claude Code / Codex 的差距主要在 **执行安全（sandbox）、异步云端、会话连续性、Agent 循环深度、TUI  polish、宿主生态**。

建议优先做 **sandbox + cancel/resume + streaming + 真云端容器**，这四项决定能否从“演示/ beta”进入“日常主力”。
