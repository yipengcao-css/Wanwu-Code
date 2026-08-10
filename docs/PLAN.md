# Wanwu-Code：AI 时代 IDE 实施计划（Agent 可执行版）

> 仓库：`yipengcao-css/Wanwu-Code`  
> 现状：几乎空仓（仅 `README.md`）  
> 目标：融合开源 **Grok Build CLI**、**VS Code/Code-OSS**、**OpenAI Codex**、**Claude Code** 各自所长，打造 AI-native IDE 产品 **Wanwu-Code（万物 Code）**  
> 本文件供后续 coding agent 直接按阶段执行。  
> 用户已于 2026-08-10 批准计划并锁定 §11 决策；执行中。

---

## 0. Executive Summary

### 产品一句话
**Wanwu-Code = Code-OSS 级编辑器体验 + Grok Build 级 Agent Runtime（ACP/MCP/Sandbox）+ Claude Code 级 Plan/Memory/Verify 工作流 + Codex 级 多 Agent 并行与云端异步任务。**

### 技术路线（已选定 · 用户 2026-08-10 确认）
1. **CLI 品牌**：二进制/命令名锁定为 `wanwu`（产品名 Wanwu-Code）。
2. **IDE 集成优先 MVP**：先做 **VS Code Extension（ACP Client）**，快速验证产品闭环；再推进 **Code-OSS fork 的 Wanwu IDE Shell**。
3. **Agent 内核**：允许桥接/复用开源 `xai-org/grok-build` ACP；以薄封装 `wanwu-agent` 起步（CLI + headless + ACP），按需再深度裁剪/vendor。
4. **协议优先**：编辑器 ↔ Agent 统一走 **ACP**；外部工具走 **MCP**；语言智能继续走 **LSP**。
5. **多模型对等**：Grok / OpenAI / Anthropic / Ollama / OpenAI-compatible 从第一天起对等接入（BYOK），不设单一默认厂商锁定；可有推荐预设但不绑定产品身份。
6. **工作流内核**：强制支持 `Explore → Plan → Act → Verify → Commit`，以及 project memory（`WANWU.md` + 兼容 `AGENTS.md`/`CLAUDE.md`）。
7. **「编译器」语义**：AI-native IDE + Agent Runtime（把自然语言意图编译为可验证代码变更），不是新语言编译器。

### MVP 定义（必须先做成）
- `wanwu` CLI：交互 TUI（可后置）+ headless + ACP stdio
- VS Code 扩展：侧边栏 Agent 面板、流式输出、diff 预览、权限确认、Plan/Act 模式切换
- 本地 sandbox + 权限策略
- Skills / Hooks / Memory 最小可用
- 文档与示例仓库可跑通「修一个 failing test」端到端场景

### 非 MVP（明确延后）
- 完整品牌化 Code-OSS 发行版与安装包矩阵
- Codex 级多项目云端并行 orchestration
- 插件市场 / skills marketplace 商业化
- 移动端远程遥控
- 自研模型训练

### 关于「IDE 编译器」的解释
本计划将「AI 时代 IDE 编译器」解释为：**以 Agent Runtime 为核心的 AI-native IDE**（把自然语言意图“编译”为可验证的代码变更与工程操作），而不是新编程语言编译器。若需字面意义的语言编译器，需另行开题。

---

## 1. 竞品所长 → Wanwu 能力映射

| 来源 | 必须吸收的所长 | Wanwu 落点 |
|---|---|---|
| **Grok Build** | 同一 runtime 多前端（TUI/headless/ACP）；OS sandbox；MCP/skills/plugins/hooks；workspace checkpoint；subagent + worktree | `packages/wanwu-agent` / `crates/*` |
| **VS Code** | 成熟编辑/调试/SCM/扩展生态；Problems/Terminal/Diff；开发者心智模型 | `apps/wanwu-ide`（后期）+ `extensions/wanwu-vscode`（MVP） |
| **Codex** | CLI/IDE/Cloud 配置统一；异步云任务；并行 agent + worktree；Review-first | `packages/wanwu-cloud`（Phase 5）+ 统一 `~/.wanwu/config.toml` |
| **Claude Code** | Plan Mode；纯文本项目记忆；gather-act-verify；hooks 权限纪律；subagent 上下文隔离；maker-checker | `packages/wanwu-workflow` + `WANWU.md` + Verify subagent |

