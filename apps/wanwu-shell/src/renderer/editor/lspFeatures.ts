import * as monaco from "monaco-editor";
import { relFromFileUri } from "../../shared/lspUri";

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
let workspaceRoot = "";
let openLocation: ((rel: string, line: number, column: number) => void) | null = null;

/** Workspace root used to turn LSP file URIs into editor paths. */
export function setLspWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

/** Called when go-to-definition targets a file that is not the current model. */
export function setDefinitionOpener(fn: ((rel: string, line: number, column: number) => void) | null): void {
  openLocation = fn;
}

function editorUriFor(lspUri: string): monaco.Uri {
  const rel = workspaceRoot ? relFromFileUri(lspUri, workspaceRoot) : null;
  return monaco.Uri.parse(rel || lspUri);
}

function selectionLine(selectionOrPosition: monaco.IRange | monaco.IPosition | undefined): { line: number; column: number } {
  if (!selectionOrPosition) return { line: 1, column: 1 };
  if ("startLineNumber" in selectionOrPosition) {
    return { line: selectionOrPosition.startLineNumber, column: selectionOrPosition.startColumn };
  }
  return { line: selectionOrPosition.lineNumber, column: selectionOrPosition.column };
}

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
  return { uri: editorUriFor(loc.uri), range: toMonacoRange(loc.range) };
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
      const locations: monaco.languages.Location[] = [];
      for (const loc of arr) {
        if (!loc) continue;
        if ("targetUri" in loc && loc.targetUri && loc.targetRange) {
          locations.push({ uri: editorUriFor(loc.targetUri), range: toMonacoRange(loc.targetRange) });
          continue;
        }
        const plain = loc as LspLocation;
        if (plain.uri) locations.push(toMonacoLocation(plain));
      }
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

  monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selectionOrPosition) {
      if (!openLocation) return false;
      const sourceUri = source.getModel()?.uri.toString();
      if (sourceUri && sourceUri === resource.toString()) return false;
      const rel =
        resource.scheme === "file" && workspaceRoot
          ? relFromFileUri(resource.toString(), workspaceRoot)
          : resource.path.replace(/^\/+/, "");
      if (!rel || rel.split("/").includes("..")) return false;
      const at = selectionLine(selectionOrPosition);
      openLocation(rel, at.line, at.column);
      return true;
    },
  });
}
