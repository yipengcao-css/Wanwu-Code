# AGENTS.md — Wanwu-Code 协作约定

本文件约束在本仓库工作的人类与 coding agent。

## 产品红线

1. CLI 名是 **`wanwu`**，不要引入第二官方命令名。
2. MVP **扩展优先**；不要未经要求直接大面积维护 Code-OSS fork。
3. **允许**桥接开源 Grok Build ACP；**禁止**在文档/UI 中暗示本产品为 xAI/OpenAI/Anthropic 官方产品。
4. **多模型对等**：新增 provider 时保持配置对称，不写死单一厂商。
5. 「编译器」= Agent Runtime 工作流，不是新语言编译器。

## 改代码顺序

1. 先读 `docs/PLAN.md` 与相关 ADR。
2. 小 PR：一个逻辑变更一次提交；提交后推送。
3. 先桥接、后深度 fork；不要一上来 vendor 整个 grok-build。
4. 涉及权限/沙箱的改动必须带测试或手工验证说明。

## 目录职责

| 路径 | 可改内容 |
|---|---|
| `docs/` | 产品与架构文档 |
| `extensions/wanwu-vscode/` | VS Code 扩展 |
| `packages/*` | TS 共享库 |
| `crates/` | Rust / 桥接 |
| `apps/wanwu-ide/` | 整机（后期） |
| `examples/` | 可运行演示 |

## 编码习惯

- TypeScript：严格模式；公共 API 写类型。
- Rust：按 crate 检查（`cargo check -p ...`），避免无必要全 workspace 构建。
- 用户可见文案：中文优先，必要时中英并存。
- 密钥只走环境变量 / 系统密钥链，禁止写入仓库。

## 验证

```bash
pnpm lint && pnpm typecheck && pnpm test
```

涉及 ACP 时额外跑：

```bash
./scripts/smoke-acp.sh
```

## 记忆文件

- 仓库级长期记忆：`WANWU.md`
- 兼容读取：`AGENTS.md`、`CLAUDE.md`（若存在）
- 不要把临时 debug 笔记永久写进 `WANWU.md`，应经用户确认。
