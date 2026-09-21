# Changelog

## Unreleased

### Fixed
- **Windows `pnpm build:cli` / `shell:dev`**：生成 `dist-bin/wanwu.mjs` 改为 Node 脚本，不再依赖 `bash`（未装 Git Bash 时也能拉起 ACP）
- **Windows `shell:dev` ERR_CONNECTION_REFUSED**：等 Vite 在 `127.0.0.1:5173` 真正就绪再启动 Electron（不再固定睡 1.2s；避免 `localhost` IPv6 与 `127.0.0.1` 不一致）
- **Windows Vite `localhost` vs Electron `127.0.0.1`**：强制 `--host 127.0.0.1`；探测/重试两个地址，避免 IPv6-only `localhost` 导致窗口空白
- **WebFetch 权限超时**：Shell 用 `send` 回写 `session/request_permission`，避免卡在进行中的 `acp:prompt`；选项 id 改为 `allow-once`（兼容旧的 `allow_once`）；弹窗增加「本会话允许」
- **Coding agent（对标 Cursor）**：`ListDir` + `Read` 行号/分页；只读工具并行；`@codebase`；系统提示先读后改/改完验证；打开标签进上下文；Shell 停止、忙时排队、检查点撤销、多文件全部接受、Todo 面板、会话恢复、终端 Ctrl+K；设置可改权限模式
- **Ask/Plan/Verify 工具面**：模型请求里不再带 Edit/Write/Task（Ask 也不带 Bash）；Task 在只读模式被 dispatch 拒绝
- **Plan 先探索**：有密钥时 Plan 走只读 tool loop，再写入 `.wanwu/plans/`；Shell 提供「按此计划执行」
- **真实选区**：Agent 只带 Monaco 当前选区，不再误发文件头 500 字；`@selection`；命令面板「将选区加入 Agent」
- **作曲栏**：重试上一条；点击 provider/model 打开设置
- **Docker cloud runner**：容器内用 `npm i -g pnpm` 安装，避开 Node slim 自带 corepack 的 `Cannot find matching keyid`；worktree/commit 跳过 LFS hook（slim 镜像无 `git-lfs` 时 hook 会 exit 2）

