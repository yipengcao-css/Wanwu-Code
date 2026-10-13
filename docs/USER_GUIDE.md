# 万物 Code 使用手册

适用版本：`1.0.0-beta`（桌面端 Wanwu Shell + `wanwu` 命令行）

> 万物 Code 是独立的开源 AI 编程环境，通过开放协议（ACP、MCP、LSP）桥接各家模型与工具。它不是 xAI、OpenAI、Anthropic 或任何模型厂商的官方产品。

本手册按「装好 → 配好 → 用起来 → 查资料」的顺序写。每一项都对应当前代码里已有的界面和命令；还没做到的放在最后一章「已知限制」。

## 目录

1. 产品概览
2. 安装
3. 首次启动与模型设置
4. 界面总览
5. 五种工作模式
6. Agent 面板
7. 编辑器
8. 侧栏：文件、搜索、更改、问题
9. 终端
10. 规则、记忆与 WANWU.md
11. 权限与安全
12. 扩展：MCP、LSP、Skill、插件、Hooks
13. 命令行 `wanwu`
14. 快捷键与命令面板
15. 常见问题
16. 已知限制

## 1. 产品概览

| 组成 | 说明 |
|---|---|
| 桌面端（Wanwu Shell） | Electron 应用：Monaco 编辑器、文件树、终端、Agent 面板、更改面板 |
| 命令行 `wanwu` | 终端 TUI、一次性执行、规划、验证、云端任务等；桌面端内置同一份运行时 |
| Agent 运行时 | 默认 `wanwu-native`，通过 ACP 与桌面端、扩展通信；也可桥接开源 Grok Build ACP |
| 模型 | 多模型对等：OpenAI 兼容（DeepSeek、Moonshot 等）、Anthropic、xAI、Ollama、自定义 OpenAI-compatible |

密钥只放在你本机（环境变量或 `~/.wanwu/credentials.env`），不会写进项目仓库。

## 2. 安装

### 2.1 Windows 一键安装包

1. 拿到 `Wanwu-Code-Setup-<版本>-win-x64.exe`，双击。
2. 不会问安装路径，也不需要管理员权限。程序装到当前用户的 `%LOCALAPPDATA%\Programs`，在桌面和开始菜单建快捷方式，装完自动启动。
3. 安装包是 **未签名** 的。第一次运行 SmartScreen 若提示「未知发布者」，点「更多信息」，再点「仍要运行」。
4. 目标电脑不需要装 Node、pnpm、Git；`wanwu` 命令行已打进安装包。
5. 卸载：Windows「设置 → 应用」。你的用户数据（`~/.wanwu`）不会被删。

也可以用 `Wanwu-Code-<版本>-win-x64.zip`：解压后运行里面的 `Wanwu Code.exe`，免安装。

### 2.2 从源码运行

要求 Node 22 LTS 与 pnpm。Node 24.16 及以上会让 Electron 解压失败。

```bash
pnpm install          # 必须在仓库根目录执行
pnpm build:cli
pnpm shell:dev        # 启动桌面端开发模式
```

国内下载 Electron 慢时，PowerShell 里先设：

```powershell
$env:ELECTRON_MIRROR="https://mirrors.huaweicloud.com/electron/"
```

打包自己的安装包：

```bash
pnpm shell:dist       # 产物在 apps/wanwu-shell/release/
```

更多平台说明见 `docs/INSTALL.md`。

## 3. 首次启动与模型设置

1. 点右上角 **模型设置**，或按 `Ctrl+,`（macOS `Cmd+,`）。抽屉标题是「模型与密钥」。
2. 填写：

| 项 | 说明 |
|---|---|
| Provider | OpenAI 兼容、Anthropic、xAI、Ollama（本地）、自定义 OpenAI-compatible |
| 模型 | 例如 `deepseek-chat` |
| Base URL（可选） | 使用代理或第三方兼容服务时填，例如 `https://api.deepseek.com` |
| 权限模式 | `ask` 每次确认；`accept-edits` 自动改文件并联网；`accept-all` 最宽松 |
| API Key | 已配置时显示「已配置（留空不改）」；输入新密钥才会替换 |

