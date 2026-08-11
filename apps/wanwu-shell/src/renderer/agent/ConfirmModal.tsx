export function ConfirmModal(props: {
  title: string;
  body: string;
  acceptLabel: string;
  rejectLabel: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>{props.title}</h3>
        <pre>{props.body}</pre>
        <div className="modal-actions">
          <button type="button" className="btn danger" onClick={props.onReject}>
            {props.rejectLabel}
          </button>
          <button type="button" className="btn primary" onClick={props.onAccept}>
            {props.acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
