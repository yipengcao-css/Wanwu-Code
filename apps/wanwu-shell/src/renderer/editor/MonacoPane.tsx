import { useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
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
  onSelect: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onClose: (path: string) => void;
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

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

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
        {props.tabs.map((t) => (
          <button
            key={t.path}
            type="button"
            className={`tab${t.path === props.activePath ? " active" : ""}${t.dirty ? " dirty" : ""}`}
            onClick={() => props.onSelect(t.path)}
            onAuxClick={(e) => {
              if (e.button === 1) props.onClose(t.path);
            }}
          >
            {t.path.split("/").pop()}
          </button>
        ))}
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
