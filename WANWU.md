# WANWU.md — 项目记忆

## 项目

- 名称：Wanwu-Code（万物 Code）
- CLI：`wanwu`
- 目标：AI-native IDE（意图 → 可验证代码变更）

## 架构记忆（2026-09-18 更新）

- **品牌整机**：`apps/wanwu-shell` 自研 Electron + Monaco（ADR 0005）；Code-OSS 路径已退役
- **可选宿主**：`extensions/wanwu-vscode`，默认接真实 `wanwu acp`（非 mock）
- **Agent 底座**：默认 `wanwu-native` ACP；允许桥接开源 Grok Build ACP
- **协议**：ACP（编辑器↔Agent）、MCP（外部工具，stdio tools，见 `docs/MCP.md`）、LSP（Shell 多语言，见 `docs/LSP.md`）
- **工作流**：Explore → Plan → Act → Verify → Commit；Plan 可由 LLM 生成；Verify 含独立评审
- **配置**：`~/.wanwu/config.toml` + 工作区 `.wanwu/`；密钥走 `credentials.env`
- **工具**：Read（行号 + offset/limit）/ ListDir / Glob / Grep / Edit / Write / Bash / Todo / WebFetch / WebSearch / Browser / Debug / Diagnose / SearchCodebase / Task
- **编辑落盘**：`ask` 只提案（宿主 Diff 接受才写）；`accept-edits` / `accept-all` 在权限通过后直接写盘并打检查点
- **上下文**：打开标签 + **真实选区** 进 system；`@codebase` / `@selection`；只读工具可并行
- **模式工具面**：Ask/Plan/Verify 不向模型暴露写工具；Debug 可插桩但须标 WANWU_DEBUG 并在 cleanup 删除；Plan 可先探索再出计划，UI「按此计划执行」
- **会话**：ACP `session/list` + `session/load`；Shell 侧栏可恢复 `.wanwu/sessions/`

## 决策记忆（勿擅自推翻）

1. CLI 叫 `wanwu`
2. 品牌整机为 `apps/wanwu-shell`（扩展为可选宿主）
3. 允许复用 grok-build ACP
4. 多模型对等
5. 非语言编译器

## 工程偏好

- 小步提交并推送；一个逻辑变更一次提交
- 危险操作默认 ask 权限
- 纯文本 skills/hooks；hooks 带 `WANWU_TOOL_NAME` / `WANWU_TOOL_ARGS`
- 文档与代码同步；避免“宣称 > 实现”

## Learned

- (2026-08-10) Verify must stay isolated from Act context
- (2026-08-12) `ask` 模式 Edit/Write 先提案再 apply；`accept-edits`/`accept-all` 可直接落盘
- (2026-08-12) Bash spawns with minimal env by default
- (2026-09-15) Cursor 对标 A–E 已合入
- (2026-09-18) 流式默认开、Shell @、扩展独立 ACP、MCP resources、贴图、自动记忆、轻量 SCM 已落地
- (2026-09-21) Debug Mode / Browser / Tab 下一跳 / Ctrl+K 升格 Agent / MCP HTTP+OAuth / 扩展侧栏已落地
- (2026-09-21) 对话收起长代码与思考块；Agent Studio 可附加 Skill，每轮任务按顺序走一遍
- (2026-09-22) 未打开工作区时，需要写文件会在桌面自动创建 `Wanwu-<任务名>` 文件夹
- (2026-09-23) 聊天 Markdown、单层权限摘要、终端命令预览、作曲栏换模型已落地
- 明确不做：Cloud Agents / Bugbot / DAP（Debug 是插桩约定，不是调试器协议）
