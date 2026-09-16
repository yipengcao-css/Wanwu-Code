import React from "react";
import type { AgentPermissionEvent } from "@shared/ipc.js";

interface Props {
  request: AgentPermissionEvent;
  onRespond: (optionId: string) => void;
}

export function PermissionModal({ request, onRespond }: Props): React.ReactElement {
  return (
    <div className="modal-overlay">
      <div className="modal permission-modal">
        <h3>权限确认{request.risk ? ` · ${request.risk}` : ""}</h3>
        <p className="permission-tool">
          工具: <code>{request.toolName}</code>
        </p>
        <pre className="permission-summary">{request.summary}</pre>
        <div className="modal-actions">
          <button className="btn-deny" onClick={() => onRespond("deny")}>
            拒绝
          </button>
          <button className="btn-secondary" onClick={() => onRespond("allow_always")}>
            始终允许
          </button>
          <button className="btn-primary" onClick={() => onRespond("allow_once")}>
            允许一次
          </button>
        </div>
      </div>
    </div>
  );
}
