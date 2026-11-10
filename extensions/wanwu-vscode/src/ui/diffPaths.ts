import * as path from "node:path";

const LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".css": "css",
  ".html": "html",
  ".toml": "toml",
  ".yml": "yaml",
  ".yaml": "yaml",
};

export function languageForPath(filePath: string): string {
  return LANG[path.extname(filePath).toLowerCase()] ?? "plaintext";
}

export function resolveEditAbsPath(workspaceRoot: string, relOrAbs: string): string {
  return path.isAbsolute(relOrAbs) ? relOrAbs : path.join(workspaceRoot, relOrAbs);
}

export function diffReviewTitle(filePath: string): string {
  return `${path.basename(filePath)} (Wanwu)`;
}
