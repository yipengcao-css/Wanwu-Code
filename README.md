# Wanwu-Code

**Wanwu-Code（万物 Code）** —— AI 时代的 IDE：把自然语言意图编译为可验证的代码变更。

CLI 命令名：**`wanwu`**  
当前预发布：**v1.0 beta**（tag `v1.0.0-beta`）

## 产品一句话

> Code-OSS 级编辑体验 + Grok Build 级 Agent Runtime（ACP/MCP/Sandbox）+ Claude Code 级 Plan/Memory/Verify + Codex 级多 Agent / 云端异步。

## 已锁定决策

| 决策 | 结论 |
|---|---|
| CLI | `wanwu` |
| MVP | **VS Code 扩展优先** |
| Agent 底座 | 允许桥接/复用开源 [Grok Build](https://github.com/xai-org/grok-build) ACP |
| 模型 | **多模型对等**（xAI / OpenAI / Anthropic / Ollama / custom） |
| 「编译器」 | AI-native IDE + Agent Runtime（不是新语言编译器） |

## 仓库结构

```
apps/wanwu-ide          # 后期 Code-OSS 整机（占位）
crates/                 # Rust agent / grok ACP 桥接
docs/                   # 愿景、架构、路线图、ADR
examples/               # E2E 演示工程
extensions/wanwu-vscode # MVP：VS Code / Cursor 扩展
packages/               # protocol / config / workflow / cloud
scripts/                # bootstrap / smoke
```

## 快速开始

```bash
pnpm install
pnpm lint
pnpm test
pnpm typecheck

# CLI（通过 pnpm 调用开发入口）
pnpm wanwu doctor
pnpm wanwu inspect
pnpm wanwu exec -p "列出 README 标题"
pnpm wanwu acp          # 默认 wanwu-native ACP；可切 grok 或 WANWU_ACP_COMMAND
./scripts/smoke-acp.sh
pnpm build:cli          # 产出 dist-bin/wanwu.mjs
pnpm wanwu parallel demo --cleanup
pnpm wanwu cloud submit -p "异步任务" --run     # 本地 worktree runner
pnpm wanwu cloud submit -p "异步任务" --docker  # Docker（嵌套 overlay 主机默认回退本地）
WANWU_DOCKER_REQUIRE=1 pnpm wanwu cloud submit -p "强制容器" --docker  # CI 纯 Docker 门禁
```

### 安装预发布产物（v1.0 beta）

```bash
# 扩展
pnpm package:extension
# 安装 extensions/wanwu-vscode/wanwu-code-1.0.0-beta.vsix
# 或从 GitHub Release v1.0.0-beta 下载同名 VSIX

# CLI 单文件 bundle
pnpm build:cli
node dist-bin/wanwu.mjs doctor
# Release 资产名：wanwu-1.0.0-beta.mjs
```

手工清单：`docs/manual-test-extension.md`

## 文档

- [产品愿景](docs/PRODUCT_VISION.md)
- [架构](docs/ARCHITECTURE.md)
- [竞品分析](docs/COMPETITIVE_ANALYSIS.md)
- [路线图](docs/ROADMAP.md)
- [Epic 2 Backlog（E2-A 已完成；下一步 E2-B）](docs/EPIC2_BACKLOG.md)
- [ACP 集成](docs/ACP_INTEGRATION.md)
- [ADR 0001 Runtime 底座](docs/ADRs/0001-agent-runtime-base.md)
- [ADR 0002 扩展优先](docs/ADRs/0002-ide-strategy-extension-first.md)
- [ADR 0003 多模型对等](docs/ADRs/0003-multi-model-provider.md)
- [推荐工作流](docs/WORKFLOW.md)
- [完整实施计划](docs/PLAN.md)
- [第三方声明](THIRD_PARTY_NOTICES)

## 设计原则（摘要）

1. UI 是 adapter，不是真相源  
2. 权限先于能力（deny-first + sandbox）  
3. Plan / Act / Verify 分离  
4. 纯文本项目记忆（`WANWU.md`）  
5. 商标与许可证干净  

## 致谢与许可

- 本仓库代码默认目标许可：Apache-2.0（见 `LICENSE`，待补全时与 NOTICE 一并维护）
- Agent 能力将桥接/借鉴开源 [xai-org/grok-build](https://github.com/xai-org/grok-build)（Apache-2.0）；**Wanwu-Code 与 xAI / OpenAI / Anthropic 无官方隶属关系**
- VS Code / Code-OSS 为 Microsoft 开源编辑器上游

## 贡献

见 [AGENTS.md](AGENTS.md)（给人与 coding agent 的协作约定）。
