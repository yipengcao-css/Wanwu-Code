import { DiffEditor } from "@monaco-editor/react";

function languageFor(p: string): string {
  if (p.endsWith(".ts") || p.endsWith(".tsx")) return "typescript";
  if (p.endsWith(".js") || p.endsWith(".jsx") || p.endsWith(".mjs")) return "javascript";
  if (p.endsWith(".json")) return "json";
  if (p.endsWith(".md")) return "markdown";
  if (p.endsWith(".css")) return "css";
  if (p.endsWith(".html")) return "html";
  if (p.endsWith(".py")) return "python";
  if (p.endsWith(".rs")) return "rust";
  if (p.endsWith(".toml")) return "ini";
  if (p.endsWith(".yml") || p.endsWith(".yaml")) return "yaml";
  return "plaintext";
}

export function DiffModal(props: {
  path: string;
  before: string;
  after: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal diff-modal">
        <h3>Diff 评审 · {props.path}</h3>
        <div className="diff-host">
          <DiffEditor
            original={props.before}
            modified={props.after}
            language={languageFor(props.path)}
            theme="vs-dark"
            options={{
              readOnly: true,
              renderSideBySide: true,
              automaticLayout: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn danger" onClick={props.onReject}>
            拒绝
          </button>
          <button type="button" className="btn primary" onClick={props.onAccept}>
            接受并写入
          </button>
        </div>
      </div>
    </div>
  );
}
