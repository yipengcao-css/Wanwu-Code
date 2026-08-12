export interface PaneContent {
  lines: string[];
}

export interface LayoutOptions {
  cols: number;
  rows: number;
  /** Right pane width ratio (0-1). Set 0 to disable. */
  rightRatio?: number;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

function truncate(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  let out = "";
  let len = 0;
  for (const ch of text) {
    const chLen = visibleLength(ch);
    if (len + chLen > width - 1) break;
    out += ch;
    len += chLen;
  }
  return out + "…";
}

function pad(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return truncate(text, width);
  return text + " ".repeat(width - len);
}

/**
 * Compose a 3-pane frame: chat (left) + tools (right) + status (bottom).
 * Returns lines ready to write to terminal.
 */
export function composeFrame(
  chat: string[],
  tools: string[],
  status: string,
  prompt: string,
  opts: LayoutOptions,
): string[] {
  const { cols, rows } = opts;
  const rightRatio = opts.rightRatio ?? 0.3;
  const rightWidth = rightRatio > 0 ? Math.max(20, Math.floor(cols * rightRatio)) : 0;
  const leftWidth = rightWidth > 0 ? cols - rightWidth - 1 : cols;

  const bodyRows = Math.max(1, rows - 2); // status + prompt
  const chatLines = chat.slice(-bodyRows);
  const toolLines = tools.slice(-bodyRows);

  const out: string[] = [];
  for (let i = 0; i < bodyRows; i += 1) {
    const left = pad(chatLines[i] ?? "", leftWidth);
    if (rightWidth > 0) {
      const right = pad(toolLines[i] ?? "", rightWidth);
      out.push(`${left}│${right}`);
    } else {
      out.push(left);
    }
  }
  out.push(pad(status, cols));
  out.push(prompt);
  return out;
}