3. 保存。保存后当前 Agent 连接会重建，下一轮对话自动带上新凭据。

配置落在哪里：

- `~/.wanwu/config.toml`：provider、模型、base URL，不含密钥。
- `~/.wanwu/credentials.env`：`OPENAI_API_KEY=…` 等，文件权限 0600。不要提交到仓库。

没有密钥时，Agent 会走本地的确定性流程（不调用大模型），只适合试界面和自动化测试。真正对话前请先配好密钥。

设置抽屉里还有「规则与记忆」面板，见第 10 章。

## 4. 界面总览

界面分为五个区域：

| 区域 | 内容 |
|---|---|
| 顶栏 | Wanwu 标识、模式切换（Ask / Plan / Agent / Verify / Debug）、当前项目、打开文件夹、保存文件、终端、模型设置 |
| 左侧栏 | 文件 / 搜索 / 更改 / 问题 四个标签 |
| 中间 | 编辑器：标签页，可分屏 |
| 右侧 | Agent 面板：会话、输入框、模型与上下文用量 |
| 底部 | 终端（可开关） |

- **顶栏项目名** 点开是「最近打开的项目」，点一项即可切换。
- 左、中、右各栏之间的分隔条可以拖动，宽度会被记住。
- 没有打开文件夹时，中间区域提示「尚未打开工作区」。此时也可以直接在右侧描述任务；需要写文件时，会在桌面自动创建项目文件夹。

## 5. 五种工作模式

顶栏的模式切换对应 Agent 的行为。也可以在命令面板里输入「切换到 ask 模式」等。

| 模式 | 行为 |
|---|---|
| Ask | 只读代码库，回答问题，不改文件 |
| Plan | 先探索再出计划，不改文件；计划生成后会出现「确认后交给 Agent 实施」的提示 |
| Agent | 默认模式。可读、写、执行命令（受权限模式约束） |
| Verify | 运行隔离的类型检查、测试、lint 门禁 |
| Debug | 先提出假设并插桩，等你复现之后再改代码 |

输入框的占位文字会随模式变化，可以用它确认当前模式。

## 6. Agent 面板

### 6.1 发消息

- 在输入框描述任务，`Ctrl/Cmd+Enter` 发送。按钮在空闲时是「运行」，Agent 正在回答时是「排队」。
- 当前回合没结束时再发的消息会进队列，输入框下方显示「队列 N」，回合结束后依次发送。
- 「停止」可中止进行中的回合。
- `Ctrl+I` 把光标直接放回输入框。

### 6.2 用 `@` 引用上下文

输入 `@` 会弹出补全菜单，可以引用工作区文件、文件夹，以及：

| 写法 | 内容 |
|---|---|
| `@文件路径` | 该文件内容（`.wanwuignore` 里的路径会被拒绝） |
| `@文件夹/` | 该目录 |
| `@selection` | 编辑器当前选区（随消息发送） |
| `@codebase` | 语义搜索整个代码库 |
| `@git:status` / `@git:diff` / `@git:log` | 工作区状态、未提交 diff、最近提交 |
| `@terminal` | 最近的终端输出 |
| `@diagnostics` | 当前语言服务给出的诊断 |
| `@web:关键词` | 联网搜索 |

在编辑器里选中代码，命令面板运行「将编辑器选区加入 Agent」，输入框上方会出现一个选区芯片；点芯片上的关闭可以不发送这段选区。

### 6.3 图片

点「附加图片」，或直接把图片粘贴、拖进输入框。待发送的图片显示在输入框上方，可单独移除。需要所选模型支持图片输入。

### 6.4 会话

