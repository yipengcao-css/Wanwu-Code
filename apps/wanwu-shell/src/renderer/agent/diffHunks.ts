export type DiffBlock =
  | { type: "context"; lines: string[] }
  | { type: "change"; id: number; removed: string[]; added: string[] };

const MAX_LINES = 4000;

/**
 * Line-level diff (LCS) grouped into blocks. Contiguous changed lines form one
 * "change" block that the user can accept (use `added`) or reject (keep
 * `removed`). Unchanged lines are `context`. Large inputs fall back to a single
 * whole-file change block.
 */
export function computeBlocks(before: string, after: string): DiffBlock[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [{ type: "change", id: 0, removed: a, added: b }];
  }

  // LCS table.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  type Op = { t: "eq" | "del" | "add"; line: string };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: "eq", line: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ t: "del", line: a[i]! });
      i += 1;
    } else {
      ops.push({ t: "add", line: b[j]! });
      j += 1;
    }
  }
  while (i < n) ops.push({ t: "del", line: a[i++]! });
  while (j < m) ops.push({ t: "add", line: b[j++]! });

  // Fold into blocks.
  const blocks: DiffBlock[] = [];
  let changeId = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k]!.t === "eq") {
      const lines: string[] = [];
      while (k < ops.length && ops[k]!.t === "eq") lines.push(ops[k++]!.line);
      blocks.push({ type: "context", lines });
    } else {
      const removed: string[] = [];
      const added: string[] = [];
      while (k < ops.length && ops[k]!.t !== "eq") {
        const op = ops[k++]!;
        if (op.t === "del") removed.push(op.line);
        else added.push(op.line);
      }
      blocks.push({ type: "change", id: changeId++, removed, added });
    }
  }
  return blocks;
}

/** Rebuild file content, applying only the accepted change blocks. */
export function applyBlocks(blocks: DiffBlock[], accepted: Set<number>): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "context") {
      out.push(...block.lines);
    } else if (accepted.has(block.id)) {
      out.push(...block.added);
    } else {
      out.push(...block.removed);
    }
  }
  return out.join("\n");
}

export function changeBlockCount(blocks: DiffBlock[]): number {
  return blocks.filter((b) => b.type === "change").length;
}
