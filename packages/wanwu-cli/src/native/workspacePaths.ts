import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { listSkillSandboxRoots } from "@wanwu/skills";

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

function tryInsideRoot(root: string, candidate: string, userPath: string): string | undefined {
  try {
    escapeCheck(root, candidate, userPath);
    if (normalizedIncludesSsh(candidate)) {
      throw new PathSandboxError(`refuses .ssh path: ${userPath}`);
    }
    if (existsSync(candidate)) {
      const real = safeRealpath(candidate);
      escapeCheck(safeRealpath(root), real, userPath);
    }
    return candidate;
  } catch (err) {
    if (err instanceof PathSandboxError) return undefined;
    throw err;
  }
}

function normalizedIncludesSsh(normalized: string): boolean {
  return normalized.includes(`${sep}.ssh${sep}`) || normalized.endsWith(`${sep}.ssh`);
}

export function assertInsideWorkspace(workspaceRoot: string, userPath: string): string {
  const root = resolve(workspaceRoot);
  const rootReal = safeRealpath(root);
  const candidate = isAbsolute(userPath) ? resolve(userPath) : resolve(root, userPath);
  const normalized = normalize(candidate);

  const inWorkspace = tryInsideRoot(root, normalized, userPath);
  if (inWorkspace) return inWorkspace;

  const home = homedir();
  for (const extra of listSkillSandboxRoots(process.env, home)) {
    const hit = tryInsideRoot(extra, normalized, userPath);
    if (hit) return hit;
  }

  escapeCheck(root, normalized, userPath);
  if (existsSync(normalized)) {
    const real = safeRealpath(normalized);
    escapeCheck(rootReal, real, userPath);
  }
  if (normalizedIncludesSsh(normalized)) {
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