export type FileRef = {
  path: string;
  line?: number;
  start: number;
  end: number;
};

/**
 * Workspace-relative paths a person can click.
 * `src/a.ts:12` and `src/a.ts` count. A bare `a.ts:12` counts.
 * URLs and drive-letter paths are left alone.
 */
const REF =
  /(?<![\w@./:\\-])((?:[\w.@-]+\/)+[\w.@-]+\.[A-Za-z0-9]{1,10}|[\w.@-]+\.[A-Za-z0-9]{1,10}:\d+)(?::(\d+))?(?::\d+)?/g;

export function findFileRefs(text: string): FileRef[] {
  const out: FileRef[] = [];
  REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF.exec(text))) {
    const raw = m[1] ?? "";
    const before = text.slice(Math.max(0, m.index - 8), m.index);
    if (/https?:?$/i.test(before) || /https?:\/\//i.test(before)) continue;
    let path = raw;
    let line = m[2] ? Number(m[2]) : undefined;
    const inline = raw.match(/^(.*):(\d+)$/);
    if (inline && !raw.includes("/")) {
      path = inline[1]!;
      line = Number(inline[2]);
    }
    if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path)) continue;
    out.push({
      path: path.replace(/\\/g, "/"),
      line: line && line > 0 ? line : undefined,
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}