---

## 2. 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/wanwu-ide (Code-OSS fork, Phase 4+)                        │
│  - Editor / Terminal / SCM / Debug / Extensions                 │
└─────────────────────────────┬───────────────────────────────────┘
                              │ ACP (JSON-RPC over stdio/WS)
┌─────────────────────────────▼───────────────────────────────────┐
│ extensions/wanwu-vscode (MVP ACP Client)                        │
│  - Chat/Plan UI, Diff Review, Permission Gate, Session Manager  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ spawn / connect
┌─────────────────────────────▼───────────────────────────────────┐
│ packages/wanwu-agent  (fork/adapt grok-build patterns)          │
│  Runtime: Session · AgentBuilder · ToolRegistry · Actors         │
│  Modes: TUI | Headless | ACP | Leader                            │
│  Ext: MCP · Skills · Hooks · Plugins · Memory                    │
│  Safety: Permission Policy → Workspace Boundary → OS Sandbox     │
└───────────────┬─────────────────────────┬───────────────────────┘
                │                         │
        ┌───────▼────────┐        ┌───────▼────────┐
        │ Model Providers│        │ wanwu-cloud     │
        │ Grok/OpenAI/...│        │ runners/worktree│
        └────────────────┘        └────────────────┘
```

### 设计原则（执行时不可违背）
1. **UI 是 adapter，不是真相源**：所有模式共享同一 agent session 语义。
2. **权限先于能力**：deny-first；OS sandbox 作最后防线。
3. **Plan 默认可选强制**：高风险操作（大规模删改、强制 push、生产部署）必须经 Plan 或显式确认。
4. **Verify 与 Act 分离**：测试/评审 subagent 不复用写代码 agent 的同一污染上下文（maker-checker）。
5. **纯文本记忆优先**：`WANWU.md` / skills markdown，避免过早上复杂向量库。
6. **商标与许可证干净**：产品名 Wanwu；保留上游 Apache/MIT 归属；不冒用 Grok/Claude/Codex 品牌。

---

## 3. 建议单仓结构（执行阶段创建）

```
Wanwu-Code/
├── README.md
├── AGENTS.md                      # 给 coding agent 的仓库协作规范
├── WANWU.md                       # 产品/项目记忆（自举）
├── docs/
│   ├── PRODUCT_VISION.md
│   ├── ARCHITECTURE.md
│   ├── COMPETITIVE_ANALYSIS.md
│   ├── ROADMAP.md
│   ├── ACP_INTEGRATION.md
│   └── ADRs/
│       ├── 0001-agent-runtime-base.md
│       ├── 0002-ide-strategy-extension-first.md
│       └── 0003-multi-model-provider.md
├── packages/
│   ├── wanwu-protocol/            # ACP/MCP 共享类型（TS）
│   ├── wanwu-workflow/            # Plan/Act/Verify 状态机（TS）
│   ├── wanwu-config/              # config schema + merge 规则
│   └── wanwu-cloud/               # Phase 5 stub
├── crates/                        # Rust agent runtime（从 grok-build 策略引入）
│   └── README.md                  # 说明 vendor/submodule 策略
├── extensions/
│   └── wanwu-vscode/              # MVP VS Code / Cursor 兼容扩展
├── apps/
│   └── wanwu-ide/                 # Phase 4+ Code-OSS fork 占位
├── examples/
│   └── failing-test-demo/         # E2E 演示工程
├── scripts/
│   ├── bootstrap.sh
│   ├── smoke-acp.sh
│   └── package-extension.sh
└── .github/workflows/
    ├── ci.yml
    └── release-extension.yml
