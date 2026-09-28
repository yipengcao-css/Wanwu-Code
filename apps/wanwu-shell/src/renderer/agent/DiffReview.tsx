import { useEffect } from "react";
import type { DiffHunk } from "./diffHunks";

/** Per-hunk review dock. The editor shows each block inline. */
export function DiffReview(props: {
  path: string;
  hunks: DiffHunk[];
  accepted: Record<string, boolean>;
  queueLabel?: string;
  onToggle: (id: string, accept: boolean) => void;
  onAccept: () => void;
  onReject: () => void;
  onAcceptAll?: () => void;
  onRejectAll?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target;
      if (target instanceof HTMLElement && target.closest("textarea, input, select, .monaco-editor")) return;
      if (document.querySelector("[role='dialog'], .modal-backdrop")) return;
      props.onReject();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const acceptedCount = props.hunks.filter((h) => props.accepted[h.id] !== false).length;

  return (
    <div className="review-dock" role="region" aria-label="审阅编辑">
      <div className="review-dock-head">
        <div>
          <strong>审阅编辑{props.queueLabel ? ` · ${props.queueLabel}` : ""}</strong>
          <span className="diff-path">{props.path}</span>
          <span className="review-count">
            已接受 {acceptedCount}/{props.hunks.length} 块
          </span>
        </div>
        <div className="modal-actions" style={{ marginTop: 0 }}>
          {props.onRejectAll ? (
            <button type="button" className="btn" onClick={props.onRejectAll}>
              全部跳过
            </button>
          ) : null}
          <button type="button" className="btn" onClick={props.onReject}>
            跳过此文件
          </button>
          <button type="button" className="btn primary" onClick={props.onAccept} disabled={acceptedCount === 0}>
            写入已接受
          </button>
          {props.onAcceptAll ? (
            <button type="button" className="btn primary" onClick={props.onAcceptAll}>
              全部接受
            </button>
          ) : null}
        </div>
      </div>
      <div className="review-hunks">
        {props.hunks.map((hunk, index) => {
          const on = props.accepted[hunk.id] !== false;
          return (
            <div key={hunk.id} className={`review-hunk${on ? "" : " is-off"}`}>
              <span>
                第 {index + 1} 块 · 第 {hunk.startLine} 行
              </span>
              <button type="button" className="btn" onClick={() => props.onToggle(hunk.id, true)}>
                {on ? "已接受" : "接受"}
              </button>
              <button type="button" className="btn" onClick={() => props.onToggle(hunk.id, false)}>
                {on ? "拒绝" : "已拒绝"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
