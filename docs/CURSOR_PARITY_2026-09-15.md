# 对标 Cursor 的缺口审计与实施方案（2026-09-15）

> **2026-09-18 状态**：阶段 A–E（#39–#56）已合入 `main`。#65–#69（流式默认开 / Shell @ 菜单 / 扩展 bundled ACP / 文档对齐 / MCP resources·贴图·记忆·SCM）已在集成分支合并。下文 §1–§3 是审计当日快照，**不要按空缺表再施工**。仍缺项见文首「仍未做」。

## 2026-09-18 已落地（相对审计稿）

| 阶段 | 已实现 | 证据 |
|---|---|---|
| A1 | `Edit` search/replace 块 + `Write`；`ask` 提案、`accept-edits`/`accept-all` 落盘 | `tools.ts` / `toolDispatch.ts` |
| A2 | token 估算 + `compactMessages`；`maxTurns` 25 / `maxTokens` 8192 | `native/context/compact.ts` |
| A3 | 超时/重试/`usage`/`assertMediaSupported` | `packages/wanwu-providers` |
| A4 | `Todo` 会话任务清单 | `native/todo.ts` |
| A5 | `WebFetch` / `WebSearch` | `native/web.ts` |
| B1 | `@file` `@git:*` `@web:` `@terminal` `@diagnostics`（TUI Tab 补全） | `native/mentions.ts` / `tui.ts` |
| B2 | `SearchCodebase` embeddings + 关键词降级 | `native/codebaseIndex/` |
| B3 | `Diagnose` + 编辑后 lint 闭环 | `native/diagnose.ts` / `llmAgentLoop.ts` |
| B4 | `.wanwu/rules` + `~/.wanwu/rules` | `rules.ts` |
| C1 | Monaco Tab 幽灵文本 + FIM/chat | `inlineComplete.ts` |
| C2 | Ctrl+K 内联改写 | `inlineEdit.ts` |
| C3 | turn 检查点 + `wanwu undo` | `native/checkpoints.ts` |
| C4 | 文件监听 / 搜索 / 命令面板 / 多终端 / 全 LSP | `apps/wanwu-shell` |
| D1–D5 | allow-session 记忆、hooks 全接线、coder 互斥、TUI `/resume`、`commit-msg` | CLI / TUI |
| E | protocol 再导出、去掉 WSL 假检测、Anthropic URL 图、扩展 Quick Fix 带诊断 | — |
| 流式默认开 | `shouldStream` 默认 on；TUI/Shell 显示 token | `native/stream.ts` / `statusBar.ts` |
| Shell @ 菜单 | Agent Studio `@` 补全 + 终端/诊断随 prompt | `mentionComplete.ts` |
| 扩展 ACP | bundled 启动 + `vscode.diff` / WorkspaceEdit | `wanwu-acp-client/launch.ts` |
| MCP resources | `resources/list`+`read`；`McpReadResource` | `mcp/client.ts` / `registry.ts` |
| 聊天贴图 | ACP images / TUI `/image` / Shell 粘贴 | `promptAttachments.ts` |
| 自动记忆 | 明确「记住」写入 WANWU.md | `autoMemory.ts` |
| 轻量 SCM | FileTree porcelain 标记 | `git:status` / `shared/scm.ts` |

## 仍未做（2026-09-20）

1. MCP **prompts / OAuth / 远程**（stdio resources 已做）
2. Shell 调试器（终端 Ctrl+K 已做）
3. `WorkflowMachine` 未进 UI；`crates/` 仍空
4. 插件注册表 `registry.wanwu.dev` 未证实上线
5. 扩展无侧栏 View

## 2026-09-20 Cursor 模板优化

| 项 | 落点 |
|---|---|
| ListDir + Read 行号 / offset/limit | `tools.ts` / `toolSpecs.ts` |
| 只读工具并行（Read/ListDir/Glob/Grep/Diagnose/SearchCodebase） | `parallelTools.ts` / `llmAgentLoop.ts` |
| 系统提示：先读后改、验证后再收工、打开标签进 system | `agentPrompt.ts` |
| `@codebase` 语义检索 | `mentions.ts` / mentionComplete |
| 回合上限可见提示 | `llmAgentLoop.ts` |
| Shell 停止 / 忙时排队 / 检查点撤销 | Agent Studio |
| 工具卡片就地更新 + Todo 面板 | AgentStudio / sessionLog |
| 会话列表恢复（`session/list` + `session/load`） | acpServer / AgentStudio |
| 打开标签进 `@EDITOR_CONTEXT`；`@目录/` 补全 | AgentStudio / mentionComplete |
| 多文件 diff 队列 + 全部接受 | App / DiffReview |
| 设置里改 `permission_mode` | SettingsDrawer |
| 终端 Ctrl+K 生成命令 | TerminalPane / `ai:terminalAsk` |

