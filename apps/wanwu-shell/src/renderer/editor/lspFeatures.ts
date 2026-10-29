import * as monaco from "monaco-editor";
import { collectWorkspaceEdits, type LspWorkspaceEdit } from "../../shared/codeEdits";
import { relFromEditorResource, relFromFileUri } from "../../shared/lspUri";

/**
 * Monaco's bundled TypeScript worker only sees open models, so it treats an
 * import as the definition. Turn that provider off before the language mode
 * starts; the language server below is the one that knows the project.
 */
const workerModes = {
  completionItems: true,
  hovers: true,
  documentSymbols: true,
  definitions: false,
  references: true,
  documentHighlights: true,
  rename: true,
  diagnostics: true,
  documentRangeFormattingEdits: true,
  signatureHelp: true,
  onTypeFormattingEdits: true,
  codeActions: false,
  inlayHints: true,
};
monaco.languages.typescript?.typescriptDefaults.setModeConfiguration(workerModes);
monaco.languages.typescript?.javascriptDefaults.setModeConfiguration(workerModes);

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
let readOpenBuffer: ((rel: string) => string | null) | null = null;
let onExternalModel: ((rel: string, content: string) => void) | null = null;
let applyCodeFix: ((fix: { title: string; edit: LspWorkspaceEdit | null }) => void) | null = null;
let onRenamed: ((text: string) => void) | null = null;

/** Dirty tab text, so a rename does not start from the last saved copy. */
export function setOpenBufferReader(fn: ((rel: string) => string | null) | null): void {
  readOpenBuffer = fn;
}

/** Models created for another file report their text after a rename or fix. */
export function setExternalModelListener(fn: ((rel: string, content: string) => void) | null): void {
  onExternalModel = fn;
}

/** Lightbulb and Ctrl+. apply a language-server fix through the editor tabs. */
export function setCodeFixApplier(fn: ((fix: { title: string; edit: LspWorkspaceEdit | null }) => void) | null): void {
  applyCodeFix = fn;
}

export function setRenameNotifier(fn: ((text: string) => void) | null): void {
  onRenamed = fn;
}

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

function languageForPath(rel: string): string {
  if (rel.endsWith(".tsx") || rel.endsWith(".ts")) return "typescript";
  if (rel.endsWith(".jsx") || rel.endsWith(".js") || rel.endsWith(".mjs")) return "javascript";
  if (rel.endsWith(".json")) return "json";
  if (rel.endsWith(".css")) return "css";
  if (rel.endsWith(".html")) return "html";
  if (rel.endsWith(".py")) return "python";
  if (rel.endsWith(".rs")) return "rust";
  return "plaintext";
}

/** Peek and rename cannot read the disk. Put the target file into a model first. */
async function ensureEditorModel(uri: monaco.Uri): Promise<void> {
  if (monaco.editor.getModel(uri)) return;
  const rel = uri.path.replace(/^\/+/, "");
  if (!rel || rel.split("/").includes("..")) return;
  let text = readOpenBuffer?.(rel) ?? null;
  if (text == null) {
    try {
      text = await window.wanwu.fs.read(rel);
    } catch {
      return;
    }
  }
  if (monaco.editor.getModel(uri)) return;
  const model = monaco.editor.createModel(text, languageForPath(rel), uri);
  model.onDidChangeContent(() => {
    onExternalModel?.(rel, model.getValue());
  });
}

async function monacoEditsForWorkspace(edit: LspWorkspaceEdit | null): Promise<monaco.languages.IWorkspaceTextEdit[]> {
  const files = collectWorkspaceEdits(edit, workspaceRoot);
  const edits: monaco.languages.IWorkspaceTextEdit[] = [];
  for (const file of files) {
    const uri = monaco.Uri.parse(file.rel);
    await ensureEditorModel(uri);
    if (!monaco.editor.getModel(uri)) continue;
    for (const change of file.edits) {
      edits.push({
        resource: uri,
        versionId: undefined,
        textEdit: { range: toMonacoRange(change.range), text: change.newText },
      });
    }
  }
  return edits;
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
      for (const loc of locations) {
        if (loc.uri.toString() !== model.uri.toString()) await ensureEditorModel(loc.uri);
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
      const locations = res.map(toMonacoLocation);
      for (const loc of locations) {
        if (loc.uri.toString() !== model.uri.toString()) await ensureEditorModel(loc.uri);
      }
      return locations;
    },
  });

  monaco.languages.registerRenameProvider(LSP_LANGUAGES, {
    provideRenameEdits: async (model, position, newName) => {
      const res = (await lspRequest(model, position, "textDocument/rename", { newName })) as LspWorkspaceEdit | null;
      const edits = await monacoEditsForWorkspace(res);
      if (!edits.length) return null;
      onRenamed?.("已重命名。记得保存。");
      return { edits };
    },
  });

  monaco.editor.registerCommand("wanwu.applyLspFix", (_accessor, fix: { title: string; edit: LspWorkspaceEdit | null }) => {
    applyCodeFix?.(fix);
  });

  monaco.languages.registerCodeActionProvider(LSP_LANGUAGES, {
    provideCodeActions: async (model, _range, context) => {
      const markers = (context.markers ?? []).slice(0, 4);
      if (!markers.length) return { actions: [], dispose() {} };
      const path = model.uri.path.replace(/^\//, "");
      const text = model.getValue();
      const actions: monaco.languages.CodeAction[] = [];
      const seen = new Set<string>();
      for (const marker of markers) {
        const range = {
          start: { line: marker.startLineNumber - 1, character: marker.startColumn - 1 },
          end: { line: marker.endLineNumber - 1, character: marker.endColumn - 1 },
        };
        const code = typeof marker.code === "string" || typeof marker.code === "number" ? marker.code : undefined;
        let fixes: Array<{ title: string; edit: unknown }> = [];
        try {
          fixes = await window.wanwu.lsp.codeAction(path, text, range, {
            message: marker.message,
            severity: marker.severity === monaco.MarkerSeverity.Warning ? 2 : marker.severity === monaco.MarkerSeverity.Info ? 3 : marker.severity === monaco.MarkerSeverity.Hint ? 4 : 1,
            source: marker.source,
            code,
          });
        } catch {
          fixes = [];
        }
        for (const fix of fixes) {
          if (!fix.title || seen.has(fix.title)) continue;
          seen.add(fix.title);
          actions.push({
            title: fix.title,
            kind: "quickfix",
            isPreferred: actions.length === 0,
            command: {
              id: "wanwu.applyLspFix",
              title: fix.title,
              arguments: [{ title: fix.title, edit: fix.edit }],
            },
          });
        }
      }
      return { actions, dispose() {} };
    },
  });

  monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selectionOrPosition) {
      if (!openLocation) return false;
      const sourceUri = source.getModel()?.uri.toString();
      if (sourceUri && sourceUri === resource.toString()) return false;
      const rel = relFromEditorResource(resource.toString(), resource.path, workspaceRoot);
      if (!rel) return false;
      const at = selectionLine(selectionOrPosition);
      openLocation(rel, at.line, at.column);
      return true;
    },
  });
}
