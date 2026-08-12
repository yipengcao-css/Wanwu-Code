import { DiffEditor } from "@monaco-editor/react";
import { useEffect } from "react";

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

export function DiffReview(props: {
  path: string;
  before: string;
  after: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onReject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="diff-title">
      <div className="modal modal-diff">
        <header className="diff-head">
          <div>
            <h3 id="diff-title">审阅编辑</h3>
            <p className="diff-path">{props.path}</p>
          </div>
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button type="button" className="btn danger" onClick={props.onReject}>
              拒绝
            </button>
            <button type="button" className="btn primary" onClick={props.onAccept}>
              写入文件
            </button>
          </div>
        </header>
        <div className="diff-host">
          <DiffEditor
            height="100%"
            language={languageFor(props.path)}
            original={props.before}
            modified={props.after}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </div>
      </div>
    </div>
  );
}