- 面板左侧是会话列表，可「新建会话」、搜索、切换。
- 双击会话名可改名；关闭按钮在每个会话上。
- 会话保存在项目的 `.wanwu/sessions/`，重新打开项目后可恢复历史。

### 6.5 Skill

Skill 是一段 Markdown 说明，告诉 Agent 在这个任务里要遵守什么。

- **附加**：在输入框下方点「附加 Skill」，从 Skill 目录里选，或「选择 Markdown 文件…」选本机文件。附加后显示为芯片，可移除。
- **制作**：点「制作 Skill」，写下「这个 Skill 要让 Agent 遵守什么」，名称可选；生成预览后可以修改，并选择是否写入 `.wanwu/skills` 以便以后直接附加。需要先打开工作区才能写入。

### 6.6 计划转实施

Plan 模式出计划后，输入框上方提示「计划已生成。确认后交给 Agent 实施。」点「按此计划执行」，会切到 Agent 模式，并要求按已批准的计划实施、不扩大范围。

### 6.7 权限弹窗

Agent 要联网（WebFetch）或写文件时，若权限模式是 `ask`，会弹出确认。可选「允许一次」「本会话允许」或「拒绝」。一直超时的处理见第 15 章。

### 6.8 撤销与重试

- **撤销**：撤销上一轮 Agent 对文件的改动（基于回合检查点）。命令行对应 `wanwu checkpoints` 与 `wanwu undo`。
- **重试**：重新发送上一条用户消息。

### 6.9 上下文用量与切换模型

- 输入框下方的「上下文 N%」是按当前对话、规则、记忆和编辑器上下文估算的占用；模型返回真实用量后，取两者中较大的值。
- 点当前模型名可在列表里切换模型，菜单底部「打开完整设置」进入设置抽屉。

### 6.10 任务清单

Agent 使用待办工具时，面板顶部会出现「任务清单」，随进度更新。

## 7. 编辑器

### 7.1 标签与分屏

- 点文件树里的文件在中间打开，多个文件以标签页排列，带未保存标记。
- 右上角「分屏」把另一个文件并排显示，「关闭分屏」退出。
- 面包屑显示当前路径与符号，可展开同级文件夹和当前文件里的符号。

### 7.2 保存

`Ctrl/Cmd+S` 或顶栏「保存文件」。文件在磁盘上被外部修改时，没有未保存改动的标签会自动刷新。

### 7.3 代码导航

| 操作 | 快捷键 | 说明 |
|---|---|---|
| 转到定义 | `F12` | 能跳到定义所在的其他文件 |
| 查看定义 | 面包屑「查看定义」 | 在原位预览定义 |
| 查找引用 | `Shift+F12` | 在编辑器里列出引用，点一行跳转；换文件后列表会关掉 |
| 重命名 | `F2` | 同步改到其他文件，其他已打开或未打开的文件都会处理，并提示保存 |
| 快速修复 | `Ctrl+.` | 列出光标所在行语言服务给出的修复 |

光标停在有诊断的行时，面包屑会出现「修复」。没有可应用的修复时，状态栏提示「没有可用的快速修复。」。

### 7.4 行内编辑：`Ctrl+K`

在编辑器里选中要改的代码，按 `Ctrl/Cmd+K`，在弹出的输入框写修改要求（`Enter` 运行，`Esc` 取消）。模型返回的改写结果以预览显示，点「接受」才会改文档，点「拒绝」放弃；也可以点「送到 Agent」，把选区和指令交给 Agent 处理涉及多个文件的修改。

### 7.5 Tab 预测下一处修改

编辑时，小模型会预测你接下来要做的修改，以灰色提示显示，按 `Tab` 接受，`Alt+→` 只接受一个词。如果下一处修改不在光标处，会显示「Tab 跳到第 N 行」，按 `Tab` 先跳过去，再按一次接受文字。应用之后若出现新的诊断，也可以 `Tab` 跳到下一处。

