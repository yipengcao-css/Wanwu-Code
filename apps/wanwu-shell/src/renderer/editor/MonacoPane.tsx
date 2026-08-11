import Editor, { loader } from "@monaco-editor/react";
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

export function MonacoPane(props: {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onChange: (path: string, value: string) => void;
  onClose: (path: string) => void;
}) {
  const active = props.tabs.find((t) => t.path === props.activePath);

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
