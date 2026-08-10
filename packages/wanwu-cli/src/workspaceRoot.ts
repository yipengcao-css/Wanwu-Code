import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Walk upward to the Wanwu monorepo / project root. */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (
      existsSync(join(dir, "pnpm-workspace.yaml")) ||
      existsSync(join(dir, "WANWU.md")) ||
      existsSync(join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
}