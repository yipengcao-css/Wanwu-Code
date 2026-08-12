# Epic 2 Backlog（Post v1.0 beta）

> 默认下一步：用户点名（**E2-E 商店已跳过**；E2-F+ 已完成）。  
> 本文件供后续 coding agent 直接领取任务；**不要**再把 MVP Phase 0–7 当未完成项。

## 优先级

| 顺序 | ID | 主题 | 状态 |
|---|---|---|---|
| 1 | **E2-A** | **Native Agent Runtime** | **完成（TS wanwu-native）** |
| 2 | **E2-SHELL** | **自研 Electron 壳（Wanwu Lattice）** | **完成（MVP）** |
| 3 | **E2-B** | **真实多模型端到端矩阵** | **完成（fixture + DeepSeek/Moonshot live）** |
| 4 | **E2-C** | **发行矩阵（平台原生 CLI / 安装包）** | **完成** |
| 5 | **E2-D** | **Cloud 多任务编排** | **完成** |
| 6 | E2-E | 扩展商店发布通道 | **skipped（用户暂不需要）** |
| 7 | **E2-F+** | **Shell polish + Tool-calling + Desktop 安装包** | **完成** |

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
- [x] Live 脚本 `scripts/e2e-providers-live.mts`（DeepSeek + Moonshot ≥2 家）
- 文档：`docs/PROVIDERS.md`

## E2-C — 发行矩阵

- [x] 官方安装脚本 `scripts/install.sh` / `scripts/install.ps1` + `docs/INSTALL.md`
- [x] 多平台原生 CLI（`pnpm build:cli:native` → linux/macos/win + `SHA256SUMS`）
- [x] 通用 `wanwu.mjs` 保留；release.yml 上传矩阵
- [x] IDE 安装包：评估延后（`apps/wanwu-shell` 开发启动；dmg/msi 非本轮）
- 验收：本地 `dist-bin` 含三大平台资产；linux 二进制 `help`/`doctor`/`exec` 冒烟通过

## E2-D — Cloud 多任务编排

- [x] `wanwu cloud orchestrate -p … -p … [--concurrency N]`
- [x] Runner 在独立 worktree 写 plan/review（不踩主仓）
- [x] `--pr` / `--pr-dry-run`：draft PR 或 `pr-draft.md`（永不 merge）
- [x] 并发 2 任务测试 + 独立 `review.diff`
- 文档：`docs/CLOUD.md`

## E2-E — 扩展商店

- Open VSX 和/或 VS Marketplace 发布流水线
- 需要 publisher 凭证（用户提供）
- 验收：商店页可安装与仓库 VSIX 同版本

## E2-F+ — Shell polish · Tool-calling · Desktop 安装包

- [x] `Ctrl/Cmd+I` / `` Ctrl/` `` 窗口内热键；可拖分栏 + localStorage 持久化
- [x] LLM 多轮 tool-calling（OpenAI-compat → Read/Edit/Bash/Glob/Grep）
- [x] Desktop：`pnpm shell:dist` → Linux AppImage + Win zip + mac x64/arm64 zip
- 文档：`docs/INSTALL.md` Desktop 节；`docs/PROVIDERS.md` tools 说明

## E2-E — 扩展商店（跳过）

用户确认暂时不需要。

---

## 商业就绪续作（Post P0）

| 顺序 | 主题 | 状态 |
|---|---|---|
| 1 | P0-1/2/3（ACP 随包 · node-pty · session reset） | **完成** |
| 2 | 商业 UI + BYOK Settings / Welcome Gate | **完成（#6）** |
| 3 | ACP 多轮会话上下文 + Plan/Verify 真工作流 | **完成（#7）** |
| 4 | Diff Review / 会话历史 UI / Hooks 接入 native | **完成（#8）** |
| 5a | MCP 工具面 | **完成（#9）** |
| 5b | LSP（Shell TS → Monaco markers） | **完成（#10）** |
| 5c | 签名分发（mac notarize 门控） | **完成（#11）** |
| 6 | P0 安全修复（Edit propose / Bash 门控 / env / realpath） | **完成（#12）** |
| 7 | P1 Agent 质量（权限 RPC / Anthropic tools / LLM Plan / Verify review / skills） | **完成（#13）** |
| 8 | P2 体验/生态（TUI / 扩展真实 ACP / hooks 上下文 / cloud async） | **完成（#14）** |
| 9 | P3 文档叙事统一（PLAN/WANWU/ROADMAP/ADR 对齐） | **完成（#15）** |
| 10 | 性能（CLI 懒加载 / Glob 缓存 / Shell 代码分割 / 打包瘦身） | **完成（#16）** |
| 11 | 多语言 LSP（注册表 + 语言路由） | **完成（#17）** |
| 12 | 插件市场 MVP（skills / MCP 安装 + 信任门控） | **完成（#18）** |
| 13 | 真云端（HTTP runner + token + snapshot） | **完成（#19）** |
| 14 | TUI 增强（流式 / 工具时间线 / 历史） | **完成（#20）** |
| 15 | benchmark 套件 | **完成（#21）** |
| 16 | 子代理并行（explore/coder/plan） | **完成（#22）** |
| 17 | 真实 OS sandbox（bwrap/Seatbelt/Docker） | **PR #23** |
| 18 | 会话 cancel / resume / compact | **PR #24** |
| 19 | 流式 providers（SSE） | **PR #25** |
| 20 | 云端容器执行 + diff apply | **PR #26** |
| 21 | 权限规则文件（allow/ask/deny） | **PR #27** |
| 22 | TUI 升级（主题 / 状态栏） | **PR #28** |
| 23 | 通用 Verify（检测项目类型） | **PR #29** |
| 24 | 子代理 worktree 隔离 | **PR #30** |
| 25 | MCP 对话式配置 | **本分支** |

## 领取方式

点名下一 epic 即可（例如性能、LSP、签名分发等）。