```

---

## 4. 分阶段实施（Agent 逐步执行）

### Phase 0 — 文档与决策固化（第 1 个 PR）
**目标**：把本计划落到仓库，形成可协作基线。

**任务**
1. 将本计划同步为：
   - `docs/PRODUCT_VISION.md`
   - `docs/ARCHITECTURE.md`
   - `docs/COMPETITIVE_ANALYSIS.md`
   - `docs/ROADMAP.md`
   - `docs/ADRs/0001-*.md` 等 3 篇 ADR
2. 重写根 `README.md`：愿景、架构图、快速开始（即使命令尚未可用也写明 TBD）。
3. 新增 `AGENTS.md` + `WANWU.md`（约定后续 agent 如何改本仓）。
4. 新建目录骨架（可空实现，但路径固定）。

**验收标准**
- [x] 上述文档齐全，术语统一（Wanwu / ACP / MCP / Plan-Act-Verify）
- [x] README 能让新人 5 分钟理解「做什么、不做什么、MVP 是什么」
- [x] ADR 明确：为何 extension-first、为何以 grok-build 为 runtime 底座

---

### Phase 1 — Monorepo 工程基线
**目标**：可安装依赖、可 lint/test、可 CI。

**任务**
1. 选定包管理：根目录 `pnpm-workspace.yaml`（extensions + TS packages）。
2. Rust：`crates/` 先放 `wanwu-agent` 最小 crate 或 git submodule 策略文档；在 `crates/README.md` 写清：
   - 短期：调用系统已安装 `grok` ACP，或
   - 中期：vendor/fork 必要 crate 并改品牌为 wanwu
3. 增加 `package.json` scripts：`lint` `test` `typecheck` `build:extension`。
4. GitHub Actions：PR 上跑 TS typecheck + unit tests；Rust `cargo check`（若已有 crate）。

**推荐依赖方向**
- Extension：TypeScript + VS Code Extension API
- Protocol：JSON Schema 生成 TS types（参考 ACP schema）
- Agent：Rust（对齐 grok-build / codex）

**验收标准**
- [x] `pnpm i && pnpm lint && pnpm test` 通过
- [x] CI 绿（workflow 已配置；以 GitHub 运行为准）
- [x] 目录结构与第 3 节一致

---

### Phase 2 — `wanwu-agent` Runtime MVP（ACP + Headless）
**目标**：拥有可被 IDE 拉起的 Agent 进程。

#### 2A. 引入策略（按序尝试，写进 ADR）
1. **Adapter 优先（最快）**：`wanwu-agent` 先做薄封装，底层 spawn `grok agent stdio`（ACP），统一配置/品牌/日志。
2. **能力分化**：在封装层加入 Wanwu 工作流指令（Plan/Verify）、多模型路由、`WANWU.md` 装载。
3. **深度 fork（需要时）**：再迁入/裁剪 grok-build 关键 crate（sandbox、workspace、tools），去品牌化并保留 NOTICE。

#### 2B. 必须实现的命令面
```
wanwu                 # TUI（可 Phase 2 末或 Phase 3 后）
wanwu acp             # ACP stdio server（IDE 用）
wanwu exec -p "..."   # headless 一次性任务
wanwu doctor          # 检查模型密钥、sandbox、MCP
wanwu inspect         # 打印合并后的 config/skills/hooks/memory
```

#### 2C. 核心模块（逻辑边界）
| 模块 | 职责 | 参考 |
|---|---|---|
| Session Manager | 会话生命周期、取消、恢复 | grok shell / ACP |
| AgentBuilder | 不可变 agent 快照 + 工具桥 | grok AgentBuilder |
| ToolRegistry | Read/Edit/Bash/Glob/Grep/Web + MCP | Claude tools + grok tools |
| Permission+Sandbox | deny-first + OS 隔离 | grok sandbox + Claude permissions |
| Memory Loader | `WANWU.md`/`AGENTS.md` 层级合并 | Claude CLAUDE.md |
| Workflow Controller | Plan/Act/Verify 状态 | Claude + 本产品差异点 |
| Provider Router | 多模型 | Codex/Claude/Grok CLI 常见做法 |

**验收标准**
- [x] `wanwu exec -p "列出当前目录 README 标题"` 成功返回（无 grok 时 dry-run）
- [x] `wanwu acp` 可被最小 ACP client（脚本）握手并完成一轮 prompt（`scripts/acp-handshake.mts` + mock）
- [x] 无权限批准时，危险 bash 被拦截（`check-perm` + mock permission deny）
- [x] `wanwu inspect` 能看到 memory/skills/mcp 发现结果
- [x] 许可证与归因文件齐全（`NOTICE`/`THIRD_PARTY_NOTICES`）

**测试**
- 单元：config merge、memory discovery、permission matcher
- 集成：`scripts/smoke-acp.sh` 对本地 ACP 跑黄金路径
- 手工：在 demo repo 修测试（见 Phase 6）

---

### Phase 3 — VS Code 扩展（产品脸面，MVP 关键）
**路径**：`extensions/wanwu-vscode/`

**必须功能**
1. **Agent 侧栏**：会话列表、流式 markdown、thinking/tool timeline
2. **ACP Client**：spawn `wanwu acp`，处理 session/update/tool permission
3. **Diff Review**：应用前可文件级 accept/reject（学 VS Code/Codex）
4. **Mode 切换**：`Ask` / `Plan` / `Agent` / `Verify`
5. **上下文注入**：打开文件、选区、workspace folder、diagnostics（Problems）
6. **统一配置**：读取 `~/.wanwu/config.toml` 与工作区 `.wanwu/`
7. **命令面板**：`Wanwu: New Chat` `Wanwu: Plan this task` `Wanwu: Run Verify` `Wanwu: Doctor`

**建议文件拆分**
```
extensions/wanwu-vscode/
  package.json
  src/extension.ts
  src/acp/client.ts
  src/acp/process.ts
  src/ui/chatPanel.ts
  src/ui/diffReview.ts
  src/ui/permissionModal.ts
  src/context/editorContext.ts
  src/config/loadConfig.ts
  media/  (webview assets)
  README.md
