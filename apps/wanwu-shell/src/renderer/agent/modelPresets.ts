/** No bundled model list — only the user's saved model appears in the picker. */
export const MODEL_PRESETS: Record<string, readonly string[]> = {};

/** Current model only (no product presets). */
export function modelsForProvider(_provider: string, current: string): string[] {
  const cur = current.trim();
  return cur ? [cur] : [];
}
