# WANWU.md — 项目记忆

## 项目

- 名称：Wanwu-Code（万物 Code）
- CLI：`wanwu`
- 目标：AI-native IDE（意图 → 可验证代码变更）

## 架构记忆（2026-08-12 更新）

- **品牌整机**：`apps/wanwu-shell` 自研 Electron + Monaco（ADR 0005）；Code-OSS 路径已退役
- **可选宿主**：`extensions/wanwu-vscode` 仍可用，默认接真实 `wanwu acp`（非 mock）
- **Agent 底座**：默认 `wanwu-native` ACP；允许桥接开源 Grok Build ACP
- **协议**：ACP（编辑器↔Agent）、MCP（外部工具，见 `docs/MCP.md`）、LSP（Shell TS/JS，见 `docs/LSP.md`）
- **工作流**：Explore → Plan → Act → Verify → Commit；Plan 可由 LLM 生成；Verify 含独立评审
- **配置**：`~/.wanwu/config.toml` + 工作区 `.wanwu/`；密钥走 `credentials.env`

## 决策记忆（勿擅自推翻）

1. CLI 叫 `wanwu`
2. 品牌整机为 `apps/wanwu-shell`（扩展为可选宿主）
3. 允许复用 grok-build ACP
4. 多模型对等
5. 非语言编译器

## 工程偏好

- 小步提交并推送；一个逻辑变更一次提交
- 危险操作默认 ask 权限；Edit 先 propose 后 apply
- 纯文本 skills/hooks；hooks 带 `WANWU_TOOL_NAME` / `WANWU_TOOL_ARGS`
- 文档与代码同步；避免“宣称 > 实现”

## Learned

- (2026-08-10) Verify must stay isolated from Act context
- (2026-08-12) Edit must be propose-then-apply; never write before review
- (2026-08-12) Bash spawns with minimal env by default
