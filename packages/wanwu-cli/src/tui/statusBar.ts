import type { TuiTheme } from "./theme.js";
import { color } from "./theme.js";

export interface StatusBarState {
  mode: string;
  provider: string;
  model: string;
  llm: boolean;
  workspace: string;
  toolsRunning: number;
}

export function renderStatusBar(state: StatusBarState, theme: TuiTheme): string {
  const left = `${color(theme, "prompt", "wanwu")} ${color(theme, "mode", state.mode)}`;
  const mid = `${state.provider}/${state.model} · llm=${state.llm ? "on" : "off"}`;
  const right = `${state.workspace} · tools=${state.toolsRunning}`;
  return `${left}  ${color(theme, "muted", mid)}  ${color(theme, "muted", right)}`;
}
