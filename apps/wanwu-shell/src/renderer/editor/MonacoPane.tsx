import { useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { DiffHunk } from "../agent/diffHunks";
import { formatCursorWindow, type CursorFocus } from "./editorContext";
import { mountHunkReview } from "./hunkReview";
import { attachTabNextJump, registerInlineCompletion } from "./inlineComplete";
import { attachInlineEdit } from "./inlineEdit";
import { registerLspFeatures } from "./lspFeatures";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

export type EditorTab = {
  path: string;
  content: string;
  dirty: boolean;
};

export type EditorSelection = {
  path: string;
  text: string;
  startLine: number;
  endLine: number;
};

export type MarkerDiag = {
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  source?: string;
};

function languageFor(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".mjs")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".rs")) return "rust";
  if (path.endsWith(".toml")) return "ini";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "plaintext";
}

function toMonacoSeverity(s: MarkerDiag["severity"]): monaco.MarkerSeverity {
  switch (s) {
    case "error":
      return monaco.MarkerSeverity.Error;
    case "warning":
      return monaco.MarkerSeverity.Warning;
    case "info":
      return monaco.MarkerSeverity.Info;
    case "hint":
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

export function MonacoPane(props: {
  tabs: EditorTab[];
  activePath: string | null;
  diagnostics: Record<string, MarkerDiag[]>;
  /** Jump target from global search (n bumps to re-trigger). */
  gotoLine?: { path: string; line: number; n: number } | null;
  onSelect: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onClose: (path: string) => void;
  onSelectionChange?: (sel: EditorSelection | null) => void;
  /** Caret plus a numbered window. The window is omitted while a selection is active. */
  onCursorContext?: (cursor: CursorFocus | null) => void;
  review?: {
    hunks: DiffHunk[];
    accepted: Record<string, boolean>;
    onToggle: (id: string, accept: boolean) => void;
  } | null;
}) {
  const active = props.tabs.find((t) => t.path === props.activePath);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    const ed = editorRef.current;
    const path = active?.path;
    if (!ed || !path) return;
    const model = ed.getModel();
    if (!model) return;
    const diags = props.diagnostics[path] ?? [];
    monaco.editor.setModelMarkers(
      model,
      "wanwu-lsp",
      diags.map((d) => ({
        message: d.message,
        severity: toMonacoSeverity(d.severity),
        startLineNumber: d.startLine + 1,
        startColumn: d.startCharacter + 1,
        endLineNumber: d.endLine + 1,
        endColumn: Math.max(d.endCharacter + 1, d.startCharacter + 1),
        source: d.source ?? "typescript",
      })),
    );
  }, [active?.path, props.diagnostics, active?.content]);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !props.review || props.review.hunks.length === 0) return;
    return mountHunkReview(ed, props.review.hunks, props.review.accepted, props.review.onToggle);
  }, [props.review, active?.path, active?.content]);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    registerInlineCompletion();
    attachTabNextJump(editor);
    attachInlineEdit(editor);
    registerLspFeatures();
    let focusTimer = 0;
    const emitFocus = (): void => {
      const model = editor.getModel();
      const path = props.activePath;
      const pos = editor.getPosition();
      const range = editor.getSelection();
      if (!model || !path || !pos) {
        props.onSelectionChange?.(null);
        props.onCursorContext?.(null);
        return;
      }
      if (range && !range.isEmpty()) {
        const text = model.getValueInRange(range);
        props.onSelectionChange?.(
          text.trim()
            ? { path, text, startLine: range.startLineNumber, endLine: range.endLineNumber }
            : null,
        );
        props.onCursorContext?.({ path, line: pos.lineNumber, column: pos.column });
        return;
      }
      props.onSelectionChange?.(null);
      const windowed = formatCursorWindow(model.getValue(), pos.lineNumber, pos.column);
      props.onCursorContext?.({
        path,
        line: pos.lineNumber,
        column: windowed.column,
        startLine: windowed.startLine,
        endLine: windowed.endLine,
        text: windowed.text,
      });
    };
    const scheduleFocus = (): void => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(emitFocus, 180);
    };
    editor.onDidChangeCursorSelection(scheduleFocus);
    editor.onDidChangeModelContent(scheduleFocus);
    editor.onDidDispose(() => window.clearTimeout(focusTimer));
    emitFocus();
  };

  // Jump to a line requested by global search.
  useEffect(() => {
    const target = props.gotoLine;
    const ed = editorRef.current;
    if (!target || !ed || target.path !== active?.path) return;
    // Wait a tick for the model to be ready after tab switch.
    const t = setTimeout(() => {
      ed.revealLineInCenter(target.line);
      ed.setPosition({ lineNumber: target.line, column: 1 });
      ed.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [props.gotoLine, active?.path]);

  if (props.tabs.length === 0) {
    return (
      <div className="empty">
        <strong>Wanwu Lattice Editor</strong>
        <p>从左侧打开文件。这不是 VS Code Workbench——仅 Monaco 编辑内核 + 自研壳。</p>
      </div>
    );
  }

  return (
    <>
      <div className="tabs">
        {props.tabs.map((t) => {
          const name = t.path.split("/").pop() ?? t.path;
          return (
            <div
              key={t.path}
              role="tab"
              aria-selected={t.path === props.activePath}
              className={`tab${t.path === props.activePath ? " active" : ""}${t.dirty ? " dirty" : ""}`}
              onAuxClick={(e) => {
                if (e.button === 1) props.onClose(t.path);
              }}
            >
              <button type="button" className="tab-main" onClick={() => props.onSelect(t.path)}>
                {name}
              </button>
              <button
                type="button"
                className="tab-close"
                aria-label={`关闭 ${name}`}
                onClick={() => props.onClose(t.path)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="monaco-host">
        {active ? (
          <Editor
            key={active.path}
            height="100%"
            theme="vs-dark"
            path={active.path}
            language={languageFor(active.path)}
            value={active.content}
            onMount={onMount}
            onChange={(v) => props.onChange(active.path, v ?? "")}
            options={{
              fontFamily: "JetBrains Mono, Sarasa Mono SC, ui-monospace, monospace",
              fontSize: 13,
              minimap: { enabled: false },
              smoothScrolling: true,
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        ) : null}
      </div>
    </>
  );
}
