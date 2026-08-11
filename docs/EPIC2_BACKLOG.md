# Epic 2 Backlog（Post v1.0 beta）

> 默认下一步：**E2-C 发行矩阵**（E2-B 多模型 MVP 已完成）。  
> 本文件供后续 coding agent 直接领取任务；**不要**再把 MVP Phase 0–7 当未完成项。

## 优先级

| 顺序 | ID | 主题 | 状态 |
|---|---|---|---|
| 1 | **E2-A** | **Native Agent Runtime** | **完成（TS wanwu-native）** |
| 2 | **E2-SHELL** | **自研 Electron 壳（Wanwu Lattice）** | **完成（MVP）** |
| 3 | **E2-B** | **真实多模型端到端矩阵** | **完成（fixture + DeepSeek live）** |
| 4 | E2-C | 发行矩阵（平台原生 CLI / 安装包） | queued |
| 5 | E2-D | Cloud 多任务编排 | queued |
| 6 | E2-E | 扩展商店发布通道 | queued |
| 7 | E2-F | Shell polish / 键位 | queued（并入 shell 后半） |

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

## E2-SHELL — 自研 Electron 壳（当前）

### 目标
抛弃 Code-OSS 产品路径；交付 `apps/wanwu-shell`：Electron + Monaco + Lattice UI + wanwu-native ACP。

### 验收
- [x] `pnpm shell:dev` / `pnpm shell` 可启动自研窗口
- [x] 无 VS Activity Bar；Orbit + Agent Studio + 非蓝状态栏
- [x] 打开文件夹、编辑保存、Agent 一轮、终端 echo
- [x] `apps/wanwu-ide` 文档标记 DEPRECATED
- [x] 截图/录屏入 artifacts

详见 [ADR 0005](./ADRs/0005-custom-electron-shell.md)、[DESIGN_SYSTEM](./DESIGN_SYSTEM.md)、[UI_DIFF_CHECKLIST](./UI_DIFF_CHECKLIST.md)。

## E2-B — 真实多模型 E2E

- [x] `@wanwu/providers`：OpenAI-compat（openai/xai/ollama/custom）+ Anthropic Messages
- [x] Fixture 矩阵（无网络）
- [x] `wanwu exec` / native ACP：有凭据走 LLM，否则 deterministic
- [x] `wanwu doctor` 多 provider 状态 + 修复建议
- [x] Live 脚本 `scripts/e2e-providers-live.mts`（OpenAI 兼容代理如 DeepSeek 可用）
- 文档：`docs/PROVIDERS.md`

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
