import { useState } from "react";

type Match = { path: string; line: number; preview: string };

export function SearchPanel(props: { onOpenFile: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  async function run(): Promise<void> {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(await window.wanwu.search.text(query.trim()));
      setRan(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="search-panel">
      <div className="search-box">
        <input
          placeholder="全局搜索文本…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
          }}
        />
      </div>
      <div className="search-results">
        {busy ? <div className="empty">搜索中…</div> : null}
        {!busy && ran && results.length === 0 ? <div className="empty">无匹配</div> : null}
        {results.length > 0 ? (
          <div className="search-count">{results.length} 条匹配</div>
        ) : null}
        {results.map((r, i) => (
          <button
            type="button"
            key={`${r.path}:${r.line}:${i}`}
            className="search-result"
            onClick={() => props.onOpenFile(r.path)}
          >
            <span className="search-loc">
              {r.path}:{r.line}
            </span>
            <span className="search-preview">{r.preview}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
