import React from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { AgentEditEvent } from "@shared/ipc.js";
import { languageForPath } from "../lib.js";

interface Props {
  proposal: AgentEditEvent;
  onAccept: () => void;
  onReject: () => void;
}

export function DiffModal({ proposal, onAccept, onReject }: Props): React.ReactElement {
  return (
    <div className="modal-overlay">
      <div className="modal diff-modal">
        <h3>
          Diff 评审 · <code>{proposal.path}</code>
        </h3>
        <div className="diff-host">
          <DiffEditor
            original={proposal.before}
            modified={proposal.after}
            language={languageForPath(proposal.path)}
            theme="vs-dark"
            options={{ readOnly: true, renderSideBySide: true, automaticLayout: true }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-deny" onClick={onReject}>
            拒绝
          </button>
          <button className="btn-primary" onClick={onAccept}>
            接受并写入
          </button>
        </div>
      </div>
    </div>
  );
}
