import { useState, type ReactElement } from "react";
import { splitMessageBlocks, summarizeToolDetail, type LogItem } from "./sessionLog";

const FOLD_CODE_AFTER = 8;

export function ToolChip(props: { item: Extract<LogItem, { kind: "tool" }> }): ReactElement {
  const [open, setOpen] = useState(false);
  const summary = summarizeToolDetail(props.item.title, props.item.detail);
  return (
    <div className="process-row">
      <button
        type="button"
        className={`chip ${props.item.status}`}
        onClick={() => props.item.detail && setOpen((v) => !v)}
        title={props.item.detail ? "展开/收起工具结果" : undefined}
      >
        {props.item.status} {props.item.title}
        {summary ? ` · ${summary}` : ""}
      </button>
      {open && props.item.detail ? <pre className="tool-detail">{props.item.detail}</pre> : null}
    </div>
  );
}

export function MessageBody(props: {
  text: string;
  thinking?: boolean;
  defaultThinkOpen?: boolean;
}): ReactElement {
  if (props.thinking) {
    return (
      <details className="think-block" open={props.defaultThinkOpen}>
        <summary>思考过程</summary>
        <div className="think-body">{props.text}</div>
      </details>
    );
  }
  const blocks = splitMessageBlocks(props.text);
  return (
    <div className="message-body">
      {blocks.map((block, i) => {
        if (block.type === "think") {
          return (
            <details key={i} className="think-block" open={props.defaultThinkOpen}>
              <summary>思考过程</summary>
              <div className="think-body">{block.text}</div>
            </details>
          );
        }
        if (block.type === "code") {
          const fold = block.lines > FOLD_CODE_AFTER;
          const label = `代码${block.lang ? ` · ${block.lang}` : ""} · ${block.lines} 行`;
          if (!fold) {
            return (
              <pre key={i} className="code-block">
                <div className="code-label">{label}</div>
                {block.text}
              </pre>
            );
          }
          return (
            <details key={i} className="code-fold">
              <summary>{label}（默认收起）</summary>
              <pre className="code-block">{block.text}</pre>
            </details>
          );
        }
        return (
          <div key={i} className="prose-block">
            {block.text}
          </div>
        );
      })}
    </div>
  );
}
