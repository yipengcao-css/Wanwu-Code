# Changelog

## Unreleased

### Added
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
