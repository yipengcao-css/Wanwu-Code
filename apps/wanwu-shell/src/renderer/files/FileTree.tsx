import { useCallback, useEffect, useState, type ReactNode } from "react";

type Entry = { name: string; path: string; type: "file" | "dir" };

export function FileTree(props: {
  rootLabel: string;
  activePath: string | null;
  refreshToken: number;
  onOpenFile: (path: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, Entry[]>>({});
  const [selectedDir, setSelectedDir] = useState<string>(".");
  const [error, setError] = useState<string | null>(null);
  const [creator, setCreator] = useState<{ type: "file" | "dir" } | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadRoot = useCallback(async () => {
    try {
      setEntries(await window.wanwu.fs.list("."));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const reloadExpanded = useCallback(async () => {
    const dirs = Object.keys(expanded);
    const next: Record<string, Entry[]> = {};
    for (const d of dirs) {
      try {
        next[d] = await window.wanwu.fs.list(d);
      } catch {
        /* dir may be gone */
      }
    }
    setExpanded(next);
  }, [expanded]);

  useEffect(() => {
    void loadRoot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rootLabel, props.refreshToken]);

  useEffect(() => {
    if (props.refreshToken > 0) void reloadExpanded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.refreshToken]);

  async function toggleDir(rel: string): Promise<void> {
    setSelectedDir(rel);
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

  async function commitCreate(): Promise<void> {
    const name = creatorName.trim();
    setCreator(null);
    setCreatorName("");
    if (!creator || !name) return;
    const created = await window.wanwu.fs.create(selectedDir, name, creator.type);
    await loadRoot();
    await reloadExpanded();
    if (creator.type === "file") props.onOpenFile(created);
  }

  async function commitRename(rel: string): Promise<void> {
    const name = renameValue.trim();
    setRenaming(null);
    if (!name) return;
    await window.wanwu.fs.rename(rel, name);
    await loadRoot();
    await reloadExpanded();
  }

  async function remove(rel: string, name: string): Promise<void> {
    if (!window.confirm(`删除 ${name}?`)) return;
    await window.wanwu.fs.remove(rel);
    await loadRoot();
    await reloadExpanded();
  }

  function rowActions(e: Entry): ReactNode {
    return (
      <span className="row-actions">
        <button
          type="button"
          title="重命名"
          onClick={(ev) => {
            ev.stopPropagation();
            setRenaming(e.path);
            setRenameValue(e.name);
          }}
        >
          ✎
        </button>
        <button
          type="button"
          title="删除"
          onClick={(ev) => {
            ev.stopPropagation();
            void remove(e.path, e.name);
          }}
        >
          🗑
        </button>
      </span>
    );
  }

  function renderList(items: Entry[], depth: number): ReactNode {
    return items.map((e) => (
      <div key={e.path}>
        <div className={`file-row${props.activePath === e.path ? " active" : ""}`} style={{ paddingLeft: depth * 12 + 8 }}>
          {renaming === e.path ? (
            <input
              autoFocus
              className="inline-input"
              value={renameValue}
              onClick={(ev) => ev.stopPropagation()}
              onChange={(ev) => setRenameValue(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") void commitRename(e.path);
                if (ev.key === "Escape") setRenaming(null);
              }}
              onBlur={() => void commitRename(e.path)}
            />
          ) : (
            <button
              type="button"
              className={`file-item${e.type === "dir" ? " dir" : ""}`}
              onClick={() => (e.type === "dir" ? void toggleDir(e.path) : props.onOpenFile(e.path))}
            >
              {e.type === "dir" ? (expanded[e.path] ? "▾ " : "▸ ") : ""}
              {e.name}
            </button>
          )}
          {renaming === e.path ? null : rowActions(e)}
        </div>
        {e.type === "dir" && expanded[e.path] ? renderList(expanded[e.path]!, depth + 1) : null}
      </div>
    ));
  }

  return (
    <div className="file-panel">
      <div className="file-toolbar">
        <span className="file-cwd" title={selectedDir}>{selectedDir === "." ? "/" : selectedDir}</span>
        <span className="file-toolbar-actions">
          <button type="button" title="新建文件" onClick={() => { setCreator({ type: "file" }); setCreatorName(""); }}>+文件</button>
          <button type="button" title="新建文件夹" onClick={() => { setCreator({ type: "dir" }); setCreatorName(""); }}>+目录</button>
          <button type="button" title="刷新" onClick={() => void loadRoot()}>⟳</button>
        </span>
      </div>
      {creator ? (
        <div className="creator-row">
          <input
            autoFocus
            className="inline-input"
            placeholder={creator.type === "file" ? "新文件名" : "新目录名"}
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate();
              if (e.key === "Escape") setCreator(null);
            }}
            onBlur={() => void commitCreate()}
          />
        </div>
      ) : null}
      {error ? (
        <div className="empty">加载失败：{error}</div>
      ) : (
        <div className="file-tree">{renderList(entries, 0)}</div>
      )}
    </div>
  );
}
