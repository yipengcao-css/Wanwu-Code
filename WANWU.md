# WANWU.md — 项目记忆

## 项目

- 名称：Wanwu-Code（万物 Code）
- CLI：`wanwu`
- 目标：AI-native IDE（意图 → 可验证代码变更）

## 架构记忆

- Extension-first：`extensions/wanwu-vscode` 是 MVP 脸面
- Agent：优先桥接开源 Grok Build ACP（`acp_backend = "grok"`）
- 协议：ACP（编辑器↔Agent）、MCP（外部工具）、LSP（语言）
- 工作流：Explore → Plan → Act → Verify → Commit
- 配置：`~/.wanwu/config.toml` + 工作区 `.wanwu/`

## 决策记忆（勿擅自推翻）

1. CLI 叫 `wanwu`
2. 扩展优先
3. 允许复用 grok-build ACP
4. 多模型对等
5. 非语言编译器

## 工程偏好

- 文档与骨架先行，再实现 CLI/扩展
- 小步提交并推送
- 危险操作默认 ask 权限
- 纯文本 skills/hooks，不上复杂向量库（除非另有决策）

## Learned

- (2026-08-10) Verify must stay isolated from Act context
