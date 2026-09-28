import * as monaco from "monaco-editor";
import { noteRecentEdit, recentEditSummary } from "./recentEdits";

/**
 * Tab: a small model predicts the next edit.
 * At the cursor it is ghost text (Alt+Right accepts one word).
 * Elsewhere, Tab jumps there and then offers the text.
 * Accepting still moves to the next diagnostic.
 */

let registered = false;
let seq = 0;
let nextJumpCmd: string | null = null;

const DEBOUNCE_MS = 300;
const PREFIX_CHARS = 3000;
const SUFFIX_CHARS = 800;

type Armed = {
  path: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  text: string;
  action: "insert" | "replace";
};

let jump: Armed | null = null;
let armed: Armed | null = null;
let jumpKey: monaco.editor.IContextKey<boolean> | null = null;
let jumpEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let jumpWidget: monaco.editor.IContentWidget | null = null;
const attachedEditors = new WeakSet<monaco.editor.IStandaloneCodeEditor>();

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
    .sort((a, b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn);
  if (!markers.length) return;
  const line = pos?.lineNumber ?? 0;
  const col = pos?.column ?? 0;
  const next =
    markers.find((m) => m.startLineNumber > line || (m.startLineNumber === line && m.startColumn > col)) ??
    markers[0];
  if (!next) return;
  editor.setPosition({ lineNumber: next.startLineNumber, column: next.startColumn });
  editor.revealLineInCenter(next.startLineNumber);
  void editor.trigger("wanwu", "editor.action.inlineSuggest.trigger", {});
}

function clearJumpWidget(): void {
  if (jumpEditor && jumpWidget) jumpEditor.removeContentWidget(jumpWidget);
  jumpWidget = null;
}

function showJumpWidget(editor: monaco.editor.IStandaloneCodeEditor, target: Armed): void {
  clearJumpWidget();
  const dom = document.createElement("div");
  dom.className = "next-edit-jump";
  dom.textContent = `Tab 跳到第 ${target.line} 行`;
  const widget: monaco.editor.IContentWidget = {
    getId: () => "wanwu-next-edit-jump",
    getDomNode: () => dom,
    getPosition: () => ({
      position: { lineNumber: editor.getPosition()?.lineNumber ?? 1, column: 1 },
      preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
    }),
  };
  jumpWidget = widget;
  editor.addContentWidget(widget);
}

function setJump(editor: monaco.editor.IStandaloneCodeEditor, target: Armed | null): void {
  jump = target;
  jumpKey?.set(Boolean(target));
  if (!target) {
    clearJumpWidget();
    return;
  }
  showJumpWidget(editor, target);
}

function inlineItem(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  edit: Armed,
): monaco.languages.InlineCompletions {
  const endLine = edit.action === "replace" ? Math.max(edit.endLine, position.lineNumber) : position.lineNumber;
  const endColumn = edit.action === "replace" ? Math.max(edit.endColumn, position.column) : position.column;
  const maxCol = model.getLineMaxColumn(Math.min(endLine, model.getLineCount()));
  return {
    items: [
      {
        insertText: edit.text,
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          Math.min(endLine, model.getLineCount()),
          Math.min(endColumn, maxCol),
        ),
        command: nextJumpCmd ? { id: nextJumpCmd, title: "下一处诊断" } : undefined,
      },
    ],
  };
}