---

> 目标：**复刻 Cursor 级本地 coding agent**，明确排除 cloud agent / Bugbot / Web 端等重基础设施。
> 范围：当时 `main`（`c810788`）全部代码 + 文档。审计方法：4 路子系统盘点（CLI runtime / providers 共享包 / Electron Shell / 扩展与文档）+ 关键路径人工复核。
> 结论（**当时**）：**Wanwu 已有「能跑通的 Agent 骨架 + 安全基线 + 多模型」，但缺 Cursor 的三大招牌（Tab 补全、内联编辑、代码库索引）与上下文工程深度；另有约 15 处「定义了但没接线」的半成品。**

---

## 1. 现状速览（诚实版）

| 层 | 已有（真实可用） | 半成品（定义未接线） | 空缺 |
|---|---|---|---|
| Agent 循环 | 多轮 tool calling、流式（opt-in）、cancel、session 持久化/恢复 | 流式默认关；ACP prompt 不带附件 | 上下文压缩、token 统计、重试 |
| 工具面 | Read/Glob/Grep/Edit/Bash/Task + MCP stdio | Edit 从 LLM 路径只提案不落盘 | Write、search/replace、Todo、Web、LSP 诊断、ListDir |
| 权限/沙箱 | deny-first + permissions.toml + ACP 弹窗 + bwrap/seatbelt/docker | `allow-session` 不记忆；WSL 只检测不执行 | — |
| Hooks | Pre/PostToolUse、ToolCallApproved/Denied 已接线 | SessionEnd/UserPromptSubmit/Subagent*/Error 从不触发 | — |
| 子代理 | explore/coder/plan + worktree 隔离 + 并发 1-4 | coder 串行是注释 stub；policy allow-list 只在测试里 | 结果合并回父会话 |
| Providers | 5 家 + 双路 SSE + 双路 tools + 图像（base64） | capabilities 表不生效；Anthropic URL 图像被丢弃 | 重试/超时、usage、模型列表、embeddings |
| TUI | 多 pane、主题、/history、Ctrl+T | HELP 漏写 /status /mcp；会话不落盘 | @ 补全、图片粘贴、自动补全 |
| Shell | Monaco 标签页 + DiffEditor 审阅 + 终端 + LSP 诊断 + 权限弹窗 | 多语言 LSP 后端齐但 UI 只放行 TS/JS；`optIn` 不过滤 | Tab 补全、Ctrl+K、索引、@ 上下文、检查点、搜索面板、命令面板、分栏、多终端、文件监听 |
| 扩展 | 聊天面板 + Quick Fix + session 控制 | Problems 桥接建了没用；Quick Fix 不带诊断自动发问 | 侧边栏 view、多文件 diff 审阅 |
| 工程 | benchmark、签名门控、CI、小 PR 节奏 | protocol 包是占位符（类型三处重复） | — |

---

## 2. 对照 Cursor 本地能力总表

| Cursor 能力 | Wanwu 现状 | 差距级 |
|---|---|---|
| Agent 聊天（工具调用/流式/取消/恢复） | ✅ ACP + TUI 双入口 | — |
| 模式（Agent/Ask/Manual） | ✅ ask/plan/agent/verify | 缺自定义模式 |
| 权限审批 + 自动放行规则 | ✅ permissions.toml + 弹窗 | `allow-session` 不记忆 |
| OS 沙箱 | ✅ bwrap/seatbelt/docker | WSL 未实现 |
| MCP | ⚠️ stdio tools only | 无 resources/prompts/远程/OAuth |
| 子代理 | ✅ Task + worktree | 串行/策略未接线 |
| 多模型 | ✅ 5 家对等（优势项） | — |
| 多模态图像 | ⚠️ exec --image | Shell/TUI 聊天不支持 |
| **Tab 自动补全（ghost text）** | ❌ 零实现 | **招牌缺口 1** |
| **内联编辑（Ctrl+K）** | ❌ 零实现 | **招牌缺口 2** |
| **代码库索引（语义搜索 @Codebase）** | ❌ 零实现 | **招牌缺口 3** |
| **@-mentions 上下文（@文件/@文件夹/@Git/@终端/@Lint/@Web）** | ❌ 仅自动附带当前文件前 500 字符 | 高频入口 |
| **检查点/一键回滚** | ❌ 零实现 | 信任关键 |
| **上下文压缩（长会话不爆）** | ❌ 48 条粗暴截断 | 长任务天花板 |
| **编辑粒度** | ❌ 整文件覆写、LLM 路径不落盘 | 大文件成本高易错 |
| Lint 循环（Agent 自动看诊断） | ❌ LSP 诊断不进 Agent | 修 bug 闭环 |
| 终端联动（读终端输出/终端内 Ctrl+K） | ❌ 终端与 Agent 完全隔离 | — |
| Rules（.cursor/rules 式分层规则） | ⚠️ WANWU.md 静态记忆（2 文件 ×1200 字符） | 无目录化/按 glob 生效 |
| Memories（自动记忆） | ⚠️ 手动 `memory-writeback` | 无自动提炼 |
| Web 搜索/抓取 | ❌ | 只能走用户自建 MCP |
| Todo 任务清单 | ❌ | 长任务可观测性 |
| 提交信息生成 | ❌ | — |
| Token 用量/成本显示 | ❌ | — |
| 编辑器基础（搜索面板/命令面板/分栏/多终端/文件监听/LSP 全功能） | ❌ 全缺 | 日常可用性 |
| 后台本地任务 | ⚠️ `cloud --async` 本地子进程 | 无统一任务面板 |
| ~~Cloud agent / Bugbot / Web 端~~ | 明确排除 | 不做 |