```

**验收标准**
- [x] 在 VS Code/Cursor 安装本地 VSIX 后，侧栏可对话（VSIX 已打包；宿主 GUI 需本机点验）
- [x] Agent 编辑文件后出现 diff review，而非静默覆盖（mock Edit → Diff Review → Accept 落盘）
- [x] Plan 模式只产出计划文档，不改代码（mock `[MODE=plan]` + `wanwu plan`）
- [x] Agent 模式改代码后可一键触发 Verify（`Wanwu: Run Verify` / `wanwu verify`）
- [x] 权限弹窗可 Allow once / Allow session / Deny

**测试**
- Webview 与 ACP client 的单元测试（node）
- 手工测试清单：`docs/manual-test-extension.md`
- 录屏：从提问 → plan → apply → verify 的完整路径

---

### Phase 4 — Workflow 产品化（Claude Code 精髓）
**路径**：`packages/wanwu-workflow/` + agent 侧策略

**状态机**
```
Idle → Explore → PlanDraft → PlanApproved → Acting → Verifying → Done
                      │                         │
                      └─────(reject/revise)──────┘
```

**规则**
1. `Plan`：只读工具 + 产出 `*.plan.md`（或会话内 plan artifact）
2. `Act`：按计划执行；偏离计划需提示
3. `Verify`：独立 subagent/固定流水线运行 test/lint/build；失败自动回到 Act 或请求用户
4. `Memory Writeback`：用户确认后把稳定约定写回 `WANWU.md`
5. `Hooks`：`PreToolUse`/`PostToolUse`/`Stop` 可跑本地命令（格式化、secret scan）

**验收标准**
- [x] 任一任务可导出 plan artifact
- [x] Verify 失败会阻断 “完成” 状态（状态机 verify_fail→acting）
- [x] hooks 示例（prettier-style）可运行
- [x] 文档给出推荐循环：Explore→Plan→Act→Verify→Commit（`docs/WORKFLOW.md`）

---

### Phase 5 — 并行 Agent 与云端异步（Codex 精髓）
**延后但设计预留**

**任务**
1. 本地 parallel：git worktree per agent；UI 显示多 session
2. `wanwu cloud` stub：任务投递 API、日志回流、PR 生成
3. 统一配置：同一 `config.toml` 控制 CLI/IDE/Cloud MCP 与 permissions
4. Review-first：完成后默认开 diff/PR 视图，而不是直接 merge

**验收标准（阶段完成时）**
- [ ] 同时跑 2 个本地 worktree agent 不互相踩文件
- [ ] 云任务至少能在 headless runner 复现同一 workflow（可先单机 docker）
- [x] CLI 与扩展读取同一配置源

---

### Phase 6 — Wanwu IDE Shell（VS Code 精髓的“整机”）
**路径**：`apps/wanwu-ide/`（Code-OSS fork 或构建脚本拉取）

**策略**
1. 先不维护完整 Electron fork 历史；用脚本拉取 Code-OSS 指定 tag + 应用 patch 系列。
2. 预装 `wanwu-vscode` 为内置扩展；默认布局突出 Agent + Diff + Terminal。
3. 品牌替换：产品名、图标、通知、默认 keymap（`Ctrl/Cmd+I` 呼出 Wanwu）。
4. 保留扩展市场兼容策略（说明与 VS Marketplace 的关系/风险）。

**验收标准**
- [ ] 本地能启动 Wanwu IDE
- [ ] 内置 Agent 开箱可用
- [ ] 基础编辑/LSP/Debug/Git 不回归

---

### Phase 7 — E2E 演示、质量与发布
**路径**：`examples/failing-test-demo/`

**演示剧本（必须自动化+可录屏）**
1. 打开 demo 项目（存在故意失败的测试）
2. `Wanwu: Plan this task` → 生成修复计划
3. 批准计划 → Agent 修改代码
4. Verify 跑测试转绿
5. 生成 commit message（不自动 push）

**发布物**
- 扩展 VSIX
- `wanwu` CLI binary（至少 linux/mac）
- 文档站点或 `docs/` 齐套
- CHANGELOG

**验收标准**
- [x] `scripts/smoke-acp.sh` 与 demo E2E 在 CI 可跑
- [x] 有一份 walkthrough（命令日志证明闭环；GUI 录屏仍待本机）

---

## 5. 具体执行顺序（给 Agent 的默认 backlog）

按 PR 拆分，避免巨型 PR：

1. **PR1**：Phase 0 文档 + 目录骨架 + README/AGENTS/WANWU
2. **PR2**：Phase 1 TS monorepo + CI
3. **PR3**：Phase 2A `wanwu` CLI stub + config/doctor/inspect
4. **PR4**：Phase 2 ACP adapter（可先桥接 grok 或自研最小 agent loop）
5. **PR5**：Phase 3 扩展：能聊、能显示 tool timeline
6. **PR6**：Phase 3 diff review + permissions
7. **PR7**：Phase 4 plan/verify workflow
8. **PR8**：examples demo + smoke scripts + 录屏文档
9. **后续**：Phase 5/6 独立 epic

---

## 6. 测试策略

### 自动化
- **Unit**：permission rules、config merge、memory discovery、workflow state machine
- **Integration**：ACP handshake + 单轮 tool call（fixture workspace）
- **Extension smoke**：vsce package + `@vscode/test-electron` 最小启动（能到 Phase 3 再加）
- **Repo CI**：lint/typecheck/test；Rust `cargo test -p <crate>`

### 手工（每个涉及 UI 的 PR）
- 权限拒绝/允许
- Plan 不落盘改代码
- Diff accept/reject
- 取消进行中的 agent turn
- 无 API key 时 `doctor` 给出可读修复建议

### 安全回归（必须）
- 尝试读取 `~/.ssh` 应被策略拦截（默认）
- 网络访问默认受限（可配置）
- prompt 注入样例：忽略“删除仓库”类指令除非用户显式高权限模式

---

## 7. 配置契约（尽早冻结）

`~/.wanwu/config.toml`（示意）：
```toml
# 多模型对等：不强制绑定单一厂商；用 active_provider + model 选择
active_provider = "openai"       # xai | openai | anthropic | ollama | custom
model = "gpt-5"
permission_mode = "ask"          # ask | accept-edits | accept-all
sandbox = "workspace"            # off | workspace | strict
acp_backend = "grok"             # grok | wanwu-native（后期）

