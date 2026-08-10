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
- [x] cloud runner stub 包（`@wanwu/cloud` InMemory）
- [x] CLI/扩展共用配置源（扩展通过 `wanwu inspect`）
- [ ] 真正多 session UI / 远程 runner（独立 epic）

## Phase 6 — Wanwu IDE Shell

- [x] 占位目录与说明（`apps/wanwu-ide`）
- [ ] Code-OSS 拉取 + patch（独立 epic）
- [ ] 预装 wanwu 扩展
- [ ] 品牌与默认布局

## Phase 7 — 演示与发布

- [x] `examples/failing-test-demo` + `scripts/demo-e2e.sh`
- [x] smoke scripts（`scripts/smoke-acp.sh`）+ CI 集成
- [x] VSIX 打包（`pnpm package:extension`）+ `CHANGELOG.md`
- [x] 手工测试清单（`docs/manual-test-extension.md`）
- [ ] GUI 录屏（需本机 VS Code/Cursor 手工）
- [ ] 独立 CLI 二进制发布（非 tsx 入口；后续）

## PR 拆分建议

1. 文档 + 骨架  
2. monorepo + CI  
3. CLI stub + config  
4. ACP 桥接  
5. 扩展聊天  
6. diff + permissions  
7. plan/verify  
8. demo + smoke  
