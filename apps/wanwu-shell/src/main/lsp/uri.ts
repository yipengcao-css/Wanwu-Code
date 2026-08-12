import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LspSeverity } from "./types.js";

/** Absolute path → file:// URI for LSP. */
export function pathToUri(absPath: string): string {
  return pathToFileURL(path.resolve(absPath)).href;
}

/** file:// URI → absolute filesystem path. */
export function uriToPath(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}

/** Absolute path under workspace → relative POSIX path for renderer. */
export function toWorkspaceRel(workspaceRoot: string, absPath: string): string {
  const rel = path.relative(workspaceRoot, absPath);
  return rel.split(path.sep).join("/");
}

export function isTsLike(relPath: string): boolean {
  return /\.(tsx?|jsx?|mjs|cjs)$/i.test(relPath);
}

export function languageIdFor(relPath: string): string {
  if (/\.tsx$/i.test(relPath)) return "typescriptreact";
  if (/\.ts$/i.test(relPath)) return "typescript";
  if (/\.jsx$/i.test(relPath)) return "javascriptreact";
  return "javascript";
}

/** Map LSP DiagnosticSeverity (1..4) to Monaco-friendly label. */
export function mapSeverity(n: number | undefined): LspSeverity {
  switch (n) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return "error";
  }
}