---

## 3. 缺口清单（按用户影响排序）

### S 级 — 决定「像不像 Cursor」

1. **Tab 自动补全**：Monaco 无 `registerInlineCompletionsProvider`；providers 无 FIM/补全通道。
2. **内联编辑 Ctrl+K**：无选区 → 提示 → 内联 diff → 接受/拒绝链路。
3. **代码库语义索引**：全仓零 embeddings；Grep 上限 200 文件/80 命中，大仓抓瞎。
4. **检查点/回滚**：Agent 改错无法一键恢复（当前仅靠 git 手工）。
5. **上下文工程**：48 条截断 + maxTokens 2048 + maxTurns 6，复杂任务必然截瘫；无压缩、无 token 计量。

### A 级 — 决定日常效率

6. **@-mentions 上下文系统**：TUI 与 Shell 都没有；当前只自动带当前文件 500 字符。
7. **编辑工具粒度**：整文件覆写（token 贵、大文件易截断出错）；无 search/replace 块、无 multi-edit；且 LLM 路径 `apply:false` 只提案——CLI/TUI 场景下编辑根本不落盘（只有 Shell DiffReview 接受才写）。
8. **Lint 诊断闭环**：Shell 有 LSP 诊断但 Agent 看不到；修完不会自动复查。
9. **Rules 分层规则**：无 `.wanwu/rules/*.md` 按 glob/手动/always 生效机制。
10. **Todo 工具**：长任务无进度清单。
11. **Web 搜索/抓取工具**：零。
12. **终端联动**：Agent 读不到终端输出；终端里不能唤起 AI。

### B 级 — 健壮性与信任

13. **providers 健壮性**：无超时、无重试退避；429/5xx 直接炸；无 usage 统计。
14. **权限记忆**：`allow-session` 选项是摆设。
15. **Hooks 半接线**：7 个事件里 5 个从不触发。
16. **子代理执行孔**：coder 串行是注释；allow-list 未进 runner；worktree 失败静默回主目录。
17. **TUI 会话不落盘**：`/history` 只是内存；重开即丢。

### C 级 — 编辑器/工程卫生

18. **Shell 编辑器基础**：无文件监听（外部改动不刷新）、无搜索面板、无命令面板、无分栏、单终端、LSP 仅诊断且 UI 只放行 TS/JS。
19. **扩展半成品**：Problems 桥接未用；Quick Fix 不自动带诊断发问；README 过期。
20. **工程杂物**：protocol 占位包、类型三处重复、`StreamChatOptions` 重复声明、TUI HELP 漏项、WSL 假检测。

---

## 4. 实施方案（分 5 阶段，每步都是独立小 PR）

> 原则：先地基后招牌；每个 PR 可独立验收；严格模式 TS；涉及权限/沙箱必带测试。

### 阶段 A — Agent 地基（先做，全部后续工作的承载层）

