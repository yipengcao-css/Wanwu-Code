import type { WanwuMode } from "@wanwu/config";

export const MODE_CYCLE: WanwuMode[] = ["ask", "plan", "agent", "verify"];

export function nextMode(mode: WanwuMode): WanwuMode {
  const idx = MODE_CYCLE.indexOf(mode);
  return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length] ?? "agent";
}

export function detectMode(prompt: string, fallback: WanwuMode): WanwuMode {
  if (/\[MODE=plan\]/i.test(prompt)) return "plan";
  if (/\[MODE=agent\]/i.test(prompt)) return "agent";
  if (/\[MODE=ask\]/i.test(prompt)) return "ask";
  if (/\[MODE=verify\]/i.test(prompt)) return "verify";
  return fallback;
}

export function stripModeTags(prompt: string): string {
  return prompt.replace(/\[MODE=\w+\]/gi, "").trim();
}