### 7.6 审阅 Agent 的改动

Agent 提出文件修改时，会显示按块的差异审阅：每一块可以「接受」或「拒绝」，也可以「全部接受」，再点「写入已接受」落盘。

### 7.7 对比

在「更改」面板点某个文件的「对比」，中间编辑器以左右并排的方式显示差异（新文件显示「对比新文件」）。并排对比里每一块改动旁有「暂存这块」，可只暂存这一块；新文件没有分块，仍用勾选暂存整个文件。

## 8. 侧栏

左侧栏顶部有四个标签：文件、搜索、更改、问题。

### 8.1 文件

- 文件树显示点开头的文件（如 `.wanwuignore`）。
- 有 Git 状态时，文件旁会标出：已修改、已暂存新增、已删除、未跟踪、冲突、重命名等；目录显示「含子变更」。
- 文件夹里没有 `.git` 时不会报错刷屏。

### 8.2 搜索

输入关键词搜索整个工作区，支持正则表达式；点结果跳到对应位置。没有结果时显示「无匹配结果」。

### 8.3 更改（源代码管理）

| 按钮 | 作用 |
|---|---|
| 刷新 | 重新读取 Git 状态 |
| 全部暂存 | 暂存所有更改 |
| 全部放弃 | 放弃全部更改，**未跟踪的文件会被删除**；点后需再点「确定放弃全部」 |
| 拉取 / 推送 | 调用 git 的 pull / push，失败时显示 git 自己的提示 |

每个文件一行：复选框暂存或取消暂存，「对比」并排看差异，「打开」在编辑器中打开，「放弃」放弃该文件更改（同样要二次确认）。还可以查看这个文件的最近提交。

底部填写「提交说明」，点「提交」。命令行 `wanwu commit-msg` 可根据 diff 生成约定式提交说明。

当前目录不是 Git 仓库时，这里会提示「当前文件夹不是 Git 仓库」。

### 8.4 问题

列出工作区的错误、警告、提示（来自语言服务与工作区检查器）。每一行可点开跳到位置；有「修复」按钮的可以从语言服务拿到修复项并应用。不能自动应用的修复项会置灰并说明。

## 9. 终端

- 点顶栏「终端」或 `Ctrl+\``（反引号）开关底部终端。
- 点「新建终端」增加终端，每个终端有自己的标签，可单独关闭。
- 在终端里按 `Ctrl/Cmd+K`，用自然语言描述想做的事（`Enter` 预览，`Esc` 取消），它会结合终端输出生成一条命令；先看预览，再点「运行」或「取消」。
- Agent 可通过 `@terminal` 读取最近的终端输出。

## 10. 规则、记忆与 WANWU.md

### 10.1 规则

规则是长期有效的约束，每次对话都会带上。

- 项目规则：`.wanwu/rules/`
- 个人规则：`~/.wanwu/rules/`

在 **设置 → 规则与记忆** 里可以新增、编辑、删除规则：填规则名、选范围（项目或个人）、写内容，点「保存规则」。

### 10.2 记忆

- 仓库级长期记忆在项目根目录的 `WANWU.md`。「Learned」小节里的条目会显示在「记忆」列表中，可以删除。
- 对话里说「记住……」时，Agent 会自动写入 `WANWU.md`。不想要这个行为：`WANWU_AUTO_MEMORY=0`。
- 兼容读取 `AGENTS.md`、`CLAUDE.md`。

### 10.3 `.wanwuignore`

写在项目根目录，列出 Agent 不应读取的路径（写法类似 `.gitignore`）。`Read` 和 `@文件` 会拒绝这些路径。

## 11. 权限与安全

- **权限模式**：见 3 章。命令行也遵守同一套策略。
- **deny-first**：危险命令默认拦截。可以用 `wanwu check-perm -p "<命令>"` 预览某条命令会被如何处理。
- **规则文件** `.wanwu/permissions.toml`：

