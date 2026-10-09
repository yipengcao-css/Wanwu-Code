import { useState, type ReactElement, type ReactNode } from "react";
import { findFileRefs } from "./fileRefs";
import { parseInlines, parseProse, type Inline } from "./markdownLite";
import { splitMessageBlocks, summarizeToolDetail, thoughtPreview, type LogItem } from "./sessionLog";

export type ApplyMode = "insert" | "replace";

function FileRefText(props: {
  text: string;
  onOpenFile?: (path: string, line?: number) => void;
}): ReactElement {
  const refs = props.onOpenFile ? findFileRefs(props.text) : [];
  if (!props.onOpenFile || refs.length === 0) return <>{props.text}</>;
  const nodes: ReactNode[] = [];
  let last = 0;
  refs.forEach((ref, i) => {
    if (ref.start > last) nodes.push(props.text.slice(last, ref.start));
    nodes.push(
      <button
        key={i}
        type="button"
        className="file-ref"
        onClick={() => props.onOpenFile?.(ref.path, ref.line)}
      >
        {props.text.slice(ref.start, ref.end)}
      </button>,
    );
    last = ref.end;
  });
  if (last < props.text.length) nodes.push(props.text.slice(last));
  return <>{nodes}</>;
}

const FOLD_CODE_AFTER = 8;

function InlineRuns(props: {
  parts: Inline[];
  onOpenFile?: (path: string, line?: number) => void;
}): ReactElement {
  return (
    <>
      {props.parts.map((part, i) => {
        if (part.type === "code") {
          return (
            <code key={i} className="md-code">
              <FileRefText text={part.text} onOpenFile={props.onOpenFile} />
            </code>
          );
        }
        if (part.type === "strong") {
          return (
            <strong key={i}>
              <FileRefText text={part.text} onOpenFile={props.onOpenFile} />
            </strong>
          );
        }
        if (part.type === "em") {
          return (
            <em key={i}>
              <FileRefText text={part.text} onOpenFile={props.onOpenFile} />
            </em>
          );
        }
        if (part.type === "link") {
          return (
            <a key={i} className="md-link" href={part.href} target="_blank" rel="noreferrer noopener">
              {part.text}
            </a>
          );
        }
        return (
          <span key={i}>
            <FileRefText text={part.text} onOpenFile={props.onOpenFile} />
          </span>
        );
      })}
    </>
  );
}

function MarkdownProse(props: {
  text: string;
  onOpenFile?: (path: string, line?: number) => void;
}): ReactElement {
  const blocks = parseProse(props.text);
  if (!blocks.length) {
    return (
      <div className="prose-block">
        <FileRefText text={props.text} onOpenFile={props.onOpenFile} />
      </div>
    );
  }
  return (
    <div className="prose-block">
      {blocks.map((block, i) => {
        if (block.type === "h") {
          const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return (
            <Tag key={i} className={`md-h md-h${block.level}`}>
              <InlineRuns parts={block.inlines} onOpenFile={props.onOpenFile} />
            </Tag>
          );
        }
        if (block.type === "ul" || block.type === "ol") {
          const Tag = block.type === "ul" ? "ul" : "ol";
          return (
            <Tag key={i} className="md-list">
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineRuns parts={item.length ? item : parseInlines("")} onOpenFile={props.onOpenFile} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={i} className="md-quote">
              <InlineRuns parts={block.inlines} onOpenFile={props.onOpenFile} />
            </blockquote>
          );
        }
        return (
          <p key={i} className="md-p">
            <InlineRuns parts={block.inlines} onOpenFile={props.onOpenFile} />
          </p>
        );
      })}
    </div>
  );
}

export function ToolChip(props: {
  item: Extract<LogItem, { kind: "tool" }>;
  onOpenFile?: (path: string, line?: number) => void;
}): ReactElement {
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
      {open && props.item.detail ? (
        <pre className="tool-detail">
          <FileRefText text={props.item.detail} onOpenFile={props.onOpenFile} />
        </pre>
      ) : null}
    </div>
  );
}

export function MessageBody(props: {
  text: string;
  thinking?: boolean;
  defaultThinkOpen?: boolean;
  onOpenFile?: (path: string, line?: number) => void;
  onApplyCode?: (code: string, mode: ApplyMode) => void;
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
          const actions = props.onApplyCode ? (
            <div className="code-actions">
              <button type="button" className="btn" onClick={() => props.onApplyCode?.(block.text, "insert")}>
                插入到光标
              </button>
              <button type="button" className="btn" onClick={() => props.onApplyCode?.(block.text, "replace")}>
                替换当前文件
              </button>
            </div>
          ) : null;
          if (!fold) {
            return (
              <div key={i}>
                <pre className="code-block">
                  <div className="code-label">{label}</div>
                  {block.text}
                </pre>
                {actions}
              </div>
            );
          }
          return (
            <div key={i}>
              <details className="code-fold">
                <summary>{label}（默认收起）</summary>
                <pre className="code-block">{block.text}</pre>
              </details>
              {actions}
            </div>
          );
        }
        return <MarkdownProse key={i} text={block.text} onOpenFile={props.onOpenFile} />;
      })}
    </div>
  );
}
