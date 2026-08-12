import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export class PathSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSandboxError";
  }
}

function escapeCheck(root: string, candidate: string, userPath: string): void {
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || rel === ".." || isAbsolute(rel)) {
    throw new PathSandboxError(`path escapes workspace: ${userPath}`);
  }
}

export function assertInsideWorkspace(workspaceRoot: string, userPath: string): string {
  const root = resolve(workspaceRoot);
  const rootReal = safeRealpath(root);
  const candidate = isAbsolute(userPath) ? resolve(userPath) : resolve(root, userPath);
  const normalized = normalize(candidate);

  // Lexical check first (fast path, also covers non-existent targets).
  escapeCheck(root, normalized, userPath);

  // Realpath check to defeat symlink escapes when the path exists.
  if (existsSync(normalized)) {
    const real = safeRealpath(normalized);
    escapeCheck(rootReal, real, userPath);
  }

  // Block obvious home/ssh escapes even if somehow resolved oddly
  if (normalized.includes(`${sep}.ssh${sep}`) || normalized.endsWith(`${sep}.ssh`)) {
    throw new PathSandboxError(`refuses .ssh path: ${userPath}`);
  }
  return normalized;
}

export function safeRealpath(p: string): string {
  try {
    return existsSync(p) ? realpathSync(p) : p;
  } catch {
    return p;
  }
}

export function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function joinWorkspace(workspaceRoot: string, ...parts: string[]): string {
  return assertInsideWorkspace(workspaceRoot, join(...parts));
}
