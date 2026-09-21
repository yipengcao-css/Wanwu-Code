import * as monaco from "monaco-editor";

/**
 * Tab ghost-text: lint-aware completion + jump to the next diagnostic after accept.
 */

let registered = false;
let seq = 0;
let nextJumpCmd: string | null = null;

const DEBOUNCE_MS = 300;
const PREFIX_CHARS = 3000;
const SUFFIX_CHARS = 800;

function nearbyDiagnostics(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): string {
  return monaco.editor
    .getModelMarkers({ resource: model.uri })
    .filter(
      (m) =>
        (m.severity === monaco.MarkerSeverity.Error ||
          m.severity === monaco.MarkerSeverity.Warning) &&
        Math.abs(m.startLineNumber - position.lineNumber) <= 40,
    )
    .slice(0, 8)
    .map((m) => `L${m.startLineNumber}:${m.startColumn} ${m.message}`)
    .join("\n");
}

function jumpToNextDiagnostic(): void {
  const editor =
    monaco.editor.getEditors().find((e) => e.hasTextFocus()) ?? monaco.editor.getEditors()[0];
  const model = editor?.getModel();
  if (!editor || !model) return;
  const pos = editor.getPosition();
  const markers = monaco.editor
    .getModelMarkers({ resource: model.uri })
    .filter(
      (m) =>
        m.severity === monaco.MarkerSeverity.Error || m.severity === monaco.MarkerSeverity.Warning,
    )
    .sort(
      (a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn,
    );
  if (!markers.length) return;
  const line = pos?.lineNumber ?? 0;
  const col = pos?.column ?? 0;
  const next =
    markers.find(
      (m) => m.startLineNumber > line || (m.startLineNumber === line && m.startColumn > col),
    ) ?? markers[0];
  if (!next) return;
  editor.setPosition({ lineNumber: next.startLineNumber, column: next.startColumn });
  editor.revealLineInCenter(next.startLineNumber);
  void editor.trigger("wanwu", "editor.action.inlineSuggest.trigger", {});
}

export function registerInlineCompletion(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerInlineCompletionsProvider("*", {
    groupId: "wanwu-inline",
    provideInlineCompletions: async (model, position) => {
      const mySeq = ++seq;
      await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
      if (mySeq !== seq) return { items: [] };

      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const prefix = text.slice(Math.max(0, offset - PREFIX_CHARS), offset);
      const suffix = text.slice(offset, offset + SUFFIX_CHARS);
      if (prefix.trim().length < 8) return { items: [] };
      const diagnostics = nearbyDiagnostics(model, position);

      try {
        const res = await window.wanwu.ai.complete({
          prefix,
          suffix,
          language: model.getLanguageId(),
          path: model.uri.path,
          diagnostics: diagnostics || undefined,
        });
        if (mySeq !== seq || !res.text) return { items: [] };
        return {
          items: [
            {
              insertText: res.text,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column,
              ),
              command: nextJumpCmd
                ? { id: nextJumpCmd, title: "下一处诊断" }
                : undefined,
            },
          ],
        };
      } catch {
        return { items: [] };
      }
    },
    freeInlineCompletions: () => {
      /* nothing to free */
    },
  });
}

/** Bind the post-accept “next diagnostic” command to a concrete editor. */
export function attachTabNextJump(editor: monaco.editor.IStandaloneCodeEditor): void {
  const id = editor.addCommand(0, () => jumpToNextDiagnostic());
  if (id) nextJumpCmd = id;
}
