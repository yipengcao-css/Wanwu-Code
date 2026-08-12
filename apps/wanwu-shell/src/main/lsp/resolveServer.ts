import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { LspLaunchPlan, LspServerDef } from "./types.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

/** src/main/lsp or dist/electron/lsp → monorepo root */
function findRepoRoot(): string {
  return path.resolve(here, "../../../../../");
}

function commandExistsOnPath(cmd: string): boolean {
  const paths = (process.env.PATH ?? "").split(path.delimiter);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of paths) {
    for (const ext of exts) {
      if (existsSync(path.join(dir, cmd + ext))) return true;
    }
  }
  return false;
}

/**
 * Resolve launch plan for an LSP server.
 * Order: WANWU_LSP_<ID>_COMMAND → bundled typescript-language-server → PATH.
 */
export function resolveLspServer(
  def: LspServerDef,
  opts?: { repoRoot?: string; env?: NodeJS.ProcessEnv },
): LspLaunchPlan | undefined {
  const env = opts?.env ?? process.env;
  const envKey = `WANWU_LSP_${def.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_COMMAND`;
  const override = env[envKey]?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    return { command: parts[0]!, args: [...parts.slice(1), ...def.args] };
  }

  // Legacy TS override
  if (def.id === "typescript") {
    const legacy = env.WANWU_TSSERVER_COMMAND?.trim();
    if (legacy) {
      const parts = legacy.split(/\s+/);
      return { command: parts[0]!, args: [...parts.slice(1), "--stdio"] };
    }
  }

  // Bundled typescript-language-server (dependency of wanwu-shell)
  if (def.id === "typescript") {
    try {
      const pkgJson = require.resolve("typescript-language-server/package.json");
      const dir = path.dirname(pkgJson);
      const cli = path.join(dir, "lib", "cli.mjs");
      if (existsSync(cli)) {
        return { command: process.execPath, args: [cli, "--stdio"] };
      }
    } catch {
      /* fall through */
    }
  }

  // Repo-local node_modules bin
  const roots = [opts?.repoRoot, findRepoRoot()].filter(Boolean) as string[];
  for (const root of roots) {
    const bin = path.join(root, "node_modules", ".bin", def.command);
    if (existsSync(bin)) {
      return { command: bin, args: def.args };
    }
  }

  // PATH
  if (commandExistsOnPath(def.command)) {
    return { command: def.command, args: def.args };
  }

  return undefined;
}
