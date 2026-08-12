# Wanwu-Code 路线图

## 已锁定决策

- CLI：`wanwu`
- 品牌整机：`apps/wanwu-shell` 自研 Electron（ADR 0005）；Code-OSS 已退役
- 可选宿主：VS Code / Cursor 扩展
- Agent：默认 `wanwu-native`；允许桥接开源 Grok Build ACP
- 模型：多模型对等
- 语义：AI-native IDE + Agent Runtime

## 发布状态

- **v1.0 beta**（tag `v1.0.0-beta`）已发 — 见 `CHANGELOG.md` 与 [GitHub Release](https://github.com/yipengcao-css/Wanwu-Code/releases/tag/v1.0.0-beta)
- **CI 说明**：GitHub Actions 因账号额度/账单上限暂无法跑通；以本地测试 + Release 产物为准
- **E2-A Native Agent**：完成（默认 `wanwu-native` ACP）
- **E2-SHELL**：完成 MVP — 自研 Electron 壳（ADR 0005）
- **E2-B**：完成 — `@wanwu/providers`；DeepSeek + Moonshot live
- **E2-C**：完成 — 跨平台 CLI 二进制 + 安装脚本（`docs/INSTALL.md`）
- **E2-D**：完成 — Cloud 多任务编排 + draft PR（`docs/CLOUD.md`）
- **E2-F+**：完成 — Shell polish + 多轮 tool-calling + Desktop 三平台安装包
- **E2-E**：用户跳过扩展商店
- **商业就绪续作**：MCP / LSP / 签名 / P0-P2 已合入（见 `EPIC2_BACKLOG.md`）

## Phase 0 — 文档与决策

- [x] 产品愿景 / 架构 / 竞品 / 路线图
- [x] ADR：runtime 底座、扩展优先、多模型、自研壳
- [x] README / AGENTS.md / WANWU.md / 目录骨架

## Phase 1 — Monorepo 基线

- [x] pnpm workspace + TS packages
- [x] 最小 lint/test/typecheck
- [x] GitHub Actions CI
- [x] `crates/README.md` 说明桥接策略

## Phase 2 — `wanwu` CLI + ACP

- [x] `wanwu doctor` / `inspect` / `acp` / `exec` / `plan` / `verify`
- [x] 默认 `wanwu-native` ACP；可桥接 `grok`（`WANWU_ACP_COMMAND` 可覆盖）
- [x] `~/.wanwu/config.toml` + `.wanwu/settings.toml` 多 provider schema
- [x] Memory 发现：`WANWU.md` / `AGENTS.md` / `CLAUDE.md`
- [x] TUI：`wanwu` 无子命令进入交互界面

## Phase 3 — VS Code 扩展（可选宿主）

- [x] ACP Client 聊天面板（Webview）
- [x] Diff Review + 权限弹窗
- [x] Ask / Plan / Agent / Verify 模式
- [x] 默认接真实 `wanwu acp`（`useMockAcp=false`）

## Phase 4 — Workflow 产品化

- [x] Plan artifact（LLM 生成或模板回退）
- [x] Verify 固定流水线 + 独立 LLM 评审
- [x] Hooks（`PreToolUse`/`PostToolUse`，带 `WANWU_TOOL_NAME`/`WANWU_TOOL_ARGS`）
- [x] Memory writeback

## Phase 5 — 并行与云端

- [x] 本地 worktree 辅助脚本
- [x] 并行隔离验证
- [x] 本地 headless cloud runner（review-first）
- [x] `wanwu cloud submit --async` 后台任务
- [x] Docker runner

## Phase 6 — Wanwu IDE Shell（自研 Electron）

- [x] `apps/wanwu-shell` MVP
- [x] Monaco + xterm + ACP chat + Diff Review
- [x] TS/JS LSP → Monaco markers
- [x] mac 签名/公证密钥门控

## Phase 7 — 演示与发布

- [x] `examples/failing-test-demo` + `scripts/demo-e2e.sh`
- [x] smoke scripts + CI 集成
- [x] VSIX 打包 + CHANGELOG
- [x] CLI 单文件 bundle + 原生矩阵

## Post-1.0-beta

见 [`EPIC2_BACKLOG.md`](./EPIC2_BACKLOG.md)。已完成：

1. E2-A Native Agent
2. E2-B 多模型 E2E
3. E2-C 发行矩阵
4. E2-D Cloud 编排
5. E2-F+ Shell polish
6. 商业就绪：MCP / LSP / 签名 / P0 安全 / P1 Agent 质量 / P2 体验

**下一步**：由用户点名（如性能、多语言 LSP、插件市场、真云端）。
