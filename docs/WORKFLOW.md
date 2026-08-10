# Wanwu 推荐工作流：Explore → Plan → Act → Verify → Commit

这是 Wanwu-Code 的默认工程循环（吸收 Claude Code 的 Plan/Verify 纪律与 Codex 的 Review-first）。

## 1. Explore

- 打开仓库，阅读 `WANWU.md` / `AGENTS.md`
- `pnpm wanwu doctor` 检查模型密钥、ACP 后端、记忆文件
- 在扩展中用 **Ask** 模式澄清问题，或终端探索失败测试：

```bash
pnpm --filter @wanwu/failing-test-demo run test:demo
```

## 2. Plan

只读、产出计划，不改代码：

```bash
pnpm wanwu plan -p "修复 failing-test-demo 的 sum 实现"
# → .wanwu/plans/*.plan.md
```

或在 VS Code：`Wanwu: Plan this task` / Chat Mode=**Plan**。

## 3. Act

批准计划后，用 **Agent** 模式执行。  
高风险 shell / 写文件会走权限确认；提出的编辑会进入 **Diff Review**（Accept 才落盘）。

## 4. Verify

独立门禁（与 Act 上下文隔离）：

```bash
pnpm wanwu verify
# 或命令面板：Wanwu: Run Verify
```

失败则回到 Act，不要标记完成。

## 5. Commit

- 人工审查 diff
- 生成 commit message（默认不自动 push）
- 可选：把稳定约定写回记忆

```bash
pnpm wanwu memory-writeback -p "sum 应用加法语义" --yes
```

## Hooks

Tool 之后可跑本地检查（示例）：

```bash
pnpm wanwu hooks PostToolUse
```

见 `.wanwu/hooks.toml`。
