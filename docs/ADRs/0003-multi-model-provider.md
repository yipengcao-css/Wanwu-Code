# ADR 0003：多模型对等接入

## 状态

已接受（2026-08-10）

## 背景

单绑某一模型厂商会让产品身份与供应链风险耦合。用户已分别持有 xAI / OpenAI / Anthropic / 本地 Ollama 等密钥。

## 决策

1. **第一天起多模型对等**：`xai` / `openai` / `anthropic` / `ollama` / `custom`（OpenAI-compatible）。
2. 配置使用 `active_provider` + `model`，不在产品层写死唯一默认厂商。
3. 可采用“推荐预设”，但不得把产品能力锁死在单一 API。
4. 当 ACP 后端（如 grok 桥接）暂不支持某 provider 时：
   - `wanwu doctor` 明确说明限制
   - 优先在 wanwu provider 层补齐 headless/exec 路径
   - 路线图指向 `wanwu-native` 统一多模型

## 配置示意

```toml
active_provider = "openai"
model = "gpt-5"
acp_backend = "grok"  # grok | wanwu-native

[providers.xai]
api_key_env = "XAI_API_KEY"

[providers.openai]
api_key_env = "OPENAI_API_KEY"

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[providers.ollama]
base_url = "http://127.0.0.1:11434"
```

## 后果

**正面**

- 用户可按任务/成本/隐私切换模型
- 降低单厂商配额与政策风险

**负面 / 风险**

- Provider 差异导致工具调用/流式行为不一致 → 需要归一化层与集成测试
- 桥接期能力可能不对称 → 必须在 UI/doctor 中诚实暴露

## 替代方案（否决）

- **Grok 唯一默认且不可切换**：违背已确认产品决策
