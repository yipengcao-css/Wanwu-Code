/** Presets for the active provider. Keys and base URLs stay in the full settings drawer. */
export const MODEL_PRESETS: Record<string, readonly string[]> = {
  xai: ["grok-4"],
  openai: ["gpt-5", "deepseek-chat"],
  anthropic: ["claude-sonnet-4"],
  ollama: ["llama3.2"],
  custom: ["deepseek-chat"],
};

/** Current model first when it is not already a preset. */
export function modelsForProvider(provider: string, current: string): string[] {
  const base = [...(MODEL_PRESETS[provider] ?? [])];
  const cur = current.trim();
  if (cur && !base.includes(cur)) base.unshift(cur);
  return base;
}
