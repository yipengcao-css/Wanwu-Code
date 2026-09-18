import type { TuiTheme } from "./theme.js";
import { color } from "./theme.js";

export interface StatusBarState {
  mode: string;
  provider: string;
  model: string;
  llm: boolean;
  workspace: string;
  toolsRunning: number;
  /** Whether the LLM loop streams tokens (default on). */
  stream?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export function formatUsage(state: Pick<StatusBarState, "inputTokens" | "outputTokens" | "totalTokens">): string {
  if (
    state.inputTokens === undefined &&
    state.outputTokens === undefined &&
    state.totalTokens === undefined
  ) {
    return "";
  }
  const inn = state.inputTokens ?? 0;
  const out = state.outputTokens ?? 0;
  const total = state.totalTokens ?? inn + out;
  return `in ${inn} / out ${out} / total ${total}`;
}

export function renderStatusBar(state: StatusBarState, theme: TuiTheme): string {
  const left = `${color(theme, "prompt", "wanwu")} ${color(theme, "mode", state.mode)}`;
  const stream = state.stream === false ? "stream=off" : "stream=on";
  const mid = `${state.provider}/${state.model} · llm=${state.llm ? "on" : "off"} · ${stream}`;
  const usage = formatUsage(state);
  const right = usage
    ? `${state.workspace} · tools=${state.toolsRunning} · ${usage}`
    : `${state.workspace} · tools=${state.toolsRunning}`;
  return `${left}  ${color(theme, "muted", mid)}  ${color(theme, "muted", right)}`;
}
