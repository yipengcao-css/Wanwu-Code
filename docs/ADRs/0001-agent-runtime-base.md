# ADR 0001：Agent Runtime 以开源 Grok Build ACP 桥接为底座

## 状态

已接受（2026-08-10）；**2026-08-12 部分更新**：默认运行时已是 `wanwu-native`（TS），grok 桥接为可选路径。

## 背景

Wanwu-Code 需要可用的 coding agent harness（工具、权限、会话、MCP、沙箱）。从零自研成本高；`xai-org/grok-build` 已开源（Apache-2.0）并原生支持 ACP。

## 决策

1. MVP 阶段 **允许桥接/复用** 开源 Grok Build 的 ACP 入口。
2. 对外统一暴露 `wanwu` CLI（`wanwu acp` / `wanwu exec` / `wanwu doctor`）。
3. 在桥接层叠加 Wanwu 配置、记忆与 Plan/Verify 工作流，而不是直接要求用户使用 `grok` 品牌命令作为唯一入口。
4. 当桥接无法满足多模型对等或深度定制时，再 vendor/裁剪关键 crate，迁移到 `wanwu-native`。

> **现状（2026-08-12）**：`wanwu-native` 已成为默认 ACP 后端；grok 桥接保留为可选（`acp_backend = "grok"` 或 `WANWU_ACP_COMMAND`）。

## 后果

**正面**

- 最快获得可嵌入 IDE 的 agent 能力
- 继承成熟 sandbox / tools / MCP 设计
- 许可证友好（Apache-2.0）

**负面 / 风险**

- 依赖上游行为与安装可用性
- 品牌与能力边界需仔细隔离（NOTICE、去商标）
- 多模型对等可能受桥接后端限制 → 需 provider 层补齐

## 替代方案（否决）

- **完全自研 loop**：工期过长，MVP 不可达
- **第一天完整 fork grok-build**：维护负担过大