```toml
[[rules]]
action = "deny"          # allow / ask / deny
pattern = "rm -rf /*"
reason = "destructive"

[[rules]]
action = "ask"
pattern = "git push*"

[[rules]]
action = "allow"
pattern = "WebFetch *"
```

- **沙箱**：Linux 用 `bwrap`，macOS 用 `sandbox-exec`，也可以用 Docker；都不可用时，只剩命令扫描式的路径限制，强度较弱。`wanwu doctor` 会报告当前可用的后端。
- 密钥只走环境变量或 `credentials.env`，不要写进仓库。

## 12. 扩展

### 12.1 MCP

在项目里放 `.wanwu/mcp.toml`、`.wanwu/mcp.json` 或 `.mcp.json`（按此顺序，取第一个存在的）：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

填 `url` 则走 HTTP / SSE；需要登录的用 `wanwu mcp-config login <名称>`，token 保存在 `~/.wanwu/mcp-oauth/`。详见 `docs/MCP.md`。

### 12.2 语言服务（LSP）

内置：TypeScript/JavaScript（自带）、Rust（`rust-analyzer`）、Python（`pyright-langserver`）、Go（`gopls`）、C/C++（`clangd`）；JSON/CSS/HTML 需要 PATH 里有对应服务。除 TS/JS 外，其他语言要你自己先装好服务程序。

覆盖或新增：在项目里写 `.wanwu/lsp.toml`（或 `.json`），或设环境变量 `WANWU_LSP_<ID>_COMMAND`。详见 `docs/LSP.md`。

### 12.3 插件

当前只支持安装 Skill（Markdown）与 MCP 配置片段，不会下载执行任意代码：

```bash
wanwu plugin list
wanwu plugin search <关键词>
wanwu plugin install <id> --scope workspace
wanwu plugin remove <id>
```

默认索引地址 `registry.wanwu.dev` 目前并未上线，请用 `--registry file://…` 或环境变量 `WANWU_PLUGIN_REGISTRY` 指向自己的索引。详见 `docs/PLUGINS.md`。

### 12.4 Hooks

在 `.wanwu/hooks.toml` 里配置工具调用前后要执行的本地检查，钩子会拿到 `WANWU_TOOL_NAME` 与 `WANWU_TOOL_ARGS`。可手动触发：`wanwu hooks PostToolUse`。

## 13. 命令行 `wanwu`

```bash
wanwu                       # 终端里进入交互 TUI
wanwu doctor                # 检查配置、provider、ACP 后端、记忆
wanwu inspect               # 以 JSON 输出合并后的配置、记忆、skills、hooks、mcp
wanwu exec -p "提示词"       # 一次性执行
wanwu plan -p "提示词"       # 把计划写入 .wanwu/plans/
wanwu verify                # 隔离的类型检查 / 测试 / lint 门禁
wanwu commit-msg            # 根据 git diff 生成提交说明
wanwu checkpoints           # 列出回合检查点
wanwu undo [id]             # 还原最近（或指定）检查点
wanwu memory-writeback -p "<备注>" --yes
wanwu check-perm -p "<bash 命令>"
wanwu cloud ...             # 无界面的云端任务（本地或 Docker 隔离，改动需审阅）
wanwu parallel ...          # 并行 worktree 隔离
wanwu plugin ...            # 插件
wanwu mcp-config ...        # MCP 配置与登录
```

常用环境变量：

| 变量 | 作用 |
|---|---|
| `WANWU_PROVIDER` / `WANWU_MODEL` | 临时覆盖 provider 与模型 |
| `OPENAI_BASE_URL` / `WANWU_PROVIDER_BASE_URL` | 临时覆盖接口地址 |
| `WANWU_FORCE_DETERMINISTIC=1` | 不调用大模型，走本地确定性流程 |
| `WANWU_STREAM=0` | 关闭流式输出（默认开启） |
| `WANWU_AUTO_MEMORY=0` | 关闭「记住」自动写入 |
| `WANWU_AGENT_MAX_TURNS` | 固定单次任务的最大回合数 |
| `WANWU_ACP_COMMAND` | 改用其他 ACP 后端 |