| # | 事项 | 落点 | 验收 |
|---|---|---|---|
| A1 | **编辑工具重做**：新增 `Write`（创建/覆写）与 `Edit` 改为 search/replace 块（支持多块、模糊匹配、失败回显）；LLM 路径按权限模式决定 apply（accept-edits/accept-all 直接落盘 + 记录 diff；ask 走提案） | `tools.ts`、`toolSpecs.ts`、`toolDispatch.ts`、`llmAgentLoop.ts` | 单测：块匹配/多块/缩进容错；ACP 下 diff 提案仍工作 |
| A2 | **上下文工程**：token 估算器（tiktoken 近似或字符启发式）；历史超预算时 LLM 自压缩（summarize 旧轮次）；`maxTurns` 默认 6→25、`maxTokens` 2048→8192 可配 | `llmAgentLoop.ts`、新 `context/compact.ts`、`config` | 单测：压缩触发阈值、压缩后保留 system+最近 N 轮 |
| A3 | **providers 健壮性**：fetch 超时（默认 60s，可配）；429/5xx 指数退避重试（≤3 次）；解析 `usage` 进 `ChatResponse`；`assertMediaSupported` 接入 complete/stream | `providers/src/{complete,errors,types}.ts` | 单测：mock fetch 验证重试/超时/usage |
| A4 | **TodoWrite 工具**：agent 可维护任务清单，TUI/ACP 展示进度 | 新 `tools/todo.ts`、`.wanwu/todos/<session>.json` | 单测 + TUI 面板渲染 |
| A5 | **WebFetch/WebSearch**：WebFetch 纯 fetch+ readability 摘要；WebSearch 走可配端点（无 key 时明确报错） | 新 `tools/web.ts` | 单测 mock fetch |

### 阶段 B — 上下文与代码库理解

| # | 事项 | 落点 | 验收 |
|---|---|---|---|
| B1 | **@-mentions 系统**：解析 `@文件/@文件夹/@git(diff/status)/@terminal/@diagnostics/@web`；TUI 输入自动补全；Shell 聊天输入框同步支持 | 新 `context/mentions.ts`、TUI 输入、Shell `AgentStudio.tsx` | 单测解析器；TUI 手动验证 |
| B2 | **代码库索引（本地优先）**：默认 provider embeddings API（OpenAI `text-embedding-3` 等，多模型对等），无 key 时降级关键词倒排；增量索引（mtime+hash）存 `.wanwu/index/`；新增 `SearchCodebase` 工具 | 新 `index/` 子系统、`tools.ts` | 单测：索引增量更新、检索召回；大仓性能 benchmark |
| B3 | **Lint 闭环**：Shell LSP 诊断经 ACP 推送/拉取给 agent（`@diagnostics` + Edit 后自动复查）；CLI 侧用 `tsc --noEmit` 等按项目类型轻量诊断 | `acpServer.ts`、`ipc/lsp.ts`、`verify.ts` | E2E：改坏代码 → agent 收到诊断 → 修复 |
| B4 | **Rules 系统**：`.wanwu/rules/*.md`（frontmatter：`always` / `globs` / `manual`），与 WANWU.md/AGENTS.md 合并进系统提示；`~/.wanwu/rules/` 用户级 | 新 `rules.ts`、`llmAgentLoop.ts buildSystem` | 单测：glob 匹配、优先级 |

### 阶段 C — 编辑器智能（Shell 招牌三件套 + 基础补齐）

| # | 事项 | 落点 | 验收 |
|---|---|---|---|
| C1 | **Tab 自动补全**：Monaco `registerInlineCompletionsProvider`；补全通道走 OpenAI-compat FIM（DeepSeek/Codestral/Ollama qwen-fim 等）或 chat 模型 JSON 模式兜底；防抖 300ms、Esc 拒绝、Tab 接受、按配置开关 | 新 `renderer/editor/inlineComplete.ts`、providers 新 `completeFim` | 手动录屏：幽灵文本出现/接受/拒绝；单测 provider 映射 |
| C2 | **内联编辑 Ctrl+K**：选区 + 输入提示 → 流式生成 → Monaco 内联 diff（`createInlineCompletionsProvider` 之外的 diff zone）→ 接受/拒绝 | 新 `renderer/editor/inlineEdit.ts`、复用 ACP 或直连 providers | 手动录屏全流程 |
| C3 | **检查点/回滚**：每个 agent turn 前对工作区做轻量快照（git 对象/`.wanwu/checkpoints/<id>.patch`，未跟踪文件清单另存）；Shell/TUI 提供「恢复到上一轮」 | 新 `checkpoints.ts`、ACP server、Shell UI | 单测：快照/恢复/未跟踪文件；E2E 回滚验证 |
| C4 | **Shell 基础补齐**：chokidar 文件监听刷新 FileTree；全局搜索面板（复用 Grep 逻辑）；命令面板（`F1`，注册表式）；编辑器左右分栏；多终端标签；LSP 全功能（completion/hover/definition/references/rename）+ 移除 `isTsLike` 门控 + `optIn` 过滤生效 + 删 legacy `tsLspClient.ts` | `main/ipc/fs.ts`、新 `search/`、`palette/`、`MonacoPane.tsx`、`lsp/*` | 逐项手动验证清单 |

