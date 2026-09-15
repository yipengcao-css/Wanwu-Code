import { useEffect, useRef, useState } from "react";

type Hit = { path: string; line: number; text: string };

/** Global workspace search (main-process regex scan, capped). */
export function SearchPanel(props: { onOpenFile: (path: string, line?: number) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      setSearched(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearching(true);
      void window.wanwu.fs
        .search(query.trim())
        .then((r) => {
          setHits(r);
          setSearched(true);
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div className="search-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索工作区（支持正则）…"
        style={{
          margin: "6px",
          padding: "6px 8px",
          background: "var(--ww-input, #14161c)",
          border: "1px solid var(--ww-border, #2c313c)",
          borderRadius: "6px",
          color: "inherit",
          fontSize: "12px",
          outline: "none",
        }}
      />
      <div style={{ flex: 1, overflow: "auto", padding: "0 6px" }}>
        {searching ? <div className="empty">搜索中…</div> : null}
        {!searching && searched && hits.length === 0 ? (
          <div className="empty">无匹配结果</div>
        ) : null}
        {hits.map((h, i) => (
          <button
            key={`${h.path}:${h.line}:${i}`}
            type="button"
            className="file-item"
            style={{ display: "block", width: "100%", textAlign: "left" }}
            onClick={() => props.onOpenFile(h.path, h.line)}
            title={`${h.path}:${h.line}`}
          >
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {h.path}:{h.line}
            </div>
            <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
              {h.text}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
