import { useEffect, useState } from "react";

const PROVIDERS = [
  { id: "openai", label: "OpenAI 兼容（DeepSeek / Moonshot…）" },
  { id: "anthropic", label: "Anthropic" },
  { id: "xai", label: "xAI" },
  { id: "ollama", label: "Ollama（本地）" },
  { id: "custom", label: "自定义 OpenAI-compatible" },
] as const;

type Snapshot = {
  activeProvider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  configPath: string;
};

export function SettingsDrawer(props: {
  open: boolean;
  onClose: () => void;
  onSaved?: (s: Snapshot) => void;
}) {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [configPath, setConfigPath] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    void window.wanwu.settings.get().then((s) => {
      setProvider(s.activeProvider);
      setModel(s.model);
      setBaseUrl(s.baseUrl);
      setHasKey(s.hasApiKey);
      setConfigPath(s.configPath);
      setApiKey("");
      setStatus(null);
    });
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  async function save(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const s = await window.wanwu.settings.save({
        activeProvider: provider,
        model,
        baseUrl,
        apiKey: apiKey.trim() ? apiKey : undefined,
      });
      setHasKey(s.hasApiKey);
      setApiKey("");
      setStatus("已保存。新的 Agent 会话将使用此配置。");
      props.onSaved?.(s);
      // Force ACP restart so credentials/config take effect
      await window.wanwu.acp.dispose();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onClick={props.onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <div>
            <h2 id="settings-title">模型与密钥</h2>
            <p className="drawer-sub">BYOK · 密钥写入本机 `~/.wanwu/credentials.env`，不进仓库</p>
          </div>
          <button type="button" className="btn" onClick={props.onClose} aria-label="关闭设置">
            关闭
          </button>
        </header>

        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="field">
            <span className="field-label">Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">模型</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如 deepseek-chat"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">Base URL（可选）</span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field-label">API Key {hasKey ? "· 已配置（留空不改）" : ""}</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? "••••••••（输入新密钥以替换）" : "sk-…"}
              autoComplete="off"
            />
          </label>

          <p className="field-hint">配置文件：{configPath || "~/.wanwu/config.toml"}</p>

          {status ? <p className="settings-status">{status}</p> : null}

          <div className="drawer-actions">
            <button type="button" className="btn" onClick={props.onClose}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "保存中…" : "保存设置"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
