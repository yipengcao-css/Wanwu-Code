# @wanwu/cli

`wanwu` 命令行入口。

## 命令

```bash
pnpm wanwu -- doctor
pnpm wanwu -- inspect
pnpm wanwu -- exec -p "列出 README 标题"
pnpm wanwu -- acp
```

全局链接（可选）：

```bash
pnpm --filter @wanwu/cli build
pnpm --filter @wanwu/cli link --global
```

## ACP 后端

默认 `acp_backend=wanwu-native`：`wanwu acp` 启动内置 TypeScript ACP server（**不依赖**系统 `grok`）。

最小工具面：Read / Edit / Bash / Glob / Grep（deny-first 权限 + workspace 边界）。

切换回 Grok Build 桥接：

```toml
# .wanwu/settings.toml
acp_backend = "grok"
```

覆盖整个后端进程：

```bash
export WANWU_ACP_COMMAND="my-agent --stdio"
wanwu acp
```

本地黄金路径：

```bash
pnpm exec tsx scripts/acp-handshake-native.mts
```

## 配置

见 `@wanwu/config`、`docs/PROVIDERS.md` 与 `docs/ADRs/0003-multi-model-provider.md`。

### BYOK / LLM

有 API key 时 `wanwu exec` 走真实模型；否则确定性 native loop。

```bash
export OPENAI_API_KEY=...
export OPENAI_BASE_URL=https://api.deepseek.com   # 可选兼容代理
export WANWU_MODEL=deepseek-chat
pnpm wanwu exec -p "只回复一个词：pong"
```

强制确定性：`WANWU_FORCE_DETERMINISTIC=1`。
