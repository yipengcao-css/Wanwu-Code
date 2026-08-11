# crates/ — Wanwu Agent（Rust）

## 策略（ADR 0001）

**短期（MVP）**：不在此完整 vendor `xai-org/grok-build`。

1. 实现轻量 `wanwu` CLI（可用 Rust 或 Node 起步；推荐最终 Rust）
2. `wanwu acp` **桥接**系统已安装的 Grok Build ACP（`grok`）
3. 桥接层负责：配置归一化、`WANWU.md` 注入、Plan/Verify 模式、日志

**Epic 2-A（已完成 · TS）**：`acp_backend=wanwu-native` 默认可用（实现于 `packages/wanwu-cli/src/native/`）。  
**后续**：若需 OS sandbox / 更高性能，再将 grok-build 必要 crate 裁剪迁入本目录并去品牌化。

## 预期命令

```text
wanwu                 # TUI（可后置）
wanwu acp             # ACP stdio（扩展用）
wanwu exec -p "..."   # headless
wanwu doctor          # 检查 grok、密钥、sandbox
wanwu inspect         # 打印合并配置 / memory / skills
```

## 开发注意

- 全量编译 grok-build workspace 很慢；优先针对单 crate
- 保留 Apache-2.0 归因于根目录 `NOTICE`
- 禁止在二进制默认输出中冒充上游品牌