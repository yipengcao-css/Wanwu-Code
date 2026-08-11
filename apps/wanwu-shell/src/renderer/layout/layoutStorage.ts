export type ShellLayout = {
  filesW: number;
  agentW: number;
  termH: number;
  termOpen: boolean;
};

const KEY = "wanwu.shell.layout.v1";

const DEFAULTS: ShellLayout = {
  filesW: 220,
  agentW: 420,
  termH: 220,
  termOpen: false,
};

export function loadLayout(): ShellLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ShellLayout>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLayout(layout: ShellLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}
