# ADR 0005：品牌整机采用自研 Electron 壳（抛弃 Code-OSS 产品路径）

## 状态

已接受（2026-08-11）

## 背景

Phase 6 曾以 Code-OSS 品牌化作为整机路径。产品外观仍高度近似 Visual Studio Code Workbench，存在商标/trade dress 近似风险，且无法交付差异化的 Agent-first 信息架构。用户明确要求：**立刻抛弃 Code-OSS，自研 Electron 壳**。

## 决策

1. **品牌桌面应用**实现为 `apps/wanwu-shell`（Electron + React + Monaco + 自研 Lattice UI）。
2. **Code-OSS**（`apps/wanwu-ide`）从产品主路径 **退役**：不再作为默认构建/验收/发布目标。
3. **monaco-editor** 仅用作编辑器内核，不引入 VS Code Workbench / Activity Bar / 产品图标体系。
4. Agent 通过现有 **wanwu-native ACP**（stdio）接入；共享协议 client 放在 `packages/wanwu-acp-client`。
5. `extensions/wanwu-vscode` **保留为可选宿主适配器**（VS Code / Cursor 用户），不再代表「整机产品」。

本 ADR **部分取代** [ADR 0002](./0002-ide-strategy-extension-first.md) 中「Phase 6 = Code-OSS 整机」的表述；扩展优先作为 *可选宿主* 策略仍然有效。

## 后果

**正面**

- UI 可与 VS Code 结构级区分（Orbit 顶栏、Agent Studio、非 VS 蓝强调色）
- 布局与快捷键完全可控，利于 AI-native 工作流
- 许可证归因清晰：Monaco/Electron 开源组件 + Wanwu 原创壳

**负面 / 风险**

- 失去开箱 LSP/Debug/扩展生态，需分期补齐
- Electron 打包与升级需自维
- 短期功能面小于 Code-OSS 套壳

## 替代方案（否决）

- **继续 Code-OSS 深度换肤**：无法满足「与 VS Code 完全不同」的硬性要求
- **Tauri + Monaco**：生态与 node 工具链集成成本本轮偏高，可后续评估
