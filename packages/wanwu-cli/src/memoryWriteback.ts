import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface WritebackOptions {
  note: string;
  yes?: boolean;
  cwd?: string;
}

/** Append a confirmed lesson/convention into WANWU.md under "## Learned". */
export function writebackMemory(opts: WritebackOptions): string {
  const cwd = opts.cwd ?? findWorkspaceRoot();
  const path = join(cwd, "WANWU.md");
  const stamp = new Date().toISOString().slice(0, 10);
  const entry = `\n- (${stamp}) ${opts.note.trim()}\n`;

  if (!opts.yes) {
    console.log(`Dry-run writeback to ${path}:`);
    console.log(entry);
    console.log("Re-run with --yes to apply.");
    return path;
  }

  if (!existsSync(path)) {
    writeFileSync(path, `# WANWU.md\n\n## Learned\n${entry}`, "utf8");
    return path;
  }

  const current = readFileSync(path, "utf8");
  if (!/^## Learned/m.test(current)) {
    appendFileSync(path, `\n## Learned\n${entry}`, "utf8");
  } else {
    const updated = current.replace(/^(## Learned\n)/m, `$1${entry}`);
    writeFileSync(path, updated, "utf8");
  }
  console.log(`Updated ${path}`);
  return path;
}