### 阶段 D — 体验闭环与信任

| # | 事项 | 落点 | 验收 |
|---|---|---|---|
| D1 | **权限记忆**：`allow-session` 写入会话级 allow-set（tool+pattern），会话内不再问 | `native/permissions.ts` | 单测：同规则第二次不弹窗 |
| D2 | **Hooks 全接线**：SessionStart/End、UserPromptSubmit、SubagentStart/End、Error 在 ACP/TUI/子代理真实触发 | `acpServer.ts`、`tui.ts`、`subagents/runner.ts` | 单测：每事件至少一个触发点 |
| D3 | **子代理修正**：coder 互斥锁落地；`isToolAllowed` 接入 runner；worktree 失败时 fail-closed 或显式警告 | `subagents/{pool,runner,worktree}.ts` | 单测 + 并行 coder 不串扰 |
| D4 | **TUI 收尾**：会话落盘复用 `sessionStore`；`/resume`；图片粘贴（OSC52/文件路径拖拽）；HELP 补 `/status` `/mcp` | `tui.ts`、`tui/*` | 手动验证 |
| D5 | **提交信息生成 + 用量显示**：`wanwu commit-msg`（读 git diff 生成）；TUI/Shell 状态栏显示本轮 tokens/成本估算 | 新 `commitMsg.ts`、`statusBar.ts` | 单测 + 手动 |

### 阶段 E — 工程卫生（随时穿插的小 PR）

| # | 事项 |
|---|---|
| E1 | `@wanwu/protocol`：要么落实为 ACP 类型单一来源（acp-client/cli 改用之），要么删除；消除 `ProviderId`/`WanwuMode`/`StreamChunk` 三处重复；修 `StreamChatOptions` 重复声明 |
| E2 | 扩展：Problems 桥接接入 agent 修复流；Quick Fix 自动携带诊断发问；README 同步 `useMockAcp=false` |
| E3 | WSL sandbox：实现执行或从 detect 移除（不做假检测） |
| E4 | Anthropic URL 图像支持或显式报错；`videoInput:"frames"` 从 capabilities 撤下直到实现 |
| E5 | ✅ 已修：`apps/wanwu-shell/README.md` 残留合并冲突（本分支 `b8216b9`） |

---

## 5. 推荐执行顺序与依赖

```
A1 → A2 → A3        （地基，后续全部依赖）
  ↓
B1 → B4             （上下文入口，规则先行便宜）
  ↓        ↘
B2        B3        （索引与诊断可并行）
  ↓
C3                  （检查点先做，保护后续实验）
  ↓
C1 → C2             （招牌两件套，依赖 A3 的流式/重试）
  ↓
C4                  （编辑器基础，可拆 5-6 个 PR 并行）
D1-D5               （信任与体验收尾，多数可与 C 并行）
E1-E5               （穿插）
```

**里程碑建议**：
- **M1（Agent 好用）**：A 全部 + B1 + B4 → CLI/TUI 达到 Claude Code 级日常可用
- **M2（懂代码库）**：B2 + B3 + C3 → 大仓可用、改错可回滚
- **M3（像 Cursor）**：C1 + C2 + C4 核心 → 招牌体验齐
- **M4（成品）**：D + E → 信任与打磨

**明确不做**（避免重基础设施）：cloud agent 编排/快照服务端、Bugbot 式 PR 审查、Web/移动端、团队知识库、SSO/计费。现有 `wanwu cloud` 本地 runner 保留维护即可。

---

## 6. 风险与注意

1. **B2 索引的隐私叙事**：embeddings 走 provider API 意味着代码片段出域——默认关、首开弹窗说明、支持 Ollama 本地 embedding 兜底，对齐「密钥只走环境变量」红线。
2. **C1 补全成本**：FIM 调用高频，需防抖 + 上下文裁剪（前缀 2k/后缀 512）+ 每日用量显示，避免账单惊吓。
3. **A1 编辑重做是行为变更**：确定性 demo 路径（`agentLoop.ts`）与 E2E 脚本依赖整文件覆写语义，需同步更新 `examples/failing-test-demo`。
4. **C3 检查点与 sandbox 交互**：快照写 `.wanwu/` 需豁免路径沙箱；恢复操作本身要走权限弹窗。
5. **多模型对等红线**：FIM/embeddings 新增 provider 能力时保持配置对称（AGENTS.md 红线 4），不为单一厂商写死。
