import { useCallback, useEffect, useState } from "react";

type GitStatus = {
  available: boolean;
  branch: string | null;
  entries: { path: string; index: string; workingTree: string }[];
};

export function GitPanel(props: {
  refreshToken: number;
  onOpenFile: (path: string) => void;
  onStatus: (s: string) => void;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus(await window.wanwu.git.status());
  }, []);

  useEffect(() => {
    void load();
  }, [load, props.refreshToken]);

  async function commit(): Promise<void> {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const res = await window.wanwu.git.commit(message.trim());
      props.onStatus(res.ok ? `已提交：${message.trim()}` : `提交失败：${res.output}`);
      if (res.ok) setMessage("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.available) return <div className="empty">当前目录不是 Git 仓库</div>;

  return (
    <div className="git-panel">
      <div className="git-head">
        <span>分支：{status?.branch ?? "…"}</span>
        <button type="button" title="刷新" onClick={() => void load()}>⟳</button>
      </div>
      <div className="git-list">
        {status?.entries.length === 0 ? <div className="empty">工作区干净</div> : null}
        {status?.entries.map((e) => (
          <button type="button" key={e.path} className="git-row" onClick={() => props.onOpenFile(e.path)}>
            <span className="git-code">{(e.index + e.workingTree).trim() || "?"}</span>
            <span className="git-path">{e.path}</span>
          </button>
        ))}
      </div>
      <div className="git-commit">
        <input
          placeholder="提交信息…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
          }}
        />
        <button
          type="button"
          className="btn primary"
          disabled={busy || !message.trim() || (status?.entries.length ?? 0) === 0}
          onClick={() => void commit()}
        >
          暂存全部并提交
        </button>
      </div>
    </div>
  );
}
