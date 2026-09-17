import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export class PathSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSandboxError";
  }
}

function isOutside(root: string, p: string): boolean {
  const rel = relative(root, p);
  return rel.startsWith("..") || rel === ".." || isAbsolute(rel);
}

/** Deepest existing ancestor of `p` (so we can realpath a not-yet-created file). */
function nearestExisting(p: string): string {
  let cur = p;
  while (!existsSync(cur)) {
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur;
}

export function assertInsideWorkspace(workspaceRoot: string, userPath: string): string {
  const root = resolve(workspaceRoot);
  const candidate = normalize(isAbsolute(userPath) ? resolve(userPath) : resolve(root, userPath));

  // 1) Lexical containment — fast reject of ../ and absolute escapes.
  if (isOutside(root, candidate)) {
    throw new PathSandboxError(`path escapes workspace: ${userPath}`);
  }
  // Block obvious home/ssh escapes even if somehow resolved oddly.
  if (candidate.includes(`${sep}.ssh${sep}`) || candidate.endsWith(`${sep}.ssh`)) {
    throw new PathSandboxError(`refuses .ssh path: ${userPath}`);
  }

  // 2) Symlink-aware containment — realpath the deepest existing ancestor and
  //    ensure it still resolves inside the (realpath'd) workspace root. This
  //    blocks a symlink *inside* the workspace that points outside it, which the
  //    purely lexical check above cannot detect. Only meaningful when the root
  //    exists (no symlink can live inside a not-yet-created tree).
  if (existsSync(root)) {
    const realRoot = safeRealpath(root);
    const realAncestor = safeRealpath(nearestExisting(candidate));
    if (isOutside(realRoot, realAncestor)) {
      throw new PathSandboxError(`path escapes workspace (symlink): ${userPath}`);
    }
  }
  return candidate;
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
