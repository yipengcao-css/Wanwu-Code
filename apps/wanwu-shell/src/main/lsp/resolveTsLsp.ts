import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { LspLaunchPlan } from "./types.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** src/main/lsp or dist/electron/lsp → monorepo root */
function findRepoRoot(): string {
  return path.resolve(here, "../../../../../");
}

/**
 * Resolve typescript-language-server launch plan.
 * Order: WANWU_TSSERVER_COMMAND → local node_modules bin → PATH name.
 */
export function resolveTsLspLaunch(opts?: {
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
}): LspLaunchPlan | undefined {
  const env = opts?.env ?? process.env;
  const override = env.WANWU_TSSERVER_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    const cmd = parts[0]!;
    const rest = parts.slice(1);
    return { command: cmd, args: [...rest, "--stdio"] };
  }

  const candidates: string[] = [];
  try {
    const pkgJson = require.resolve("typescript-language-server/package.json");
    const dir = path.dirname(pkgJson);
    candidates.push(
      path.join(dir, "lib", "cli.mjs"),
      path.join(dir, "lib", "cli.js"),
    );
  } catch {
    /* not installed next to shell */
  }

  const roots = [opts?.repoRoot, findRepoRoot()].filter(Boolean) as string[];
  for (const root of roots) {
    candidates.push(
      path.join(root, "node_modules", ".bin", "typescript-language-server"),
      path.join(
        root,
        "apps",
        "wanwu-shell",
        "node_modules",
        ".bin",
        "typescript-language-server",
      ),
      path.join(
        root,
        "node_modules",
        "typescript-language-server",
        "lib",
        "cli.mjs",
      ),
    );
  }

  for (const c of candidates) {
    if (c && existsSync(c)) {
      if (c.endsWith(".mjs") || c.endsWith(".js")) {
        return { command: process.execPath, args: [c, "--stdio"] };
      }
      return { command: c, args: ["--stdio"] };
    }
  }

  // Last resort: hope it's on PATH (dev machines with global install).
  return { command: "typescript-language-server", args: ["--stdio"] };
}
