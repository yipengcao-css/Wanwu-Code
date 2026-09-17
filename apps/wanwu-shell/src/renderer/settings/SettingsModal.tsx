import { useState } from "react";

type SettingsView = Awaited<ReturnType<typeof window.wanwu.settings.get>>;
type ProviderId = SettingsView["activeProvider"];
type AgentBackend = SettingsView["agentBackend"];

const PROVIDERS: ProviderId[] = ["openai", "xai", "anthropic", "ollama", "custom"];
const KEY_ENV: Record<ProviderId, string> = {
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  custom: "WANWU_API_KEY",
  ollama: "(无需密钥)",
};

export function SettingsModal(props: {
  initial: SettingsView;
  onClose: () => void;
  onSaved: (view: SettingsView) => void;
}) {
  const [provider, setProvider] = useState<ProviderId>(props.initial.activeProvider);
  const [model, setModel] = useState(props.initial.model);
  const [baseUrl, setBaseUrl] = useState(props.initial.baseUrl);
  const [fontSize, setFontSize] = useState(props.initial.fontSize);
  const [verifyCommand, setVerifyCommand] = useState(props.initial.verifyCommand);
  const [agentBackend, setAgentBackend] = useState<AgentBackend>(props.initial.agentBackend);
  const [grokCommand, setGrokCommand] = useState(props.initial.grokCommand);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; code?: string; message: string } | null>(null);

  const keySet = props.initial.apiKeysSet[provider];

  function buildPatch(): Parameters<typeof window.wanwu.settings.set>[0] {
    const patch: Parameters<typeof window.wanwu.settings.set>[0] = {
      activeProvider: provider,
      model,
      baseUrl,
      fontSize,
      verifyCommand,
      agentBackend,
      grokCommand,
    };
    if (apiKey.trim()) patch.apiKeys = { [provider]: apiKey.trim() };
    return patch;
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const view = await window.wanwu.settings.set(buildPatch());
      props.onSaved(view);
      props.onClose();
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      // Persist current form first so the test uses the values on screen.
      const view = await window.wanwu.settings.set(buildPatch());
      props.onSaved(view);
      setApiKey("");
      const res = await window.wanwu.provider.test();
      setTestResult({ ok: res.ok, code: res.code, message: res.message });
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal settings-modal">
        <h3>设置 · Agent 与编辑器</h3>
        <div className="settings-grid">
          <label>Agent 后端</label>
          <div className="settings-key">
            <select value={agentBackend} onChange={(e) => setAgentBackend(e.target.value as AgentBackend)}>
              <option value="wanwu-native">wanwu-native（内置，多模型）</option>
              <option value="grok">grok（开源 CLI，底层）</option>
            </select>
            <span className="settings-hint">
              {agentBackend === "grok"
                ? "使用开源 grok CLI 的 ACP，需本机安装 grok"
                : "内置原生 Agent，走下方 Provider/Model"}
            </span>
          </div>

          {agentBackend === "grok" ? (
            <>
              <label>grok 命令</label>
              <input
                placeholder="grok acp"
                value={grokCommand}
                onChange={(e) => setGrokCommand(e.target.value)}
              />
            </>
          ) : null}

          <label>Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <label>Model</label>
          <input placeholder="如 gpt-4o / claude-sonnet-4 / grok-4" value={model} onChange={(e) => setModel(e.target.value)} />

          <label>API Key</label>
          <div className="settings-key">
            <input
              type="password"
              placeholder={keySet ? "已设置（留空保持不变）" : `设置 ${KEY_ENV[provider]}`}
              value={apiKey}
              disabled={provider === "ollama"}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <span className="settings-hint">
              {provider === "ollama" ? "本地无需密钥" : `注入为环境变量 ${KEY_ENV[provider]}（仅本机存储，不入库）`}
            </span>
          </div>

          <label>Base URL</label>
          <input
            placeholder={provider === "custom" ? "如 https://api.deepseek.com" : "（可选，custom/ollama）"}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />

          <label>编辑器字号</label>
          <input
            type="number"
            min={10}
            max={24}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value) || 13)}
          />

          <label>验证命令</label>
          <input
            placeholder="如 pnpm test / pnpm lint"
            value={verifyCommand}
            onChange={(e) => setVerifyCommand(e.target.value)}
          />
        </div>
        {testResult ? (
          <div className={`settings-test ${testResult.ok ? "ok" : "fail"}`}>
            {testResult.ok ? "✓ " : "✗ "}
            {testResult.code ? `[${testResult.code}] ` : ""}
            {testResult.message}
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={props.onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn"
            disabled={testing || saving || agentBackend === "grok"}
            title={agentBackend === "grok" ? "grok 后端由 grok CLI 自行管理模型，此测试针对 Provider" : "保存并测试 Provider 连接"}
            onClick={() => void testConnection()}
          >
            {testing ? "测试中…" : "测试连接"}
          </button>
          <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存并重启 Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
