import { useState } from "react";
import type { MarkerDiag } from "../editor/MonacoPane";
import type { LspWorkspaceEdit } from "../../shared/codeEdits";

const ORDER: Record<MarkerDiag["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

export type QuickFix = { title: string; edit: LspWorkspaceEdit | null };

export function ProblemsPanel(props: {
  diagnostics: Record<string, MarkerDiag[]>;
  scanning?: boolean;
  note?: string | null;
  onOpen: (path: string, line: number) => void;
  onListFixes?: (path: string, diag: MarkerDiag) => Promise<QuickFix[]>;
  onApplyFix?: (fix: QuickFix) => Promise<void>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ key: string; fixes: QuickFix[] } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const rows = Object.entries(props.diagnostics)
    .flatMap(([path, diags]) => diags.map((d) => ({ path, ...d })))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.path.localeCompare(b.path) || a.startLine - b.startLine);

  async function askFix(path: string, diag: MarkerDiag, key: string): Promise<void> {
    if (!props.onListFixes || !props.onApplyFix) return;
    setBusyKey(key);
    setHint(null);
    setMenu(null);
    try {
      const fixes = await props.onListFixes(path, diag);
      const usable = fixes.filter((fix) => fix.title);
      if (usable.length === 0) {
        setHint("没有可用的快速修复。");
        return;
      }
      if (usable.length === 1 && usable[0]?.edit) {
        await props.onApplyFix(usable[0]);
        return;
      }
      setMenu({ key, fixes: usable });
    } catch {
      setHint("快速修复没有完成。");
    } finally {
      setBusyKey(null);
    }
  }

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
      {hint ? <li className="field-hint">{hint}</li> : null}
      {rows.map((row, i) => {
        const key = `${row.path}:${row.startLine}:${i}`;
        const diag: MarkerDiag = {
          message: row.message,
          severity: row.severity,
          startLine: row.startLine,
          startCharacter: row.startCharacter,
          endLine: row.endLine,
          endCharacter: row.endCharacter,
          source: row.source,
          code: row.code,
        };
        return (
          <li key={key} className="problem-item">
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
            {props.onListFixes ? (
              <button
                type="button"
                className="btn"
                disabled={busyKey === key}
                onClick={() => void askFix(row.path, diag, key)}
              >
                修复
              </button>
            ) : null}
            {menu?.key === key ? (
              <ul className="problem-fixes">
                {menu.fixes.map((fix) => (
                  <li key={fix.title}>
                    <button
                      type="button"
                      className="btn"
                      disabled={!fix.edit}
                      title={fix.edit ? fix.title : "这个修复不能自动应用"}
                      onClick={() => {
                        if (!fix.edit) return;
                        setMenu(null);
                        void props.onApplyFix?.(fix);
                      }}
                    >
                      {fix.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
