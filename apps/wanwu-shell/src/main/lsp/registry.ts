import type { LspServerDef } from "./types.js";

/**
 * Built-in LSP server registry.
 * Only typescript-language-server is bundled as a dependency; others resolve from PATH.
 */
export const BUILTIN_LSP_SERVERS: LspServerDef[] = [
  {
    id: "typescript",
    command: "typescript-language-server",
    args: ["--stdio"],
    languages: ["typescript", "typescriptreact", "javascript", "javascriptreact"],
  },
  {
    id: "rust",
    command: "rust-analyzer",
    args: [],
    languages: ["rust"],
  },
  {
    id: "python",
    command: "pyright-langserver",
    args: ["--stdio"],
    languages: ["python"],
  },
  {
    id: "go",
    command: "gopls",
    args: ["serve"],
    languages: ["go"],
  },
  {
    id: "clangd",
    command: "clangd",
    args: [],
    languages: ["c", "cpp"],
  },
  {
    id: "json",
    command: "vscode-json-language-server",
    args: ["--stdio"],
    languages: ["json", "jsonc"],
    optIn: true,
  },
  {
    id: "css",
    command: "vscode-css-language-server",
    args: ["--stdio"],
    languages: ["css", "scss", "less"],
    optIn: true,
  },
  {
    id: "html",
    command: "vscode-html-language-server",
    args: ["--stdio"],
    languages: ["html"],
    optIn: true,
  },
];

export function serverForLanguage(
  languageId: string,
  servers: LspServerDef[] = BUILTIN_LSP_SERVERS,
): LspServerDef | undefined {
  return servers.find((s) => s.languages.includes(languageId));
}
