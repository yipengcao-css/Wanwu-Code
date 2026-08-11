# ADR 0002：IDE 策略采用 Extension-first

## 状态

已接受（2026-08-10）

## 背景

完整 Code-OSS fork（Electron 整机）能控制品牌与默认布局，但构建链、升级同步与发布矩阵成本极高。VS Code / Cursor 用户已有宿主编辑器。

## 决策

1. **MVP 只做** `extensions/wanwu-vscode`（ACP Client）。
2. 通过扩展验证：聊天、Plan/Act/Verify、Diff Review、权限、配置统一。
3. **Phase 6** 再启动 `apps/wanwu-ide`（Code-OSS 拉取 + patch + 预装扩展）。

## 后果

**正面**

- 最快接触真实用户工作流
- 可同时覆盖 VS Code 与兼容宿主（如 Cursor）
- 避免过早背负 IDE fork 维护

**负面 / 风险**

- 宿主限制（UI 深度、部分 API）
- 品牌整机体验延后
- 需测试多宿主差异

## 替代方案（否决）

- **整机优先**：阻塞 Agent/工作流验证，风险过高