### Added
- **Debug 模式**：假设 → WANWU_DEBUG 插桩 → 等用户复现 → 定点修 → 清理；`Debug` 工具；Shell 复现横幅。不是 DAP。
- **Browser 工具**：navigate / snapshot / screenshot（有 Chrome 则 PNG，否则文本快照）。无点击。
- **Tab 吃 lint + 下一处**：补全带上附近诊断；接受后跳到下一处 Error/Warning 再触发幽灵文本。
- **Ctrl+K 升格 Agent**：内联编辑「送到 Agent」把选区+指令丢进 Agent Studio。
- **MCP HTTP + OAuth**：`url` 走 JSON-RPC POST/SSE；`wanwu mcp-config login` 本机回调，token 只写 `~/.wanwu/mcp-oauth`。
- **扩展侧栏**：Activity Bar Agent 视图；停止 / 恢复会话；Debug 模式。
- **默认流式输出**：LLM 循环默认走 SSE（`WANWU_STREAM=0` 关闭）；TUI 状态栏显示 `stream=on` 与本轮 token 用量；Shell 回合完成后在状态栏显示 in/out tokens；TUI 将流式增量拼到同一行，避免刷屏
- **Shell @-mentions 补全**：Agent Studio 输入 `@` 弹出文件 / `@git:*` / `@web:` / `@terminal` / `@diagnostics` 列表；Tab/Enter 插入；终端最近输出与 LSP 诊断随 prompt 传给 ACP
- **扩展独立 ACP + 真 Diff**：VS Code 扩展不再依赖 `pnpm exec tsx`；按 bundled `wanwu-cli` / `dist-bin` / 仓库 `tsx` 入口拉起 ACP。Diff 审阅改为 `vscode.diff` 并排视图，接受时用 WorkspaceEdit 落盘
- **MCP resources**：stdio `resources/list` / `resources/read`；LLM 工具 `McpReadResource`
- **聊天贴图**：ACP `session/prompt` 接受 `images` / content-block 图像；TUI `/image`；Shell 粘贴/选图经 ACP 发送
- **自动记忆**：用户明确说「记住 / remember / always use」时写入 `WANWU.md` `## Learned`（`WANWU_AUTO_MEMORY=0` 关闭）
- **轻量 SCM**：Shell FileTree 显示 git porcelain 状态标记（M/A/D/?）
- **Cursor 对标 A2–E（已合入 #40–#56）**：上下文压缩与更高回合上限；providers 超时/重试/usage；Todo / WebFetch / WebSearch；@-mentions；代码库索引；Diagnose lint 闭环；分层 rules；Tab 补全与 Ctrl+K；检查点/undo；Shell 搜索/命令面板/多终端/全 LSP；allow-session 记忆与 hooks 全接线；TUI `/resume`；`wanwu commit-msg`
- **编辑工具重做（A1）**：`Edit` 改为 search/replace 块（多块、replace_all、行尾空白容错、未命中给 near-miss 提示）；新增 `Write` 工具（创建/覆写）；`accept-edits`/`accept-all` 模式直接落盘并回传 diff，`ask` 模式保持提案审阅；acp-client 只对 pending diff 触发审阅
- **IDE 深度集成**：VS Code 内联 diff（`vscode.diff` + WorkspaceEdit）；Quick Fix「用 Wanwu 修复」；Problems 桥接；ACP client 支持 `session/load` / `session/cancel`
- **丰富 hooks 生命周期**：SessionStart/SessionEnd/UserPromptSubmit/ToolCallApproved/ToolCallDenied/SubagentStart/SubagentEnd/Error；`.wanwu/hooks/*.sh` 按事件前缀发现
- **多模态输入**：`wanwu exec --image <path>` 附加图像；providers 支持 OpenAI/Anthropic 图像；`ContentPart` 类型与能力检测
- **真云端快照**：`wanwu cloud submit --remote --snapshot` 上传 git archive/tar.gz；服务端解包 + 校验 sha256 + 运行；`jobGraph` DAG 校验/拓扑排序
- **TUI 多 pane**：`composeFrame` 布局（chat + 工具时间线 + 状态栏）；`SessionView` 聚合；`WANWU_TUI_SIMPLE=1` 回退单行模式
- **IDE 宿主文档**：`docs/IDE_HOSTS.md` 覆盖 Zed / JetBrains ACP 接入；`ACP_INTEGRATION.md` 更新
- **MCP 对话式配置**：`wanwu mcp-config list/add/remove`；TUI `/mcp` 查看已配置 server
- **子代理 worktree 隔离**：coder 子代理在 `.wanwu/subagent-worktrees/` 独立运行；结果保留供 review
- **通用 Verify**：按项目类型自动选择门禁（pnpm/npm/yarn/cargo/go/python）；无匹配时安全跳过
- **TUI 主题与状态栏**：`WANWU_TUI_THEME=default|mono|highContrast`；`/status` 显示模式/provider/工作区
- **权限规则文件**：`.wanwu/permissions.toml` 支持 `allow` / `ask` / `deny` 规则；覆盖内建策略；`gateToolCall` 优先匹配
- **云端容器执行**：`wanwu cloud run/submit --docker` 使用容器运行任务（`--network none`）；产出 `review.diff`；不自动合并
- **流式 providers**：`streamChat` 支持 OpenAI-compat SSE 与 Anthropic SSE；`runLlmAgentLoop` 可通过 `WANWU_STREAM=1` 或 `stream: true` 启用文本增量输出
- **会话管理**：ACP `session/load` 恢复历史；`session/cancel` 中止进行中的 LLM 回合；会话持久化到 `.wanwu/sessions/`
- **真实 OS sandbox**：`config.sandbox` 接入 Bash 执行；Linux `bwrap` / macOS `sandbox-exec` / Docker 后端；`strict` 无网络；doctor 报告后端可用性
- **子代理并行**：LLM 工具 `Task` 支持 `explore` / `coder` / `plan` 子代理；隔离上下文；并行聚合结果；coder 串行防编辑竞态
- **benchmark 套件**：`pnpm bench` / `scripts/bench/run-all.mts`；CLI 启动、工具延迟、ACP 握手、产物大小；CI 软门控上传 `bench-results/latest.json`
- **TUI 增强**：工具时间线（状态图标）、diff 渲染（红绿行）、`/history` 会话历史、`Ctrl+T` 循环切换模式、`/ask|/plan|/agent|/verify` 快捷切换
- **真云端 MVP**：`wanwu cloud serve` 启动 HTTP runner；`submit/status/logs/diff --remote <url>` + `WANWU_CLOUD_TOKEN`；`HttpCloudClient`
- **插件市场 MVP**：`wanwu plugin list/search/show/install/remove`；支持 skills 与 MCP 配置；sha256 校验 + 信任等级门控；`docs/PLUGINS.md`
- **性能**：CLI 子命令懒加载（`wanwu help/doctor` 启动更快）；Glob/Grep 缓存 glob 正则；Shell 懒加载 Monaco/DiffReview；electron-builder 排除原始 monaco/typescript 依赖
- **多语言 LSP**：Shell 支持 rust-analyzer / pyright / gopls / clangd / vscode-langservers（PATH 解析）；`.wanwu/lsp.toml|json` 可覆盖；`WANWU_LSP_<ID>_COMMAND` 环境变量
- **P3 文档对齐**：`WANWU.md` / `PLAN.md` / `ROADMAP.md` / ADR 0001-0002 与现状同步；README 能力表更新
- **P2 体验/生态**：`wanwu` 默认进入交互 TUI（`/mode` `/plan` `/verify` `/doctor` `/inspect`）；VS Code 扩展默认关 mock 接真实 ACP；hooks 注入 `WANWU_TOOL_NAME` / `WANWU_TOOL_ARGS`；`wanwu cloud submit --async` 后台任务 + `status` 运行标记
- **MCP 工具面**：`.wanwu/mcp.toml|json` / `.mcp.json` → stdio JSON-RPC client；工具名 `mcp__server__tool` 接入 LLM loop + `dispatchTool`（hooks 门禁）；`docs/MCP.md`
- **Shell LSP（TS/JS）**：stdio `typescript-language-server` → Monaco markers；`docs/LSP.md`；`WANWU_TSSERVER_COMMAND` 可覆盖
- **签名分发（mac）**：`afterSign` 公证钩子（`APPLE_*` / `CSC_*` 密钥门控）；`docs/SIGNING.md`；release `desktop-mac` job 上传 mac zip
- **P0 安全修复**：Edit 改为 propose-then-apply（Shell 接受才落盘）；Plan/Ask 真正拦截非只读 Bash；Bash 默认最小 env（剥离 `*_API_KEY` 等，`WANWU_BASH_ENV=full` 可恢复）；workspace 路径 realpath 校验
- **P1 Agent 质量**：native ACP `session/request_permission` 门控 Bash/Edit；Anthropic provider 支持 tool_use/tool_result；Plan 可由 LLM 生成（无 key 回退模板）；Verify 增加独立 LLM 评审；`.wanwu/skills` 加载进 Agent 上下文
- **Diff Review**：Shell 用 Monaco 并排 Diff 审阅 Agent 编辑（取代纯文本 modal）
- **多会话 UI**：Agent Studio 会话轨 + `acp:newChat` / `acp:setSession`
- **Hooks**：native `dispatchTool` 接入 PreToolUse / PostToolUse（失败可阻断）
- **商业 UI**：引入 GitHub UI skills（frontend-design / ui-design-brain / effective-ui-design）；Welcome Gate + Settings 抽屉（BYOK）；Lattice token/焦点/reduced-motion 精修
- `@wanwu/config`：`saveUserConfig` / `credentials.env`（密钥不进仓库）；Shell ACP 启动注入凭据
- **Agent**：ACP session 跨 prompt 保留 LLM transcript；Plan 写入 `.wanwu/plans/*.plan.md`；Verify 跑隔离 typecheck/test/lint（stdout 静默，ACP 安全）
- **P0-1**：Wanwu Shell 安装包随附 `wanwu-cli` ACP（`resources/wanwu-cli`）；启动改为原生二进制 / `wanwu.mjs`，不再依赖 `pnpm`/`tsx` 与 monorepo 根
- **P0-2**：Wanwu Shell 集成终端改用 `node-pty` 真 PTY；Windows 解析 `pwsh`→`powershell`→`cmd`，去掉 `SHELL||/bin/bash` 写死
- **P0-3**：切换工作区时销毁并重建 ACP session（打破单例、重置 `WANWU_WORKSPACE_ROOT`）；终端随工作区重启
- **E2-F+**：Shell 分栏/热键 polish；LLM 多轮 tool-calling；`pnpm shell:dist` 三平台桌面包（AppImage / Win zip / mac zip）
- **E2-D Cloud 编排**：`wanwu cloud orchestrate` 并发多 worktree；`--pr`/`--pr-dry-run` draft PR；`docs/CLOUD.md`
- Runner 隔离修复：plan/review 写入任务 worktree
- **E2-C 发行矩阵**：`pnpm build:cli:native`（linux/macOS/win）、`scripts/install.sh` / `install.ps1`、`docs/INSTALL.md`、`SHA256SUMS`
- 打包二进制内建 `--wanwu-internal-acp`（无需 tsx/monorepo）
- **E2-B `@wanwu/providers`**：OpenAI-compat + Anthropic；fixture 矩阵；`wanwu exec` BYOK LLM 路径
- `docs/PROVIDERS.md`、`scripts/e2e-providers-live.mts`；doctor 多 provider 修复建议
- 支持 `OPENAI_BASE_URL` / `WANWU_MODEL`（DeepSeek / Moonshot 等兼容代理）
- **E2-SHELL**：自研 Electron 桌面壳 `apps/wanwu-shell`（Wanwu Lattice UI + Monaco + xterm + wanwu-native ACP）
- 共享包 `@wanwu/acp-client`；扩展改为依赖该包
- `docs/DESIGN_SYSTEM.md`、`docs/ADRs/0005-custom-electron-shell.md`

