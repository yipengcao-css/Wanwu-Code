import type { MarkerDiag } from "../editor/MonacoPane";

const ORDER: Record<MarkerDiag["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

export function ProblemsPanel(props: {
  diagnostics: Record<string, MarkerDiag[]>;
  scanning?: boolean;
  note?: string | null;
  onOpen: (path: string, line: number) => void;
}) {
  const rows = Object.entries(props.diagnostics)
    .flatMap(([path, diags]) => diags.map((d) => ({ path, ...d })))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.path.localeCompare(b.path) || a.startLine - b.startLine);

  if (!rows.length) {
    return (
      <div className="empty">
        {props.scanning ? "正在扫描工作区…" : "当前没有错误或警告。"}
        {props.note ? <p className="field-hint">{props.note}</p> : null}
      </div>
    );
  }

  return (
    <ul className="problem-list" aria-label="问题">
      {props.scanning ? <li className="field-hint">正在更新工作区问题…</li> : null}
      {props.note ? <li className="field-hint">{props.note}</li> : null}
      {rows.map((row, i) => (
        <li key={`${row.path}:${row.startLine}:${i}`}>
          <button
            type="button"
            className={`problem-row sev-${row.severity}`}
            onClick={() => props.onOpen(row.path, row.startLine + 1)}
          >
            <span className="problem-sev">{row.severity === "error" ? "错误" : row.severity === "warning" ? "警告" : "提示"}</span>
            <span className="problem-msg">{row.message}</span>
            <span className="problem-loc">
              {row.path}:{row.startLine + 1}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
