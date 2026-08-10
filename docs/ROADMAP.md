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
- [x] Diff Review + 权限弹窗（Demo 命令可用；待挂到真实 tool 事件）
- [x] Ask / Plan / Agent / Verify 模式（提示词前缀；UI 可切换）
- [ ] 编辑器上下文注入（选区、打开文件、diagnostics）

## Phase 4 — Workflow 产品化

- [ ] Plan artifact
- [ ] Verify subagent / 固定流水线
- [ ] Hooks 示例
- [ ] Memory writeback（用户确认后）

## Phase 5 — 并行与云端

- [ ] 本地 worktree 多 session
- [ ] cloud runner stub
- [ ] 统一配置贯通 CLI/IDE/Cloud

## Phase 6 — Wanwu IDE Shell

- [ ] Code-OSS 拉取 + patch
- [ ] 预装 wanwu 扩展
- [ ] 品牌与默认布局

## Phase 7 — 演示与发布

- [ ] `examples/failing-test-demo`
- [ ] smoke scripts + 录屏
- [ ] VSIX / CLI 发布物 + CHANGELOG

## PR 拆分建议

1. 文档 + 骨架  
2. monorepo + CI  
3. CLI stub + config  
4. ACP 桥接  
5. 扩展聊天  
6. diff + permissions  
7. plan/verify  
8. demo + smoke  
