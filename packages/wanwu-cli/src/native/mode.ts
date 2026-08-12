import type { WanwuMode } from "@wanwu/config";

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
