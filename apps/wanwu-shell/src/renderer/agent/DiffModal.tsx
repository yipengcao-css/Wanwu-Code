import { useMemo, useState } from "react";
import { applyBlocks, changeBlockCount, computeBlocks } from "./diffHunks";

export function DiffModal(props: {
  path: string;
  before: string;
  after: string;
  onAccept: (content: string) => void;
  onReject: () => void;
}) {
  const blocks = useMemo(() => computeBlocks(props.before, props.after), [props.before, props.after]);
  const total = changeBlockCount(blocks);
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(blocks.filter((b) => b.type === "change").map((b) => b.id)),
  );

  function toggle(id: number): void {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const acceptedCount = accepted.size;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal diff-modal">
        <h3>
          Diff 评审 · {props.path}
          <span className="diff-hunk-count">
            采纳 {acceptedCount}/{total} 处改动
          </span>
        </h3>
        <div className="diff-toolbar">
          <button
            type="button"
            className="btn"
            onClick={() => setAccepted(new Set(blocks.filter((b) => b.type === "change").map((b) => b.id)))}
          >
            全选
          </button>
          <button type="button" className="btn" onClick={() => setAccepted(new Set())}>
            全不选
          </button>
          <span className="settings-hint">勾选要采纳的改动块；未勾选的保持原样。</span>
        </div>
        <div className="diff-hunks">
          {blocks.map((block, idx) => {
            if (block.type === "context") {
              const shown = block.lines.length > 6 ? [...block.lines.slice(0, 3), `… (${block.lines.length - 6} 行) …`, ...block.lines.slice(-3)] : block.lines;
              return (
                <pre key={`ctx-${idx}`} className="diff-context">
                  {shown.map((l) => ` ${l}`).join("\n")}
                </pre>
              );
            }
            const on = accepted.has(block.id);
            return (
              <div key={`chg-${block.id}`} className={`diff-hunk${on ? " on" : ""}`}>
                <label className="diff-hunk-head">
                  <input type="checkbox" checked={on} onChange={() => toggle(block.id)} />
                  改动 #{block.id + 1}
                </label>
                <div className="diff-hunk-body">
                  {block.removed.length ? (
                    <pre className="diff-removed">{block.removed.map((l) => `- ${l}`).join("\n")}</pre>
                  ) : null}
                  {block.added.length ? (
                    <pre className="diff-added">{block.added.map((l) => `+ ${l}`).join("\n")}</pre>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn danger" onClick={props.onReject}>
            全部拒绝
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => props.onAccept(applyBlocks(blocks, accepted))}
          >
            {acceptedCount === total ? "接受全部并写入" : `接受所选 (${acceptedCount}) 并写入`}
          </button>
        </div>
      </div>
    </div>
  );
}
