import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FixtureTree {
  root: string;
  files: number;
  dirs: number;
}

/**
 * Build a deterministic fixture tree for tool benchmarks.
 * Default: 4 dirs × 50 files = 200 files.
 */
export function buildFixtureTree(opts?: { dirs?: number; filesPerDir?: number }): FixtureTree {
  const dirs = opts?.dirs ?? 4;
  const filesPerDir = opts?.filesPerDir ?? 50;
  const root = mkdtempSync(join(tmpdir(), "wanwu-bench-"));
  let files = 0;
  for (let d = 0; d < dirs; d += 1) {
    const dir = join(root, `dir-${d}`);
    mkdirSync(dir, { recursive: true });
    for (let f = 0; f < filesPerDir; f += 1) {
      const name = f % 5 === 0 ? `file-${f}.ts` : `file-${f}.txt`;
      writeFileSync(
        join(dir, name),
        `// fixture ${d}/${f}\nexport const value = ${f};\nneedle-token-${d}\n`,
        "utf8",
      );
      files += 1;
    }
  }
  writeFileSync(join(root, "README.md"), "# Bench Fixture\n", "utf8");
  files += 1;
  return { root, files, dirs };
}
