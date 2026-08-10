# Wanwu-Code 路线图

## 已锁定决策

- CLI：`wanwu`
- MVP：扩展优先
- Agent：允许桥接开源 Grok Build ACP
- 模型：多模型对等
- 语义：AI-native IDE + Agent Runtime

## Phase 0 — 文档与决策（当前）

- [x] 产品愿景 / 架构 / 竞品 / 路线图
- [x] ADR：runtime 底座、扩展优先、多模型
- [x] README / AGENTS.md / WANWU.md / 目录骨架

## Phase 1 — Monorepo 基线

- [x] pnpm workspace + TS packages
- [x] 最小 lint/test/typecheck
- [x] GitHub Actions CI
- [x] `crates/README.md` 说明桥接策略

## Phase 2 — `wanwu` CLI + ACP 桥接

- [x] `wanwu doctor` / `inspect` / `acp` / `exec`
- [x] 桥接 `grok` ACP（可检测未安装并提示；`WANWU_ACP_COMMAND` 可覆盖）
- [x] `~/.wanwu/config.toml` + `.wanwu/settings.toml` 多 provider schema
- [x] Memory 发现：`WANWU.md` / `AGENTS.md` / `CLAUDE.md`

## Phase 3 — VS Code 扩展 MVP

- [x] ACP Client 聊天面板（Webview）+ mock ACP 联调
- [x] Diff Review + 权限弹窗（已挂到 mock tool/edit 事件；真实 grok 事件同协议）
- [x] Ask / Plan / Agent / Verify 模式（提示词前缀；UI 可切换）
- [x] 编辑器上下文注入（选区、打开文件、diagnostics）

## Phase 4 — Workflow 产品化

- [x] Plan artifact（`wanwu plan -p ...` → `.wanwu/plans/*.plan.md`）
- [x] Verify 固定流水线（`wanwu verify`：typecheck/test/lint，状态机隔离）
- [x] Hooks 示例目录（`.wanwu/hooks/`，运行时加载待续）
- [x] Memory writeback（`wanwu memory-writeback -p ... [--yes]`）
- [x] Hooks 可运行示例（`.wanwu/hooks.toml` + `wanwu hooks`）

## Phase 5 — 并行与云端

- [x] 本地 worktree 辅助脚本（`scripts/parallel-worktree.sh`）
- [x] 并行隔离验证（`wanwu parallel demo` + 单测）
- [x] 本地 headless cloud runner（`wanwu cloud submit --run`，review-first 不合并）
- [x] CLI/扩展共用配置源（扩展通过 `wanwu inspect`）
- [x] 扩展多 session UI（`Wanwu: New Parallel Session` / `List Sessions`）
- [ ] 远程 docker runner（后续增强）

## Phase 6 — Wanwu IDE Shell

- [x] 占位目录与说明（`apps/wanwu-ide`）
- [x] Code-OSS 拉取脚本（`WANWU_FETCH_CODE_OSS=1` 守护，默认不下载）
- [x] 品牌 `product.json` + `apply-branding.sh`
- [x] 预装扩展脚本（`install-wanwu-extension.sh`）
- [x] 完整 compile + Electron 预启动（本环境已验证 `wanwu-code` 二进制与 xvfb 启动）
- [x] `scripts/bootstrap-and-compile.sh` / `launch.sh` / `smoke-ide-tree.sh`
- [x] GUI 截图证据（xvfb 下启动 Wanwu IDE 打开 demo 工程）

## Phase 7 — 演示与发布

- [x] `examples/failing-test-demo` + `scripts/demo-e2e.sh`
- [x] smoke scripts（`scripts/smoke-acp.sh`）+ CI 集成
- [x] VSIX 打包（`pnpm package:extension`）+ `CHANGELOG.md`
- [x] 手工测试清单（`docs/manual-test-extension.md`）
- [x] GUI 截图（`wanwu-ide-desktop.png` 走查产物）
- [x] CLI 单文件 bundle（`pnpm build:cli` → `dist-bin/wanwu.mjs`；原生平台二进制仍可后续）
- [x] `docs/WORKFLOW.md` + `THIRD_PARTY_NOTICES`

## PR 拆分建议

1. 文档 + 骨架  
2. monorepo + CI  
3. CLI stub + config  
4. ACP 桥接  
5. 扩展聊天  
6. diff + permissions  
7. plan/verify  
8. demo + smoke  