TUI 里 `Ctrl+T` 循环切换模式，`/ask`、`/plan`、`/agent`、`/verify` 快捷切换，`/history` 看会话历史，`/status` 看状态。

## 14. 快捷键与命令面板

| 快捷键 | 作用 |
|---|---|
| `F1` / `Ctrl+Shift+P` | 命令面板 |
| `Ctrl+,` | 模型设置 |
| `Ctrl+S` | 保存当前文件 |
| `Ctrl+\`` | 开关终端 |
| `Ctrl+I` | 聚焦 Agent 输入框 |
| `Ctrl+Enter` | 发送消息 |
| `Ctrl+K`（编辑器内） | 行内编辑 |
| `Ctrl+K`（终端内） | 生成终端命令 |
| `F12` | 转到定义 |
| `Shift+F12` | 查找引用 |
| `F2` | 重命名符号 |
| `Ctrl+.` | 快速修复 |
| `Tab` | 接受预测 / 跳到下一处修改 |

macOS 上 `Ctrl` 换成 `Cmd`。

命令面板里可以直接运行：转到定义、查找引用、重命名、快速修复、打开文件夹、保存当前文件、开关终端、设置、聚焦 Agent 输入、将编辑器选区加入 Agent、终端 Ctrl+K 生成命令、全局搜索、文件树、切换模式。

## 15. 常见问题

**安装时提示「未知发布者」。** 安装包没有代码签名。点「更多信息 → 仍要运行」。

**Agent 一直在「超时」，WebFetch 要不停确认。** 默认 `ask` 模式需要你点允许。想省事：在设置里把权限模式改成 `accept-edits`，或在 `.wanwu/permissions.toml` 里给 `WebFetch *` 加一条 `allow` 规则。

**Agent 回答像是固定模板，没有真的调用模型。** 没配密钥或设了 `WANWU_FORCE_DETERMINISTIC=1`。到「模型设置」填 Key，运行 `wanwu doctor` 确认。

**开发模式白屏或 `ERR_CONNECTION_REFUSED`。** 关掉旧的 Node / Electron 窗口再 `pnpm shell:dev`，日志里应出现 `==> Vite ready`。

**`pnpm install` 后 Electron 提示缺少 `path.txt`。** 多半是 Node 24.16 及以上；换成 Node 22 LTS。

**更改面板里推送或拉取失败。** 界面显示的是 git 自己的报错。通常是没有远程、没有凭据或网络不通；无凭据时会尽快失败，不会卡住。

**文件夹不是 Git 仓库。** 在终端运行 `git init`，再点「刷新」。

## 16. 已知限制

- 不提供云端 Agent、Bugbot 式自动评审、DAP 调试器。
- MCP 目前支持工具与资源，不支持 prompts。
- 行级 blame 只显示最近一次提交。
- 「上下文 N%」在模型返回用量之前不含代码库索引。
- 浏览器工具只记录点击与输入，不执行页面脚本。
- 没有 bwrap、Seatbelt 或 Docker 时，路径限制只是命令扫描，不是真正的隔离。
- 插件默认索引未上线。
- 单纯的类型不匹配，语言服务不一定给出可自动应用的快速修复。
- Windows 安装包未签名，也未在真机上做过完整安装验证。

## 相关文档

- `docs/INSTALL.md` 安装与构建
- `docs/PROVIDERS.md` 多模型配置
- `docs/MCP.md`、`docs/LSP.md`、`docs/PLUGINS.md` 扩展
- `docs/WORKFLOW.md` 推荐工作流
- `docs/ARCHITECTURE.md` 架构
- `CHANGELOG.md` 版本变更
