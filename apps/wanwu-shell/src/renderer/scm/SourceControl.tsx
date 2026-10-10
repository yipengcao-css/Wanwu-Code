import { useCallback, useEffect, useState } from "react";

type ScmFile = { path: string; code: string; staged: boolean };

export function SourceControl(props: { rootLabel: string; onOpenFile: (path: string) => void }) {
  const [repo, setRepo] = useState(true);
  const [branch, setBranch] = useState("");
  const [files, setFiles] = useState<ScmFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [diff, setDiff] = useState("");
  const [history, setHistory] = useState<Array<{ hash: string; subject: string }>>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void window.wanwu.git.changes().then((r) => {
      setRepo(r.repo);
      setBranch(r.branch);
      setFiles(r.files);
    }).catch(() => {
      setRepo(false);
      setBranch("");
      setFiles([]);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [props.rootLabel, refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.wanwu.fs.onChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refresh(), 300);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (selected && !files.some((f) => f.path === selected)) setSelected(null);
  }, [files, selected]);

  useEffect(() => {
    if (!selected) {
      setDiff("");
      setHistory([]);
      return;
    }
    void window.wanwu.git.diff(selected).then(setDiff).catch(() => setDiff(""));
    void window.wanwu.git.log(selected).then(setHistory).catch(() => setHistory([]));
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
        <span className="scm-count">{branch ? `${branch} · ` : ""}{files.length} 个更改</span>
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
      {selected ? (
        diff ? <pre className="scm-diff">{diff}</pre> : <p className="empty">没有可显示的文本差异。</p>
      ) : null}
      {selected ? (
        <ul className="scm-log" aria-label="最近提交">
          {history.length === 0 ? <li className="field-hint">这个文件还没有提交记录。</li> : null}
          {history.map((entry) => (
            <li key={entry.hash}>
              <span className="scm-hash">{entry.hash}</span>
              {entry.subject}
            </li>
          ))}
        </ul>
      ) : null}
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
