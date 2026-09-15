import * as monaco from "monaco-editor";

/**
 * Wire LSP language features (completion/hover/definition/references/rename)
 * into Monaco via the main-process lsp:request bridge.
 * Diagnostics were already wired; this completes the IntelliSense surface.
 */

const LSP_LANGUAGES = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "rust",
  "python",
  "go",
  "c",
  "cpp",
  "json",
  "jsonc",
  "css",
  "scss",
  "less",
  "html",
];

let registered = false;

function toLspPosition(pos: monaco.Position): { line: number; character: number } {
  return { line: pos.lineNumber - 1, character: pos.column - 1 };
}

function toMonacoRange(r: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): monaco.Range {
  return new monaco.Range(
    r.start.line + 1,
    r.start.character + 1,
    r.end.line + 1,
    r.end.character + 1,
  );
}

const COMPLETION_KIND_MAP: Record<number, monaco.languages.CompletionItemKind> = {
  2: monaco.languages.CompletionItemKind.Method,
  3: monaco.languages.CompletionItemKind.Function,
  4: monaco.languages.CompletionItemKind.Constructor,
  5: monaco.languages.CompletionItemKind.Field,
  6: monaco.languages.CompletionItemKind.Variable,
  7: monaco.languages.CompletionItemKind.Class,
  8: monaco.languages.CompletionItemKind.Interface,
  9: monaco.languages.CompletionItemKind.Module,
  10: monaco.languages.CompletionItemKind.Property,
  14: monaco.languages.CompletionItemKind.Keyword,
  21: monaco.languages.CompletionItemKind.Constant,
};

type LspLocation = {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
};

function toMonacoLocation(loc: LspLocation): monaco.languages.Location {
  return { uri: monaco.Uri.parse(loc.uri), range: toMonacoRange(loc.range) };
}

async function lspRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  method: string,
  extra?: Record<string, unknown>,
): Promise<unknown> {
  const pos = toLspPosition(position);
  const path = model.uri.path.replace(/^\//, "");
  return window.wanwu.lsp.request(path, method, pos.line, pos.character, extra);
}

export function registerLspFeatures(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider(LSP_LANGUAGES, {
    triggerCharacters: [".", ":", "<", '"', "'", "/", "@"],
    provideCompletionItems: async (model, position) => {
      const res = (await lspRequest(model, position, "textDocument/completion")) as
        | { items?: unknown[] }
        | unknown[]
        | null;
      const items = Array.isArray(res) ? res : (res?.items ?? []);
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      );
      const suggestions = items
        .map((it): monaco.languages.CompletionItem | undefined => {
          const item = it as {
            label?: string;
            kind?: number;
            detail?: string;
            documentation?: string | { value?: string };
            insertText?: string;
          };
          if (!item.label) return undefined;
          return {
            label: item.label,
            kind: COMPLETION_KIND_MAP[item.kind ?? 0] ?? monaco.languages.CompletionItemKind.Text,
            insertText: item.insertText ?? item.label,
            detail: item.detail,
            documentation:
              typeof item.documentation === "string"
                ? item.documentation
                : item.documentation?.value,
            range,
          };
        })
        .filter((x): x is monaco.languages.CompletionItem => x !== undefined);
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(LSP_LANGUAGES, {
    provideHover: async (model, position) => {
      const res = (await lspRequest(model, position, "textDocument/hover")) as {
        contents?: unknown;
      } | null;
      if (!res?.contents) return null;
      const c = res.contents;
      let value = "";
      if (typeof c === "string") value = c;
      else if (Array.isArray(c)) {
        value = c
          .map((x) => (typeof x === "string" ? x : ((x as { value?: string }).value ?? "")))
          .join("\n\n");
      } else if (typeof c === "object") {
        value = (c as { value?: string }).value ?? "";
      }
      if (!value) return null;
      return { contents: [{ value }] };
    },
  });

  monaco.languages.registerDefinitionProvider(LSP_LANGUAGES, {
    provideDefinition: async (model, position) => {
      const res = (await lspRequest(model, position, "textDocument/definition")) as
        | LspLocation
        | LspLocation[]
        | Array<{ targetUri?: string; targetRange?: LspLocation["range"] }>
        | null;
      if (!res) return null;
      const arr = Array.isArray(res) ? res : [res];
      const locations = arr
        .map((loc) => {
          if (!loc) return undefined;
          if ("targetUri" in loc && loc.targetUri && loc.targetRange) {
            return { uri: monaco.Uri.parse(loc.targetUri), range: toMonacoRange(loc.targetRange) };
          }
          const plain = loc as LspLocation;
          return plain.uri ? toMonacoLocation(plain) : undefined;
        })
        .filter((x): x is monaco.languages.Location => x !== undefined);
      return locations.length ? locations : null;
    },
  });

  monaco.languages.registerReferenceProvider(LSP_LANGUAGES, {
    provideReferences: async (model, position) => {
      const res = (await lspRequest(model, position, "textDocument/references", {
        context: { includeDeclaration: true },
      })) as LspLocation[] | null;
      if (!Array.isArray(res)) return null;
      return res.map(toMonacoLocation);
    },
  });

  monaco.languages.registerRenameProvider(LSP_LANGUAGES, {
    provideRenameEdits: async (model, position, newName) => {
      const res = (await lspRequest(model, position, "textDocument/rename", { newName })) as {
        changes?: Record<string, Array<{ range: LspLocation["range"]; newText: string }>>;
      } | null;
      const edits: monaco.languages.IWorkspaceTextEdit[] = [];
      for (const [uri, textEdits] of Object.entries(res?.changes ?? {})) {
        for (const e of textEdits) {
          edits.push({
            resource: monaco.Uri.parse(uri),
            versionId: undefined,
            textEdit: { range: toMonacoRange(e.range), text: e.newText },
          });
        }
      }
      return { edits };
    },
  });
}
