# Wanwu Hooks（Phase 4）

在 tool 调用前后可挂本地命令（格式化、secret scan 等）。

当前为约定目录；运行时加载将在后续 PR 接通。

示例（未来）：

```toml
# .wanwu/hooks.toml
[[hooks]]
event = "PostToolUse"
command = "pnpm lint"
```