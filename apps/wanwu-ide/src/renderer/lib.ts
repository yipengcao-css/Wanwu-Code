export function languageForPath(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    toml: "ini",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bash: "shell",
  };
  return map[ext] ?? "plaintext";
}

export function baseName(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}