export function registerInlineCompletion(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerInlineCompletionsProvider("*", {
    groupId: "wanwu-inline",
    provideInlineCompletions: async (model, position) => {
      const path = model.uri.path;
      if (armed && armed.path === path) {
        const line = Math.min(armed.line, model.getLineCount());
        if (position.lineNumber === line && position.column === armed.column) {
          return inlineItem(model, position, armed);
        }
        const cursor = jumpEditor?.getPosition();
        const atCursor =
          !cursor ||
          (cursor.lineNumber === position.lineNumber && cursor.column === position.column);
        if (atCursor && jumpEditor?.getModel()?.uri.path === path) armed = null;
      }

      const mySeq = ++seq;
      await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
      if (mySeq !== seq || model.isDisposed()) return { items: [] };

      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const prefix = text.slice(Math.max(0, offset - PREFIX_CHARS), offset);
      const suffix = text.slice(offset, offset + SUFFIX_CHARS);
      if (prefix.trim().length < 8) {
        if (jump && jump.path === path && jumpEditor) setJump(jumpEditor, null);
        return { items: [] };
      }
      const diagnostics = nearbyDiagnostics(model, position);

      try {
        const res = await window.wanwu.ai.predict({
          prefix,
          suffix,
          cursorLine: position.lineNumber,
          cursorColumn: position.column,
          language: model.getLanguageId(),
          path,
          diagnostics: diagnostics || undefined,
          recentEdits: recentEditSummary() || undefined,
        });
        if (mySeq !== seq) return { items: [] };
        const stillThisFile = jumpEditor?.getModel()?.uri.path === path;
        if (!res.text || res.mode === "none") {
          if (stillThisFile && jumpEditor) setJump(jumpEditor, null);
          return { items: [] };
        }
        const edit: Armed = {
          path,
          line: res.line || position.lineNumber,
          column: res.column || position.column,
          endLine: res.endLine || res.line || position.lineNumber,
          endColumn: res.endColumn || res.column || position.column,
          text: res.text,
          action: res.action === "replace" ? "replace" : "insert",
        };
        if (res.mode === "jump") {
          if (stillThisFile && jumpEditor) setJump(jumpEditor, edit);
          return { items: [] };
        }
        if (stillThisFile && jumpEditor) setJump(jumpEditor, null);
        return inlineItem(model, position, edit);
      } catch {
        if (mySeq === seq && jump?.path === path && jumpEditor) setJump(jumpEditor, null);
        return { items: [] };
      }
    },
    freeInlineCompletions: () => {
      /* nothing to free */
    },
  });
}

/** Bind Tab jump, partial accept, recent-edit capture, and the post-accept diagnostic jump. */
export function attachTabNextJump(editor: monaco.editor.IStandaloneCodeEditor): void {
  if (attachedEditors.has(editor)) return;
  attachedEditors.add(editor);
  if (jumpEditor && jumpEditor !== editor) {
    clearJumpWidget();
    jumpKey?.set(false);
    jump = null;
    armed = null;
  }
  jumpEditor = editor;
  jumpKey = editor.createContextKey("wanwuHasJump", false);
  const id = editor.addCommand(0, () => jumpToNextDiagnostic());
  if (id) nextJumpCmd = id;

  editor.addCommand(
    monaco.KeyCode.Tab,
    () => {
      if (!jump) return;
      const target = jump;
      const model = editor.getModel();
      setJump(editor, null);
      const line = Math.min(target.line, model?.getLineCount() ?? target.line);
      const maxCol = model?.getLineMaxColumn(line) ?? target.column;
      const column = Math.min(Math.max(target.column, 1), Math.max(maxCol, 1));
      armed = { ...target, line, column };
      editor.setPosition({ lineNumber: line, column });
      editor.revealLineInCenter(line);
      editor.focus();
      void editor.trigger("wanwu", "editor.action.inlineSuggest.trigger", {});
    },
    "wanwuHasJump",
  );

  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.RightArrow, () => {
    editor.trigger("wanwu", "editor.action.inlineSuggest.acceptNextWord", {});
  });
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
    editor.trigger("wanwu", "editor.action.inlineSuggest.acceptNextLine", {});
  });

  editor.onDidChangeModelContent((e) => {
    const model = editor.getModel();
    if (!model) return;
    const path = model.uri.path;
    for (const change of e.changes) {
      const inserted = change.text ?? "";
      const removed = change.rangeLength ?? 0;
      const singleKey = inserted.length <= 1 && removed <= 1 && inserted !== "\n";
      if (singleKey) continue;
      noteRecentEdit(path, `L${change.range.startLineNumber} ${inserted || "⌫"}`);
    }
  });
}
