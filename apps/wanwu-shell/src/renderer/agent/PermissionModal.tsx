export type PermissionChoice = "allow-once" | "allow-session" | "deny";

export function PermissionModal(props: {
  toolName: string;
  summary: string;
  risk?: string;
  onChoice: (choice: PermissionChoice) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>权限 · {props.toolName}</h3>
        <pre>{`${props.summary}\nrisk=${props.risk ?? "?"}`}</pre>
        <div className="modal-actions permission-actions">
          <button type="button" className="btn danger" onClick={() => props.onChoice("deny")}>
            拒绝
          </button>
          <button type="button" className="btn" onClick={() => props.onChoice("allow-session")}>
            本会话允许
          </button>
          <button type="button" className="btn primary" onClick={() => props.onChoice("allow-once")}>
            允许一次
          </button>
        </div>
      </div>
    </div>
  );
}
