# Wanwu-Code 路线图

## 已锁定决策

- CLI：`wanwu`
- MVP：扩展优先
- Agent：允许桥接开源 Grok Build ACP
- 模型：多模型对等
- 语义：AI-native IDE + Agent Runtime

## 发布状态

- **v1.0 beta**（tag `v1.0.0-beta`）已发 — 见 `CHANGELOG.md` 与 [GitHub Release](https://github.com/yipengcao-css/Wanwu-Code/releases/tag/v1.0.0-beta)  
- **CI 说明**：GitHub Actions 因账号额度/账单上限暂无法跑通；用户确认相关验收先行跳过，以本地测试 + Release 产物为准  
- **E2-A Native Agent**：已完成（默认 `wanwu-native` ACP）  
- **E2-SHELL**：已完成 MVP — 自研 Electron 壳，**抛弃 Code-OSS 产品路径**（[ADR 0005](./ADRs/0005-custom-electron-shell.md)）  
- **下一步默认 epic**：[`docs/EPIC2_BACKLOG.md`](./EPIC2_BACKLOG.md) 的 **E2-B 多模型 E2E**

## Phase 0 — 文档与决策

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
- [x] Docker runner（`wanwu cloud submit --docker`；嵌套 overlay 主机自动回退本地 worktree）

## Phase 6 — Wanwu IDE Shell（历史：Code-OSS；已退役）

- [x] 曾交付 Code-OSS 品牌化脚本与截图（归档）
- [x] **2026-08-11 退役**：改由 **E2-SHELL / `apps/wanwu-shell`** 作为品牌整机（见 ADR 0005）

## Phase 7 — 演示与发布

- [x] `examples/failing-test-demo` + `scripts/demo-e2e.sh`
- [x] smoke scripts（`scripts/smoke-acp.sh`）+ CI 集成
- [x] VSIX 打包（`pnpm package:extension`）+ `CHANGELOG.md`
- [x] 手工测试清单（`docs/manual-test-extension.md`）
- [x] GUI 截图（`wanwu-ide-desktop.png` 走查产物）
- [x] CLI 单文件 bundle（`pnpm build:cli` → `dist-bin/wanwu.mjs`；原生平台二进制仍可后续）
- [x] `docs/WORKFLOW.md` + `THIRD_PARTY_NOTICES`

## Post-1.0-beta

见 [`EPIC2_BACKLOG.md`](./EPIC2_BACKLOG.md)。优先级：

1. **E2-A Native Agent**（默认下一轮）  
2. E2-B 多模型 E2E  
3. E2-C 发行矩阵  
4. E2-D Cloud 编排  
5. E2-E 扩展商店  
6. E2-F IDE polish  

## PR 拆分建议（历史）

1. 文档 + 骨架  
2. monorepo + CI  
3. CLI stub + config  
4. ACP 桥接  
5. 扩展聊天  
6. diff + permissions  
7. plan/verify  
8. demo + smoke  
