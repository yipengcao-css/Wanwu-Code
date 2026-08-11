import path from "node:path";

/** Resolve `candidate` under `root`; throws if outside workspace. */
export function resolveInsideRoot(root: string, candidate: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, candidate);
  const rel = path.relative(absRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`path escapes workspace: ${candidate}`);
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
