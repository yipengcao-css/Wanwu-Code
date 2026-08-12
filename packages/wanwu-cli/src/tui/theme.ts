export interface TuiTheme {
  name: string;
  prompt: string;
  mode: string;
  accent: string;
  success: string;
  error: string;
  muted: string;
}

export const THEMES: Record<string, TuiTheme> = {
  default: {
    name: "default",
    prompt: "\x1b[36m",
    mode: "\x1b[33m",
    accent: "\x1b[32m",
    success: "\x1b[32m",
    error: "\x1b[31m",
    muted: "\x1b[90m",
  },
  mono: {
    name: "mono",
    prompt: "",
    mode: "",
    accent: "",
    success: "",
    error: "",
    muted: "",
  },
  highContrast: {
    name: "highContrast",
    prompt: "\x1b[96m",
    mode: "\x1b[93m",
    accent: "\x1b[92m",
    success: "\x1b[92m",
    error: "\x1b[91m",
    muted: "\x1b[37m",
  },
};

export function resolveTheme(name?: string): TuiTheme {
  const key = name ?? process.env.WANWU_TUI_THEME ?? "default";
  return THEMES[key] ?? THEMES.default!;
}

export function color(theme: TuiTheme, role: keyof TuiTheme, text: string): string {
  const code = theme[role];
  if (!code) return text;
  return `${code}${text}\x1b[0m`;
}
