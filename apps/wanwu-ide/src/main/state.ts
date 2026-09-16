import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

interface PersistedState {
  lastWorkspace?: string;
}

function statePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "state.json");
}

export function loadState(): PersistedState {
  try {
    const raw = readFileSync(statePath(), "utf8");
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

export function saveLastWorkspace(path: string): void {
  try {
    writeFileSync(statePath(), JSON.stringify({ lastWorkspace: path }, null, 2), "utf8");
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Determine the workspace to open on launch, in priority order:
 *   1. `WANWU_INITIAL_WORKSPACE` env
 *   2. first CLI argument that is an existing directory
 *   3. last opened workspace persisted from a previous run
 */
export function resolveInitialWorkspace(argv: string[]): string | null {
  const candidates: Array<string | undefined> = [
    process.env["WANWU_INITIAL_WORKSPACE"],
    ...argv.filter((a) => !a.startsWith("-")),
    loadState().lastWorkspace,
  ];
  for (const candidate of candidates) {
    if (candidate && isDirectory(candidate)) return candidate;
  }
  return null;
}

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
