# Epic 2 Backlog（Post v1.0 beta）

> 默认下一步：**E2-A Native Agent**。  
> 本文件供后续 coding agent 直接领取任务；**不要**再把 MVP Phase 0–7 当未完成项。

## 优先级

| 顺序 | ID | 主题 | 状态 |
|---|---|---|---|
| 1 | **E2-A** | **Native Agent Runtime** | **完成（TS wanwu-native）** |
| 2 | E2-B | 真实多模型端到端矩阵 | queued |
| 3 | E2-C | 发行矩阵（平台原生 CLI / 安装包） | queued |
| 4 | E2-D | Cloud 多任务编排 | queued |
| 5 | E2-E | 扩展商店发布通道 | queued |
| 6 | E2-F | IDE 布局 / 键位 polish | queued |

---

## E2-A — Native Agent Runtime（优先）

### 目标
在仍允许桥接 `grok` 的同时，交付 **`acp_backend=wanwu-native`**：无系统 `grok` 二进制也能跑 ACP 握手 + 基础工具回合。

### 建议路径
1. 固化 adapter 边界：`wanwu acp` 根据 config 选择 `grok | wanwu-native`。
2. 评估 vendor/裁剪开源 grok-build 必要 crate（sandbox、tools、session）；去品牌 + 更新 `THIRD_PARTY_NOTICES`。
3. 最小工具面：Read / Edit / Bash（权限门）/ Glob / Grep。
4. 与现有 Plan/Verify/Hooks/Memory loader 对接。
5. 集成测试：`scripts/acp-handshake.mts` 对 native backend 黄金路径。

### 验收
- [x] `acp_backend=wanwu-native` 时，无 `grok` 亦可完成 initialize + 一轮 prompt（`scripts/acp-handshake-native.mts`）
- [x] 危险 bash 默认被权限策略拦截
- [x] NOTICE / 许可证清洁（agentInfo=`wanwu-native`，不冒用上游品牌）
- [x] smoke 覆盖 native ACP（`scripts/smoke-acp.sh`；GHA 额度恢复后自动跑）

### 非目标
- 完整对标 grok-build 全部 skills/plugins marketplace
- 自研模型

---

## E2-B — 真实多模型 E2E

- BYOK 集成测试：OpenAI / Anthropic / xAI / Ollama（可用录制 fixture）
- Provider 错误信息可读；`wanwu doctor` 给出修复建议
- 验收：至少 2 个真实 provider 在有密钥的 secret 环境跑通 `wanwu exec`

## E2-C — 发行矩阵

- macOS / Linux / Windows 原生 CLI 二进制（或官方安装脚本）
- IDE 安装包评估（可选）
- 验收：Release 资产包含三大平台 CLI

## E2-D — Cloud 多任务编排

- 多 worktree / 多任务队列
- 完成后自动开 PR（review-first，不自动 merge）
- 验收：同时 2 个 cloud task 不互相踩文件，并产出独立 review.diff

## E2-E — 扩展商店

- Open VSX 和/或 VS Marketplace 发布流水线
- 需要 publisher 凭证（用户提供）
- 验收：商店页可安装与仓库 VSIX 同版本

## E2-F — IDE polish

- 默认布局突出 Agent + Diff + Terminal
- `Ctrl/Cmd+I` 呼出 Wanwu
- 验收：手工清单 + 短录屏

---

## 领取方式

执行 agent 默认：

```
实现 docs/EPIC2_BACKLOG.md 的 E2-A Native Agent
```

完成 E2-A 后再推进 E2-B/C。
