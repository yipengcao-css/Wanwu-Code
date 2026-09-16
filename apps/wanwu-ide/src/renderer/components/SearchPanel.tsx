import React, { useState } from "react";
import type { SearchMatch, WorkspaceInfo } from "@shared/ipc.js";

interface Props {
  workspace: WorkspaceInfo;
  onOpenFile: (relPath: string) => void;
}

export function SearchPanel({ workspace, onOpenFile }: Props): React.ReactElement {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const run = async (): Promise<void> => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await window.wanwu.search.text(query.trim()));
    } finally {
      setSearching(false);
    }
  };

  if (!workspace.root) return <div className="panel-empty">未打开文件夹</div>;

  return (
    <div className="search-panel">
      <div className="panel-header">
        <span className="panel-title">搜索</span>
      </div>
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
        {searching && <div className="panel-empty">搜索中…</div>}
        {!searching && results.length === 0 && query && <div className="panel-empty">无匹配</div>}
        {results.map((r, i) => (
          <div
            key={`${r.path}:${r.line}:${i}`}
            className="search-result"
            onClick={() => onOpenFile(r.path)}
          >
            <span className="search-loc">
              {r.path}:{r.line}
            </span>
            <span className="search-preview">{r.preview}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
