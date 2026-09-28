/** Line hunks so a review can accept or reject each change. */

export interface DiffHunk {
  id: string;
  /** 1-based line in the original file. */
  startLine: number;
  before: string[];
  after: string[];
}

export function diffHunks(before: string, after: string): DiffHunk[] {
  if (before === after) return [];
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 250_000) return coarseHunk(a, b);
  return groupOps(lineDiff(a, b));
}

export function applyHunkChoices(
  before: string,
  hunks: DiffHunk[],
  accepted: Readonly<Record<string, boolean>>,
): string {
  const src = before.split("\n");
  const out: string[] = [];
  let i = 0;
  for (const hunk of hunks) {
    const start = Math.max(0, hunk.startLine - 1);
    while (i < start && i < src.length) out.push(src[i++]!);
    if (accepted[hunk.id] !== false) out.push(...hunk.after);
    else out.push(...hunk.before);
    i += hunk.before.length;
  }
  while (i < src.length) out.push(src[i++]!);
  return out.join("\n");
}

function coarseHunk(a: string[], b: string[]): DiffHunk[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }
  if (endA < start && endB < start) return [];
  return [
    {
      id: "h1",
      startLine: start + 1,
      before: a.slice(start, endA + 1),
      after: b.slice(start, endB + 1),
    },
  ];
}

type Op =
  | { op: "="; text: string }
  | { op: "-"; text: string; aIndex: number }
  | { op: "+"; text: string; aIndex: number };

function lineDiff(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "=", text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ op: "-", text: a[i]!, aIndex: i });
      i += 1;
    } else {
      ops.push({ op: "+", text: b[j]!, aIndex: i });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ op: "-", text: a[i]!, aIndex: i });
    i += 1;
  }
  while (j < m) {
    ops.push({ op: "+", text: b[j]!, aIndex: i });
    j += 1;
  }
  return ops;
}

function groupOps(ops: Op[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  const push = (): void => {
    if (!current) return;
    if (current.before.join("\n") !== current.after.join("\n")) hunks.push(current);
    current = null;
  };
  for (const op of ops) {
    if (op.op === "=") {
      push();
      continue;
    }
    if (!current) {
      current = {
        id: `h${hunks.length + 1}`,
        startLine: op.aIndex + 1,
        before: [],
        after: [],
      };
    }
    if (op.op === "-") current.before.push(op.text);
    else current.after.push(op.text);
  }
  push();
  return hunks;
}
