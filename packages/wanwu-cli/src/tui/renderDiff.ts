const MAX_LINES = Number(process.env.WANWU_TUI_DIFF_MAX_LINES ?? "80") || 80;

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/**
 * Very small line-based diff renderer for TUI.
 * Shows removed/added lines with ANSI colors; truncates long files.
 */
export function renderDiff(path: string, before: string, after: string): string {
  const a = splitLines(before);
  const b = splitLines(after);
  const out: string[] = [`\x1b[1m${path}\x1b[0m`];

  const max = Math.max(a.length, b.length);
  let shown = 0;
  for (let i = 0; i < max && shown < MAX_LINES; i += 1) {
    const oldLine = a[i];
    const newLine = b[i];
    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        out.push(`  ${oldLine}`);
        shown += 1;
      }
      continue;
    }
    if (oldLine !== undefined) {
      out.push(`\x1b[31m- ${oldLine}\x1b[0m`);
      shown += 1;
    }
    if (newLine !== undefined) {
      out.push(`\x1b[32m+ ${newLine}\x1b[0m`);
      shown += 1;
    }
  }
  if (max > MAX_LINES) {
    out.push(`\x1b[90m… truncated (${max - MAX_LINES} more lines)\x1b[0m`);
  }
  return out.join("\n");
}
