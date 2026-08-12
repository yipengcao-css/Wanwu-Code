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

/** Map file extension to LSP languageId. */
export function languageIdFor(relPath: string): string {
  const lower = relPath.toLowerCase();
  if (lower.endsWith(".tsx")) return "typescriptreact";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".jsx")) return "javascriptreact";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".c") || lower.endsWith(".h")) return "c";
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".cxx") || lower.endsWith(".hpp")) return "cpp";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".jsonc")) return "jsonc";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".scss")) return "scss";
  if (lower.endsWith(".less")) return "less";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  return "plaintext";
}

/** Whether any built-in or configured server can handle this path. */
export function hasLspMapping(relPath: string): boolean {
  return languageIdFor(relPath) !== "plaintext";
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
