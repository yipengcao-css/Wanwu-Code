import { useState, type ReactElement } from "react";
import { parseInlines, parseProse, type Inline } from "./markdownLite";
import { splitMessageBlocks, summarizeToolDetail, thoughtPreview, type LogItem } from "./sessionLog";

const FOLD_CODE_AFTER = 8;

function InlineRuns(props: { parts: Inline[] }): ReactElement {
  return (
    <>
      {props.parts.map((part, i) => {
        if (part.type === "code") {
          return (
            <code key={i} className="md-code">
              {part.text}
            </code>
          );
        }
        if (part.type === "strong") return <strong key={i}>{part.text}</strong>;
        if (part.type === "em") return <em key={i}>{part.text}</em>;
        if (part.type === "link") {
          return (
            <a key={i} className="md-link" href={part.href} target="_blank" rel="noreferrer noopener">
              {part.text}
            </a>
          );
        }
        return <span key={i}>{part.text}</span>;
      })}
    </>
  );
}

function MarkdownProse(props: { text: string }): ReactElement {
  const blocks = parseProse(props.text);
  if (!blocks.length) return <div className="prose-block">{props.text}</div>;
  return (
    <div className="prose-block">
      {blocks.map((block, i) => {
        if (block.type === "h") {
          const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return (
            <Tag key={i} className={`md-h md-h${block.level}`}>
              <InlineRuns parts={block.inlines} />
            </Tag>
          );
        }
        if (block.type === "ul" || block.type === "ol") {
          const Tag = block.type === "ul" ? "ul" : "ol";
          return (
            <Tag key={i} className="md-list">
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineRuns parts={item.length ? item : parseInlines("")} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={i} className="md-quote">
              <InlineRuns parts={block.inlines} />
            </blockquote>
          );
        }
        return (
          <p key={i} className="md-p">
            <InlineRuns parts={block.inlines} />
          </p>
        );
      })}
    </div>
  );
}

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
    const preview = thoughtPreview(props.text);
    return (
      <details className="think-block" open={props.defaultThinkOpen}>
        <summary>{preview ? `思考过程 · ${preview}` : "思考过程"}</summary>
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
              <summary>
                {thoughtPreview(block.text) ? `思考过程 · ${thoughtPreview(block.text)}` : "思考过程"}
              </summary>
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
        return <MarkdownProse key={i} text={block.text} />;
      })}
    </div>
  );
}
