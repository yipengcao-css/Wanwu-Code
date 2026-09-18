import { useCallback, useEffect, useState, type ReactNode } from "react";
import { scmCodeForPath, type GitStatusEntry } from "../../shared/scm";

type Entry = { name: string; path: string; type: "file" | "dir" };
type GitRow = { path: string; code: string; raw: string };

const SCM_TITLE: Record<string, string> = {
  M: "已修改",
  A: "已暂存新增",
  D: "已删除",
  "?": "未跟踪",
  U: "冲突",
  R: "重命名",
  C: "复制",
  dirty: "含子变更",
};

export function FileTree(props: {
  rootLabel: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Entry[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [scm, setScm] = useState<GitRow[]>([]);

  const refreshScm = useCallback(() => {
    void window.wanwu.git.status().then(setScm).catch(() => setScm([]));
  }, []);

  useEffect(() => {
    void window.wanwu.fs
      .list(".")
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
    refreshScm();
  }, [props.rootLabel, refreshScm]);

  // Refresh on external filesystem changes (agent edits, git checkout, …).
  useEffect(() => {
    return window.wanwu.fs.onChanged(() => {
      void window.wanwu.fs.list(".").then(setEntries).catch(() => undefined);
      refreshScm();
      setExpanded((prev) => {
        const next: Record<string, Entry[]> = {};
        for (const rel of Object.keys(prev)) {
          void window.wanwu.fs.list(rel).then((kids) => {
            setExpanded((cur) => (cur[rel] ? { ...cur, [rel]: kids } : cur));
          });
        }
        return { ...next, ...prev };
      });
    });
  }, [refreshScm]);

  async function toggleDir(rel: string): Promise<void> {
    if (expanded[rel]) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[rel];
        return next;
      });
      return;
    }
    const kids = await window.wanwu.fs.list(rel);
    setExpanded((prev) => ({ ...prev, [rel]: kids }));
  }

  function badge(rel: string): ReactNode {
    const code = scmCodeForPath(rel, scm as GitStatusEntry[]);
    if (!code) return null;
    const label = code === "dirty" ? "·" : code;
    return (
      <span className={`scm-badge scm-${code}`} title={SCM_TITLE[code] ?? code}>
        {label}
      </span>
    );
  }

  function renderList(items: Entry[], depth: number): ReactNode {
    return items.map((e) => (
      <div key={e.path} style={{ marginLeft: depth * 10 }}>
        {e.type === "dir" ? (
          <>
            <button type="button" className="file-item dir" onClick={() => void toggleDir(e.path)}>
              <span className="file-name">
                {expanded[e.path] ? "▾" : "▸"} {e.name}
              </span>
              {badge(e.path)}
            </button>
            {expanded[e.path] ? renderList(expanded[e.path]!, depth + 1) : null}
          </>
        ) : (
          <button
            type="button"
            className={`file-item${props.activePath === e.path ? " active" : ""}`}
            onClick={() => props.onOpenFile(e.path)}
          >
            <span className="file-name">{e.name}</span>
            {badge(e.path)}
          </button>
        )}
      </div>
    ));
  }

  if (error) return <div className="empty">加载失败：{error}</div>;
  return <div className="file-tree">{renderList(entries, 0)}</div>;
}
