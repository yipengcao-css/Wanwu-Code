# 多模型 Provider（E2-B）

Wanwu 通过 `@wanwu/providers` 调用 LLM（BYOK）。`acp_backend=wanwu-native` 时：

- **有凭据** → `wanwu exec` / ACP prompt 走真实 chat  
- **无凭据** → 确定性 native loop（本地/CI 可测）  
- **强制确定性**：`WANWU_FORCE_DETERMINISTIC=1`

## 支持的后端

| Provider | 协议 | 密钥 env | 默认 base |
|---|---|---|---|
| `openai` | OpenAI Chat Completions | `OPENAI_API_KEY` | `https://api.openai.com/v1` |
| `xai` | OpenAI-compatible | `XAI_API_KEY` | `https://api.x.ai/v1` |
| `anthropic` | Messages API | `ANTHROPIC_API_KEY` | `https://api.anthropic.com` |
| `ollama` | OpenAI-compatible | （无需） | `http://127.0.0.1:11434/v1` |
| `custom` | OpenAI-compatible | `WANWU_API_KEY` | **必须配置** `base_url` |

## OpenAI 兼容代理（如 DeepSeek）

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.deepseek.com"   # 自动补 /v1
export WANWU_MODEL="deepseek-chat"
pnpm wanwu doctor
pnpm wanwu exec -p "只回复一个词：pong"
```

或在 `~/.wanwu/config.toml`：

```toml
active_provider = "openai"
model = "deepseek-chat"

[providers.openai]
api_key_env = "OPENAI_API_KEY"
base_url = "https://api.deepseek.com"
default_model = "deepseek-chat"
```

### Desktop（Wanwu Shell）

应用内 **模型设置**（Ctrl/Cmd+,）写入：

- `~/.wanwu/config.toml` — provider / model / base_url（无密钥）
- `~/.wanwu/credentials.env` — `OPENAI_API_KEY=…` 等（文件权限 0600，**禁止提交仓库**）

保存后会 dispose 当前 ACP，下次 Agent 回合自动带上凭据。

## 环境变量速查

| Env | 作用 |
|---|---|
| `WANWU_PROVIDER` | 临时覆盖 active provider |
| `WANWU_MODEL` | 临时覆盖模型名 |
| `WANWU_PROVIDER_BASE_URL` | 临时覆盖 base URL |
| `OPENAI_BASE_URL` | openai provider 的 base |
| `WANWU_FORCE_DETERMINISTIC=1` | 禁用 LLM |
| `WANWU_LIVE_PROVIDERS=1` | 启用 `scripts/e2e-providers-live.mts` |
| `WANWU_LIVE_OPENAI_2_KEY` / `_BASE_URL` / `_MODEL` | 第二家 OpenAI 兼容端点（如 Moonshot） |
| `WANWU_LIVE_REQUIRE_TWO=1` | live 脚本要求至少 2 家通过 |

## 多轮 Tool-Calling

有密钥时 `wanwu exec` / ACP 走 `runLlmAgentLoop`：

- 工具：`Read` / `Glob` / `Grep` / `Edit` / `Bash`
- 上限：`WANWU_AGENT_MAX_TURNS`（默认 6）
- Plan/Ask 模式阻止 Edit

Fixture：`packages/wanwu-providers/fixtures/openai-tool-round*.json`

## 测试

- Fixture（无网络）：`pnpm --filter @wanwu/providers test` / 根 `pnpm test`  
- Live：`WANWU_LIVE_PROVIDERS=1` + 密钥后运行 `pnpm exec tsx scripts/e2e-providers-live.mts`
