import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

function safeRealpath(p: string): string {
  try {
    return existsSync(p) ? realpathSync(p) : p;
  } catch {
    return p;
  }
}

function nearestExisting(p: string): string {
  let cur = p;
  while (!existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return cur;
}

function isOutside(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return rel.startsWith("..") || path.isAbsolute(rel);
}

/** Resolve `candidate` under `root`; throws if outside workspace (symlink-aware). */
export function resolveInsideRoot(root: string, candidate: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, candidate);
  // Lexical containment first (fast reject of ../ and absolute escapes).
  if (isOutside(absRoot, abs)) {
    throw new Error(`path escapes workspace: ${candidate}`);
  }
  // Symlink-aware containment: a symlink inside the workspace could point out.
  // Only meaningful when the root actually exists.
  if (existsSync(absRoot)) {
    const realRoot = safeRealpath(absRoot);
    const realAncestor = safeRealpath(nearestExisting(abs));
    if (isOutside(realRoot, realAncestor)) {
      throw new Error(`path escapes workspace (symlink): ${candidate}`);
    }
  }
  return abs;
}

export function isInsideRoot(root: string, candidate: string): boolean {
  try {
    resolveInsideRoot(root, candidate);
    return true;
  } catch {
    return false;
  }
}
