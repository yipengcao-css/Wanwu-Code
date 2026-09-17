import { ipcMain } from "electron";
import { completeChat, ProviderError } from "@wanwu/providers";
import { DEFAULT_CONFIG, type WanwuConfig } from "@wanwu/config";
import { agentEnv, loadSettings } from "../settings.js";

export type ProviderTestResult = {
  ok: boolean;
  provider: string;
  model: string;
  code?: string;
  message: string;
};

/**
 * In-product connectivity check: sends a tiny prompt through the SAME provider
 * layer the agent uses (honoring Settings provider/model/base URL/API key), so
 * the user can confirm from the UI whether their endpoint is usable — and get a
 * precise reason (auth / quota / network / bad model) when it is not.
 */
export function registerProviderTestIpc(): void {
  ipcMain.handle("provider:test", async (): Promise<ProviderTestResult> => {
    const s = loadSettings();
    const provider = s.activeProvider;
    const model = s.model.trim() || DEFAULT_CONFIG.providers[provider]?.defaultModel || "";
    const config: WanwuConfig = {
      ...DEFAULT_CONFIG,
      activeProvider: provider,
      model,
      providers: {
        ...DEFAULT_CONFIG.providers,
        [provider]: {
          ...(DEFAULT_CONFIG.providers[provider] ?? {}),
          baseUrl: s.baseUrl.trim() || DEFAULT_CONFIG.providers[provider]?.baseUrl,
        },
      },
    };
    try {
      const res = await completeChat({
        config,
        providerId: provider,
        env: { ...process.env, ...agentEnv() },
        request: {
          model: model || undefined,
          messages: [{ role: "user", content: "Reply with the single word: pong" }],
          maxTokens: 16,
          temperature: 0,
        },
      });
      return {
        ok: true,
        provider,
        model: res.model,
        message: `可用 ✓ 模型 ${res.model} 返回：${res.text.slice(0, 80)}`,
      };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { ok: false, provider, model, code: err.code, message: err.message };
      }
      return { ok: false, provider, model, message: err instanceof Error ? err.message : String(err) };
    }
  });
}