### Changed
- **退役** Code-OSS 整机路径（`apps/wanwu-ide` DEPRECATED）；品牌整机改为自研壳

### Previously
- **E2-A wanwu-native ACP**：默认 `acp_backend=wanwu-native`，无 grok 也可握手 + 工具回合（Read/Edit/Bash/Glob/Grep）
- `scripts/acp-handshake-native.mts` + smoke 集成；`wanwu exec` 走确定性 native loop

## 1.0.0-beta — 2026-08-11

Wanwu-Code **v1.0 beta** — 首个对外预发布。

### Added
- Product blueprint: vision, architecture, competitive analysis, ADRs, roadmap
- `wanwu` CLI: `doctor`, `inspect`, `acp`, `exec`, `plan`, `verify`, `check-perm`, `hooks`, `memory-writeback`, `parallel`, `cloud`
- Grok Build ACP bridge (`acp_backend=grok`) with `WANWU_ACP_COMMAND` override + mock ACP for local smoke
- Multi-model config schema (xAI / OpenAI / Anthropic / Ollama / custom)
- VS Code extension: Wanwu Chat, Ask/Plan/Agent/Verify, Diff Review, permissions, multi-session
- Deny-first permission matcher and runnable hooks
- `examples/failing-test-demo` + smoke/demo scripts
- Parallel worktree isolation (`wanwu parallel demo`)
- Cloud headless runner: local worktree + Docker (`--docker`)
- `WANWU_DOCKER_REQUIRE=1` to refuse nested-overlay fallback (CI pure-docker gate)
- Code-OSS branded Wanwu IDE shell scripts + builtin extension install
- Packaging: VSIX + CLI single-file bundle; GitHub Release workflow on `v*` tags
- `docs/EPIC2_BACKLOG.md` — next epic prioritized on **E2-A Native Agent**

### Known limitations
- Real Grok binary optional; mock ACP covers local CI smoke
- Nested Docker/overlay hosts may fall back to local runner unless `WANWU_DOCKER_REQUIRE=1`
- VS Marketplace / Open VSX publishing not included in this beta
- Native platform installers and deep grok-build vendor are Post-beta (see Epic 2)

## 0.1.0 — 2026-08-10

Internal development milestone (superseded by 1.0.0-beta numbering for the public pre-release).
