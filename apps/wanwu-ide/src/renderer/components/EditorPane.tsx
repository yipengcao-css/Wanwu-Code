import React from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { baseName, languageForPath } from "../lib.js";

export interface EditorTab {
  path: string;
  content: string;
  binary: boolean;
  dirty: boolean;
}

interface Props {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
}

export function EditorPane({
  tabs,
  activePath,
  onSelect,
  onClose,
  onChange,
  onSave,
}: Props): React.ReactElement {
  const active = tabs.find((t) => t.path === activePath) ?? null;

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activePath) onSave(activePath);
    });
  };

  return (
    <div className="editor-pane">
      <div className="tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={`tab${tab.path === activePath ? " active" : ""}`}
            onClick={() => onSelect(tab.path)}
          >
            <span className="tab-name">
              {tab.dirty ? "● " : ""}
              {baseName(tab.path)}
            </span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="editor-host">
        {active === null && <div className="panel-empty">从左侧文件树打开文件</div>}
        {active && active.binary && (
          <div className="panel-empty">二进制文件，暂不支持在编辑器中显示</div>
        )}
        {active && !active.binary && (
          <Editor
            path={active.path}
            language={languageForPath(active.path)}
            value={active.content}
            theme="vs-dark"
            onMount={handleMount}
            onChange={(value) => onChange(active.path, value ?? "")}
            options={{
              fontSize: 13,
              minimap: { enabled: true },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
            }}
          />
        )}
      </div>
    </div>
  );
}
