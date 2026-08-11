import { useEffect, useState, type ReactNode } from "react";

type Entry = { name: string; path: string; type: "file" | "dir" };

export function FileTree(props: {
  rootLabel: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Entry[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.wanwu.fs
      .list(".")
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, [props.rootLabel]);

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

  function renderList(items: Entry[], depth: number): ReactNode {
    return items.map((e) => (
      <div key={e.path} style={{ marginLeft: depth * 10 }}>
        {e.type === "dir" ? (
          <>
            <button type="button" className="file-item dir" onClick={() => void toggleDir(e.path)}>
              {expanded[e.path] ? "▾" : "▸"} {e.name}
            </button>
            {expanded[e.path] ? renderList(expanded[e.path]!, depth + 1) : null}
          </>
        ) : (
          <button
            type="button"
            className={`file-item${props.activePath === e.path ? " active" : ""}`}
            onClick={() => props.onOpenFile(e.path)}
          >
            {e.name}
          </button>
        )}
      </div>
    ));
  }

  if (error) return <div className="empty">加载失败：{error}</div>;
  return <div className="file-tree">{renderList(entries, 0)}</div>;
}
