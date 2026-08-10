# Wanwu-Code 产品愿景

## 一句话

**Wanwu-Code** 是 AI 时代的 IDE：把自然语言意图“编译”为可验证的代码变更与工程操作。

## 问题

当前 AI 编程工具割裂：

- 终端 Agent（Grok Build / Claude Code / Codex CLI）强于自主执行，弱于可视化评审与调试集成
- 传统 IDE（VS Code）强于编辑/LSP/扩展生态，原生 Agent 编排不足
- 各家能力分散：沙箱、Plan Mode、云端并行、记忆与 hooks 无法在同一产品内闭环

开发者被迫在多个工具间切换，上下文、权限策略与工作流语义不一致。

## 解决方案

融合四家长所，做成统一产品：

| 来源 | 吸收 |
|---|---|
| Grok Build（开源） | 共享 Agent Runtime、ACP 嵌入、OS Sandbox、MCP/Skills/Hooks |
| VS Code / Code-OSS | 成熟编辑器体验与扩展生态 |
| OpenAI Codex | CLI/IDE/Cloud 配置统一、异步任务、并行 worktree、Review-first |
| Claude Code | Plan → Act → Verify、纯文本项目记忆、权限与 hooks 纪律 |

## 产品形态

1. **MVP**：`wanwu` CLI + VS Code Extension（ACP Client）
2. **中期**：本地并行 Agent + 云端异步 runner
3. **远期**：基于 Code-OSS 的 Wanwu IDE 整机发行版

## 非目标（当前不做）

- 自研编程语言编译器
- 自研基础模型训练
- 第一天就做完整 Electron IDE fork 维护
- 冒用 Grok / Claude / Codex 商标

## 成功标准（MVP）

- 新用户 < 10 分钟完成：安装扩展 → 配置任意一家模型密钥 → 修复一个 failing test 并 Verify 通过
- CLI 与 IDE 对同一任务语义一致
- 默认配置下危险操作必须确认
