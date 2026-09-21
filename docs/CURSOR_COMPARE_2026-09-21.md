# Wanwu × Cursor 全面对照（2026-09-21）

> **仓库**：`yipengcao-css/Wanwu-Code` HEAD `b9655e1`（`cursor/parity-integrate-628e`）  
> **对照物**：Cursor 3（2026-04 GA）及官方文档 / changelog，截至 2026-09  
> **方法**：以**源码实现**为准，不以旧空缺表或 README 宣称为准。Cursor 侧以 [docs](https://cursor.com/docs.md)、Agent / Cloud / Bugbot / MCP / Skills / CLI 文档为准，不把传闻或已改名功能当现货。  
> **前稿**：`docs/CURSOR_PARITY_2026-09-15.md` 是 9 月中旬的施工清单；A–E 已合入。本文取代其「现状结论」，旧空缺表不要再施工。

---

## 0. 一句话结论

Wanwu 已经是一台**能在本机跑通的 coding agent**：多轮工具循环、Ask / Plan / Agent / Verify、编辑与检索、`@` 上下文、检查点、Tab / Ctrl+K 雏形、MCP stdio、子代理 worktree、本地 / Docker runner。

Cursor 2026 的产品重心已经从「编辑器里的 Agent」变成 **Agent 操作系统**：Agents Window、Cloud Agents、Projects、Automations、Bugbot、MCP Apps / OAuth、Skills / 插件市场、iOS / Remote Control、企业治理。这不是同一量级。

| 维度 | 判断 |
|---|---|
| **本地日常改代码** | 主路径齐，招牌体验（Tab 深度、Debug、浏览器、工作流 UI、扩展宿主）明显更浅 |
| **平台 / 团队 / 异步** | Cursor 领先一个产品代际；Wanwu 的 `cloud` 是本机 worktree / Docker，不是托管 VM |
| **Wanwu 相对优势** | 多模型 BYOK 对等、ACP 原生、权限 / 沙箱显式、不绑单一厂商、可自建 runner |
| **不要对标的范围** | Cursor 托管模型池、计费、iOS、Origin git、Grok Bot、企业 SSO / CMEK、Bugbot 即服务 |

---

## 1. 产品形态

| | Cursor 3（2026-09） | Wanwu-Code |
|---|---|---|
| 桌面 | VS Code fork（完整扩展 / 调试器 / SCM）+ **Agents Window**（Agent 优先第二窗口） | 自研 Electron `apps/wanwu-shell`（Monaco + xterm + Lattice）。**不是** VS Code fork |
| CLI | 官方二进制 **`agent`**（Ask / Plan / Agent / Debug、MCP、worktree、转云） | 官方二进制 **`wanwu`**（TUI / headless / ACP）。红线：不要第二命令名 |
| 扩展宿主 | 自身就是 IDE；另通过 ACP 进 JetBrains / Neovim | 可选 `extensions/wanwu-vscode`（Webview 聊天，无侧栏 View）；Zed / JetBrains 仅文档接入 |
| Web / 移动 | `cursor.com/agents`、iOS App、Remote Control | 无 |
| 模型 | 托管池（Composer / Grok 等）+ 第三方 + Router；个人 BYOK 不耗池，团队 BYOK 仍收 Cursor Token Rate | **纯 BYOK**：openai / xai / anthropic / ollama / custom。无托管池、无 Router |
| 云任务 | 托管 Ubuntu VM + Builds + `environment.json` + 订阅唤醒 | `wanwu cloud`：本地 worktree runner、可选 Docker、可自建 HTTP + snapshot。无托管机房 |
| 品牌红线 | 自有模型与托管服务 | 禁止暗示 xAI / OpenAI / Anthropic 官方产品 |

Cursor 文档里这些名字已经改过，对照时不要用旧词当缺口：

| 旧称（不要再当现货） | 2026 官方 |
|---|---|
| Composer（界面） | **Agent**（Composer 2.5 是模型） |
| Background Agents | **Cloud Agents** |
| `@codebase` / `@web` / `@docs` / `@linter` | 工具替代：Instant Grep、Explore 子代理、Web、对话搜索、Tab 吃 lint |
| Max Mode | 仅遗留按次套餐；现行为用量制 + 显式上下文窗口 |
| IDE Memories 设置页 | 文档不再把它当一等功能；持久化走 Rules / `AGENTS.md` / Projects / Automations |

---

## 2. 总表（按用户路径）

图例：**✅** 主路径可用且语义接近 · **⚠️** 有实现但明显更浅或只在单一宿主 · **❌** 没有 · **⊘** 明确不作为本轮对标 / Cursor 已不再当招牌。

### 2.1 本地 Agent（日常写代码）

| 能力 | Cursor 2026 | Wanwu | 级 |
|---|---|---|---|
| 多轮工具循环 / 流式 / 取消 | Agent 无公开 tool-call 上限；Steer / 队列 | `runLlmAgentLoop`；默认 SSE（`WANWU_STREAM=0` 关）；ACP `session/cancel`；Shell 停 + 忙时排队。TUI 无中途取消键 | ✅ |
| 会话恢复 | 本地会话 + conversation search + fork | `.wanwu/sessions/`；ACP `session/list` + `load`；TUI `/resume`。无跨会话搜索、无 fork | ⚠️ |
| Agent / Ask / Plan | Shift+Tab；切模式**新开上下文**；Plan 可澄清、可编辑、Build Local / Cloud / Parallel | `ask` / `plan` / `agent` / `verify`；工具面按模式隐藏写工具；Plan 先探索再写 `.wanwu/plans/`；Shell「按此计划执行」。切模式**不**清上下文。无澄清问答 UI、无并行 Build | ⚠️ |
| Debug Mode | 假设 → 插桩 → 你复现 → 读日志 → 定点修 → 清桩 | **无** | ❌ |
| 自定义模式 | Agents Window / CLI 把 skill 钉在整段会话 | 无；skills 只注入 system | ❌ |
| 编辑工具 | 多文件、search/replace、Apply | `Edit` 块替换 + `Write`；`ask` 提案 / `accept-edits` 落盘 | ✅ |
| 只读探索 | Instant Grep（本地、官方称不上云索引）+ Explore 子代理 | `ListDir` / `Read` 行号分页 / `Glob` / `Grep` / `SearchCodebase`（embeddings，无 key 降级关键词）；只读可并行 | ⚠️ |
| Todo | 会话任务清单 | `Todo` → `.wanwu/todos/`；Shell 面板 + TUI | ✅ |
| Web | 内建 Web 工具 | `WebSearch`（DuckDuckGo / 可配）+ `WebFetch` | ✅ |
| 浏览器 / 计算机使用 | 内建浏览器（点选/截图/控制台）；Design Mode；云桌面 computer use | **无** | ❌ |
| 图像入 | 拖贴；iPad 手绘 | ACP images；TUI `/image`；Shell 粘贴/选图；`wanwu exec --image`。扩展无 | ⚠️ |
| 图像出 | Agent 生成图 / 资产 | **无**（`videoInput` 也明确未实现） | ❌ |
| 语音 | `Cmd+Shift+Space` | **无** | ❌ |
| @ 上下文 | `@file` `@folder` `@Terminals` `@Chats` `@Commit` `@Branch` `@Browser` `@rule` | `@file` `@folder/` `@git:status\|diff\|log` `@web:` `@terminal` `@diagnostics` `@codebase` `@selection`。无 `@Chats` / `@Browser` / `@Branch vs main` | ⚠️ |
| 打开编辑器 / 选区 | 自动进 Agent | Shell 真实 Monaco 选区 + 打开标签；扩展只 `collectEditorContext` | ⚠️ |
| Rules | `.cursor/rules` 四层（团队/项目/用户/`AGENTS.md`）+ `CLAUDE.md` | `.wanwu/rules` + `~/.wanwu/rules` + `WANWU.md` / `AGENTS.md` / `CLAUDE.md`。无团队强制层 | ⚠️ |
| 自动记忆 | 文档不再强调 IDE Memories；Automations / Projects / Bugbot 各有记忆 | 用户说「记住 / remember」才写入 `WANWU.md` | ⚠️ |
| 检查点 | 编辑前自动快照；时间线 Restore（只回文件） | turn 前备份；Shell 撤销 / `wanwu undo`。无消息时间线 fork | ⚠️ |
| 上下文压缩 / 用量 | 上下文环（system / tools / rules / 摘要） | `compactMessages`；`maxTurns` 25 / `maxTokens` 8192；TUI/Shell 显示本轮 token。无细拆环 | ⚠️ |
| Thinking | 聊天展示；CLI `/show-thinking`；effort | providers **无** thinking / reasoning 字段 | ❌ |
| 子代理 | Explore / Bash / Browser + 自定义 `.cursor/agents`；可 background；可云 | `Task`：`explore` / `plan` / `coder`；coder worktree + 互斥。无 Browser 子代理、无自定义 agent md、无 `/best-of-n` | ⚠️ |
| Worktree UI | Agents Window 原生；`/worktree` `/best-of-n` | CLI `wanwu parallel` + coder worktree。Shell **无** worktree 面板 | ⚠️ |
| Hooks | `hooks.json`（含 Tab / workspaceOpen）；可挡命令、可 LLM hook | `.wanwu/hooks.toml` 或 `hooks/<Event>*.sh`；Session/Tool/Subagent/Error 已接线。无 Tab hook、无 prompt-based hook | ⚠️ |
| 权限 | Auto-review（分类器 + 沙箱 + 白名单）；`permissions.json` | `ask` / `accept-edits` / `accept-all` + `.wanwu/permissions.toml` + ACP 弹窗 + `allow-session` | ✅ |
| OS 沙箱 | Seatbelt / Landlock+seccomp | `off` / `workspace` / `strict`：bwrap / seatbelt / docker。无 Windows 原生沙箱 | ⚠️ |
| Ignore | `.cursorignore` + 索引忽略 | workspace 边界 + gitignore 风格走查；**无** `.wanwuignore` 一等文件 | ⚠️ |

### 2.2 编辑器招牌（「像不像 Cursor」）

| 能力 | Cursor 2026 | Wanwu | 级 |
|---|---|---|---|
| **Tab** | 多行、吃 lint、逐词接受、**jump-in-file**、**跨文件 portal**；可按语言关 | Monaco 幽灵文本；防抖 300ms；前缀 3k / 后缀 800；FIM 或 chat 兜底。**单点插入，不读 lint，不跳下一处，不跨文件** | ⚠️ |
| **Ctrl+K 内联改** | 选区改写、追问、`Opt+Return` 提问、`Cmd+L` 升级到 Agent | 选区/整行 → 指令 → view-zone 预览 → 接受/拒绝。无追问、无升格 Agent | ⚠️ |
| 终端 Ctrl+K | 生成命令；`Cmd+Return` 可直接跑 | 生成命令插入，**不自动执行** | ✅ |
| 命令面板 / 搜索 / 分栏 / 多终端 / 文件监听 | VS Code 全家桶 | Shell 有 F1、搜索、分栏、多终端、chokidar。深度远低于 Code-OSS | ⚠️ |
| LSP | VS Code 扩展生态 | Shell 多语言 LSP（tsserver / rust-analyzer / pyright / gopls / clangd / vscode-html 等）+ Diagnose。无扩展市场 | ⚠️ |
| 调试器 | VS Code DAP + **Debug Mode**（运行时插桩） | **无 DAP、无 Debug Mode** | ❌ |
| SCM | 完整 Git + Agent Review + Blame（企业） | FileTree porcelain 标记 + `git:status`。无 commit UI、无 Agent Review、无 Cursor Blame | ⚠️ |
| 扩展生态 | VS Code Marketplace | 自研壳无；VS Code 扩展自身也不是侧栏产品 | ❌ |

### 2.3 MCP / Skills / 插件

| 能力 | Cursor 2026 | Wanwu | 级 |
|---|---|---|---|
| MCP tools | 一等 | stdio `tools/list` + `call` → `mcp__server__tool` | ✅ |
| MCP resources | 一等 | `resources/list` + `read` + `McpReadResource` | ✅ |
| MCP prompts | 一等 | **无** | ❌ |
| MCP Apps / Elicitation / Roots | 一等 | **无** | ❌ |
| 传输 | stdio / SSE / Streamable HTTP | **仅 stdio** | ⚠️ |
| OAuth / 远程登录 | 桌面 + Web 回调；`/mcp` 登录 | **无** | ❌ |
| 配置 UX | Customize / Marketplace / `mcp.json` 插值 | 文件 + `wanwu mcp-config` + TUI `/mcp` 只读列表。无 GUI 市场、无 `${env:}` 插值 | ⚠️ |
| Skills | `SKILL.md` 目录、内置 `/create-skill` 等、可 Sync 到 Cloud | `.wanwu/skills/*.md\|toml` 注入 system。无 skill 标准目录结构、无 `/skill` 命令 | ⚠️ |
| 插件 / 市场 | 官方审核市场 + 团队市场；规则/技能/MCP/hooks 打包 | `wanwu plugin *`；默认 `registry.wanwu.dev`（未证实上线）；离线即失败 | ⚠️ |

### 2.4 云 / 评审 / 团队（多数非本轮目标）

| 能力 | Cursor 2026 | Wanwu | 级 |
|---|---|---|---|
| Cloud Agents | 托管 VM、并行、关电脑继续跑、Move to Cloud、Artifacts | 本机 / Docker / 自建 HTTP。无托管编排、无桌面 computer use、无 iOS | ⊘ / ⚠️ |
| `environment.json` / Builds | 官方快照启动 | 无 Cursor 兼容格式；Docker 用自有 Dockerfile + entrypoint | ⚠️ |
| Projects 协调者 | 长期共享上下文、海量子代理、订阅 Slack/PR | **无** | ⊘ |
| Automations | cron / GitHub / Slack / Linear / Sentry… | **无** | ⊘ |
| Bugbot | PR 审查、learned rules、MCP、Autofix | **无** | ⊘ |
| Agent Review（本地未提交） | Quick / Deep | **无**（只有 Diff Review 接受 Agent 编辑） | ❌ |
| `/split-to-prs` `/autopilot` | 有 | 无。`wanwu cloud … --pr` 可开 draft PR，不拆 PR、不看 CI | ⚠️ |
| Slack / GitHub `@cursor` | 一等入口 | **无** | ⊘ |
| iOS / Remote Control | 有 | **无** | ⊘ |
| 企业 SSO / SCIM / CMEK / 审计 | 有 | **无**（单机 BYOK） | ⊘ |
| 用量 / 计费池 | Cursor Models vs Other Models；Teams $40/$120 | 无计费。token 仅状态栏估算 | ⊘ |

---

## 3. 分域说明（实现证据）

### 3.1 Agent 循环 — 骨架齐，深度不够

**已接线**：`packages/wanwu-cli/src/native/llmAgentLoop.ts` 多轮 tool-calling；默认流式；超长 `compactMessages`；回合上限可见提示；编辑后 `Diagnose`；只读工具 `Promise.all`（`parallelTools.ts`）。ACP：`initialize` / `session/new|list|load|cancel|prompt` + `session/request_permission`。

**浅于 Cursor 的点**：

- 无 Steer（下一次 tool 才插入指令）；队列只在 Shell，TUI 没有。
- 无 Debug Mode 插桩闭环。
- 无 thinking 展示。
- `maxTurns` 25 对长重构偏紧；Cursor 文档不设公开上限。
- `WorkflowMachine`（`packages/wanwu-workflow`）只被 `plan.ts` / `verify.ts` 各 new 一次，**没进 UI**，也没有 Explore→Plan→Approve→Act→Verify 单运行时编排。`VERIFY_ISOLATION` 只是常量。

### 3.2 模式 — 工具门控是真的，产品交互是假的

`modeTools.ts`：Ask 隐藏 Edit/Write/Task/Bash；Plan/Verify 隐藏 Edit/Write/Task。这是对的。

缺的是 Cursor Plan 的**产品面**：澄清问题、可编辑计划稿、Build Local / Cloud / Parallel、切模式清空上下文。Wanwu Plan 是「只读循环 + 写 markdown + 按钮切 Agent」。Verify 在 ACP 里走门禁脚本 + 可选 LLM 评审，不是独立污染隔离的 subagent 会话。

### 3.3 检索 — 和 Cursor 2026 叙事相反

Cursor 公开检索主叙事是 **本机 Instant Grep**，并写明不为搜索上传整仓、不为搜索存 embeddings（企业 CMEK 仍提到 embeddings，但不是 C 端招牌）。

Wanwu `SearchCodebase` **默认走 provider embeddings**（片段出域），无 key 才关键词倒排。这在隐私叙事上比现在的 Cursor 更「重」，也和 `AGENTS.md`「密钥只走环境变量」一致——但和「默认本机、默认不出域」不一致。索引在 `.wanwu/index/`。

`@codebase` 仍是 Wanwu 的一等 mention；Cursor 文档已不再把它列为 @ 语法。保留即可，不要写成「对标 Cursor @codebase」。

### 3.4 Tab / Ctrl+K — 有开关，不是招牌

`inlineComplete.ts`：任意语言幽灵文本，不读诊断、不预测下一处编辑、不跨文件。这是 2023–24 年「AI 补全」水位，不是 2026 Cursor Tab。

`inlineEdit.ts`：单次改写 + 预览。没有 follow-up、没有「把这次升格成 Agent」。

终端 Ctrl+K（`ai:terminalAsk`）语义接近：生成、插入、不自动跑。这是少数已经对齐的小点。

### 3.5 Shell vs 扩展：同一 runtime，两张脸

| | `apps/wanwu-shell` | `extensions/wanwu-vscode` |
|---|---|---|
| ACP 真连接 | ✅ | ✅（bundled / `wanwu.mjs` / tsx） |
| 流式聊天 | ✅ React Agent Studio | ⚠️ 往 `#log` 追加的 HTML |
| 停 / 排队 / 撤销 / Todo / 会话落盘 | ✅ | ❌ |
| @ / 贴图 / 全部接受 diff | ✅ | ❌（单 diff） |
| 侧栏 View | 自研 Orbit + Studio | **无** `contributes.views`，只靠命令打开面板 |
| Plan「按此计划执行」 | ✅ | 提示文案 |

品牌整机是 Shell。扩展仍是「能聊的 ACP 客户端」，不是 Cursor 级宿主。

### 3.6 云 — 名字像，货不对板

`packages/wanwu-cloud` 能：worktree 隔离、`plan` + `review.diff`、`--async` 本机子进程、`--docker`（`docker-runner.log`）、`--remote` HTTP + snapshot、`--pr` draft。`--docker` 在嵌套 overlay 失败时回退本地（`WANWU_DOCKER_REQUIRE=1` 拒绝回退）。

这解决的是「本机并行 / CI 可复现」，不是 Cursor Cloud Agents（关电脑、多用户、订阅唤醒、远程桌面、从 Slack 拉起）。文档和 UI 不得写成「已有 Cloud Agents」。

### 3.7 安全 — 本地不弱

权限文件 + 弹窗 + session 记忆 + 最小 env + realpath + 提案式 Edit，是 Wanwu 的长板。Cursor 的 Auto-review 分类器（小模型审命令）Wanwu 没有；Wanwu 用规则和人审。Windows 上 `strict` 没有 seatbelt/bwrap，只能 docker 或降级。

---

## 4. 宿主覆盖

| 宿主 | Cursor | Wanwu |
|---|---|---|
| 自有桌面 IDE | ✅ 完整 VS Code | ⚠️ 自研壳，无扩展市场 / 调试器 |
| CLI | ✅ `agent` | ✅ `wanwu` |
| VS Code（别人的编辑器） | 自身即是 | ⚠️ 扩展偏薄 |
| JetBrains / Neovim / Zed | ACP / 官方插件 | ⚠️ `docs/IDE_HOSTS.md` 配置说明，无维护插件 |
| Web / iOS / Slack / GitHub 评论 | ✅ | ❌ |
| SDK / Cloud API | `@cursor/sdk` | 自建 `wanwu cloud serve`，不是产品 SDK |

---

## 5. 仍建议做 vs 明确不做

按**本机用户体感**排序。每条都应是独立小 PR，不要把云基础设施和本地体验捆在一起。

### 值得做（本地，对「像 Cursor」有体感）

| 优先级 | 项 | 为什么 | 落点（示意） |
|---|---|---|---|
| P0 | **Debug Mode** | Cursor 修 runtime bug 的招牌路径；Wanwu 现在只能让模型瞎猜 | CLI 模式 + 插桩约定 + Shell 复现指引；先不做 DAP |
| P0 | **浏览器工具** | 前端改完不能自验；Cursor Design Mode 的前提 | 只读截图 / 导航 MVP，不要一上来 computer-use 桌面 |
| P1 | **Tab 第二跳 + 吃 lint** | 现在的幽灵文本不像 Cursor | `inlineComplete.ts` 读 LSP 诊断；接受后再请「下一处」 |
| P1 | **Ctrl+K 升格 Agent** | Cursor `Cmd+L` 是高频 | inlineEdit 把选区 + 指令丢进 AgentStudio |
| P1 | **MCP HTTP + OAuth** | 远程 MCP（Slack 等）是生态冷启动 | `mcp/client.ts` 增传输；OAuth 走本机回调，密钥不进仓 |
| P1 | **扩展侧栏 + 取消 / 恢复** | 有人只装扩展 | `package.json` views + 复用 acp-client 已有 cancel/load |
| P2 | **工作流进 UI** | Plan/Verify 现在是命令，不是状态机 | AgentStudio 展示 plan 稿 / verify 结果；不要重写 runtime |
| P2 | **会话搜索 / `@chats`** | 长用之后找旧对话 | 本地 `sessionStore` 倒排，不上云 |
| P2 | **未提交 Agent Review** | Diff Review 只审 Agent 提案，不审你手改的 git | 复用 `wanwu commit-msg` + Diagnose |
| P2 | **`.wanwuignore`** | 对齐「Agent/Tab/@ 不读」 | 索引 / Grep / @ 共用一处 ignore |
| P2 | **Thinking 透传** | 用户已在用带 reasoning 的模型 | providers 解析并在 TUI/Shell 折叠显示 |
| P3 | **Worktree 面板** | 并行 coder 现在是 CLI 才看得见 | Shell 列 `.wanwu/subagent-worktrees/` |
| P3 | **MCP prompts** | 协议已有，实现便宜 | `prompts/list` + `/mcp-prompt` |

### 明确不做（除非用户另开题）

- 托管 Cloud Agents / Projects / Automations / Bugbot
- iOS、Voice、图像生成、Grok Bot、Origin
- VS Code fork / 完整调试器 DAP（Debug Mode ≠ DAP）
- 企业 SSO / SCIM / CMEK / 计费池
- 插件市场商业化（`registry.wanwu.dev` 未上线就不要在 UI 里假装能装）
- 文档或 UI 暗示本产品为 Cursor / xAI / OpenAI / Anthropic 官方

---

## 6. 和 2026-09-15 审计的关系

当时结论是「缺 Tab / Ctrl+K / 索引三大招牌 + 约 15 处半成品」。这些已经落地（见 `CHANGELOG.md` Unreleased 与 `CURSOR_PARITY_2026-09-15.md` 文首）。

**不要再按旧空缺表施工。** 2026-09-21 的真实差距换成：

1. 招牌体验的**第二层**（Tab 跨文件 / Debug / 浏览器）  
2. MCP 从「stdio 工具」到「远程 + OAuth + prompts」  
3. 扩展宿主与工作流 UI  
4. 云 / 团队——承认不是一个产品，停止用 `cloud` 这个词暗示对等  

---

## 7. 证据索引（本仓）

| 子系统 | 路径 |
|---|---|
| Agent 循环 / 模式 / 提示 | `packages/wanwu-cli/src/native/llmAgentLoop.ts` `modeTools.ts` `agentPrompt.ts` |
| 工具 / 并行 / 检索 | `tools.ts` `toolDispatch.ts` `parallelTools.ts` `codebaseIndex/` |
| 权限 / 沙箱 | `permissions.ts` `permissionsFile.ts` `sandbox/` |
| ACP | `acpServer.ts`；客户端 `packages/wanwu-acp-client` |
| MCP | `packages/wanwu-cli/src/mcp/` |
| Shell | `apps/wanwu-shell/src/renderer/agent/AgentStudio.tsx` `editor/inlineComplete.ts` `inlineEdit.ts` |
| 扩展 | `extensions/wanwu-vscode/` |
| 云 | `packages/wanwu-cloud/` `apps/wanwu-cloud-runner/` |
| 工作流库 | `packages/wanwu-workflow/`（未进 UI） |

---

## 8. 建议阅读顺序

1. 本文 §0–§2（要不要继续对标、对标哪一层）  
2. §5（下一张小 PR 从哪撕）  
3. `docs/CURSOR_PARITY_2026-09-15.md` 只作 A–E 已交付清单  
4. `docs/PLAN.md` / `WANWU.md` 红线（CLI 名、多模型对等、不假冒官方）
