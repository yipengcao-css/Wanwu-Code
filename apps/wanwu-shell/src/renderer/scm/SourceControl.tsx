import { useCallback, useEffect, useState } from "react";

type ScmFile = { path: string; code: string; staged: boolean };

export function SourceControl(props: { rootLabel: string; onOpenFile: (path: string) => void }) {
  const [repo, setRepo] = useState(true);
  const [files, setFiles] = useState<ScmFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void window.wanwu.git.changes().then((r) => {
      setRepo(r.repo);
      setFiles(r.files);
    }).catch(() => {
      setRepo(false);
      setFiles([]);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [props.rootLabel, refresh]);

  useEffect(() => {
    if (!selected) {
      setDiff("");
      return;
    }
    void window.wanwu.git.diff(selected).then(setDiff).catch(() => setDiff(""));
  }, [selected, files]);

  async function stage(file: ScmFile, next: boolean): Promise<void> {
    setBusy(true);
    try {
      const r = await window.wanwu.git.stage([file.path], next);
      setStatus(r.text);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function commit(): Promise<void> {
    setBusy(true);
    try {
      const r = await window.wanwu.git.commit(message);
      setStatus(r.text);
      if (r.ok) setMessage("");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!repo) {
    return <div className="empty">当前文件夹不是 Git 仓库。文件树上也不会再刷 fatal 报错。</div>;
  }

  return (
    <div className="scm-panel">
      <div className="scm-toolbar">
        <button type="button" className="btn" onClick={refresh} disabled={busy}>
          刷新
        </button>
        <span className="scm-count">{files.length} 个更改</span>
      </div>
      {files.length === 0 ? <p className="empty">工作区是干净的。</p> : null}
      <ul className="scm-list">
        {files.map((f) => (
          <li key={f.path} className={selected === f.path ? "active" : ""}>
            <label>
              <input
                type="checkbox"
                checked={f.staged}
                disabled={busy}
                onChange={(e) => void stage(f, e.target.checked)}
                aria-label={f.staged ? `取消暂存 ${f.path}` : `暂存 ${f.path}`}
              />
            </label>
            <button type="button" className="scm-path" onClick={() => setSelected(f.path)}>
              <span className={`scm-badge scm-${f.code}`}>{f.code}</span>
              {f.path}
            </button>
            <button type="button" className="btn" onClick={() => props.onOpenFile(f.path)}>
              打开
            </button>
          </li>
        ))}
      </ul>
      {selected && diff ? <pre className="scm-diff">{diff}</pre> : null}
      <label className="field">
        <span className="field-label">提交说明</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
      </label>
      <button type="button" className="btn primary" disabled={busy || !message.trim()} onClick={() => void commit()}>
        提交
      </button>
      {status ? <p className="field-hint">{status}</p> : null}
    </div>
  );
}
