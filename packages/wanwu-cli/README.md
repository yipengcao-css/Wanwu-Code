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

## ACP 桥接

默认 `acpBackend=grok`：`wanwu acp` → `grok acp`（可用 `WANWU_GROK_ACP_ARGS` 覆盖参数）。

覆盖整个后端：

```bash
export WANWU_ACP_COMMAND="my-agent --stdio"
wanwu acp
```

## 配置

见 `@wanwu/config` 与 `docs/ADRs/0003-multi-model-provider.md`。