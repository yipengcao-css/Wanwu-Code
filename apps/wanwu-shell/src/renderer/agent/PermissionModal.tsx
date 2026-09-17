export function PermissionModal(props: {
  toolName: string;
  summary: string;
  risk?: string;
  onRespond: (optionId: string) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>
          权限确认 · {props.toolName}
          {props.risk ? ` · ${props.risk}` : ""}
        </h3>
        <pre>{props.summary}</pre>
        <div className="modal-actions">
          <button type="button" className="btn danger" onClick={() => props.onRespond("deny")}>
            拒绝
          </button>
          <button type="button" className="btn" onClick={() => props.onRespond("allow_always")}>
            本会话始终允许
          </button>
          <button type="button" className="btn primary" onClick={() => props.onRespond("allow_once")}>
            允许一次
          </button>
        </div>
      </div>
    </div>
  );
}