[providers.xai]
api_key_env = "XAI_API_KEY"
default_model = "grok-4"

[providers.openai]
api_key_env = "OPENAI_API_KEY"
default_model = "gpt-5"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"
default_model = "claude-sonnet-4"

[mcp.servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]
```

工作区：
```
.wanwu/
  settings.toml
  skills/
  hooks/
WANWU.md
AGENTS.md
```

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 直接深度 fork grok-build 过重 | Adapter 桥接先行，能力缺口再迁 crate |
| 范围膨胀成“十年 IDE” | 严格 MVP；Phase 5/6 分开 epic |
| 许可证/商标污染 | NOTICE；去品牌；文档声明非官方 |
| ACP 协议演进 | 锁定 schema 版本；兼容层测握手 |
| 模型厂商 API 差异 | Provider trait + 统一 tool message 归一化 |
| 扩展在 Cursor/VS Code 行为差 | 以 VS Code OSS API 为基准，Cursor 做兼容测试矩阵 |

---

## 9. 成功指标（MVP）

1. 新用户 < 10 分钟完成：安装扩展 + 配置密钥 + 完成一次有 verify 的代码修复
2. 同一任务在 CLI headless 与 IDE 面板行为一致（同一 workflow 语义）
3. 默认配置下不出现未确认的危险 shell
4. 文档与 demo 可复现，不依赖作者机器特例

---

## 10. 本次执行阶段的立即交付（用户批准后）

用户批准本计划后，执行 agent 应立刻开始 **Phase 0 + Phase 1 骨架**：

1. 把本文拆写进 `docs/*` 与 ADR  
2. 更新 `README.md` / 新增 `AGENTS.md` / `WANWU.md`  
3. 创建 monorepo 目录与最小 `package.json`/`pnpm-workspace`  
4. 提交 PR（draft）标题建议：`docs: Wanwu-Code AI IDE blueprint and repo skeleton`

**不要**在未完成文档基线前直接大面积 vendor grok-build。

---

## 11. 已锁定决策（用户确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | CLI 名 | `wanwu` |
| 2 | MVP 形态 | **扩展优先**（VS Code Extension → 再 Code-OSS 整机） |
| 3 | Agent 底座 | **允许桥接/复用**开源 Grok Build ACP |
| 4 | 模型策略 | **多模型对等**（第一天起） |
| 5 | 「编译器」语义 | AI-native IDE + Agent Runtime（意图→可验证改动） |

执行 agent 不得偏离以上决策，除非用户再次明确改口。

---

## 12. 参考链接（实施时查阅）

- https://github.com/xai-org/grok-build
- https://docs.x.ai/build/overview
- https://github.com/openai/codex
- https://agentclientprotocol.com/get-started/introduction
- https://code.claude.com/docs/en/how-claude-code-works
- https://github.com/microsoft/vscode （Code-OSS 上游）
