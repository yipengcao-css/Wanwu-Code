import { useEffect, useMemo, useRef, useState } from "react";

export type Command = { title: string; run: () => void };

function subsequenceScore(hay: string, needle: string): number {
  if (!needle) return 1;
  const h = hay.toLowerCase();
  const n = needle.toLowerCase();
  let hi = 0;
  let score = 0;
  for (let ni = 0; ni < n.length; ni += 1) {
    const idx = h.indexOf(n[ni]!, hi);
    if (idx === -1) return -1;
    score += idx === hi ? 2 : 1;
    hi = idx + 1;
  }
  return score - h.length * 0.01;
}

export function CommandPalette(props: {
  commands: Command[];
  onOpenFile: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.wanwu.fs.allFiles().then(setFiles);
  }, []);

  const commandMode = query.startsWith(">");
  const items = useMemo(() => {
    if (commandMode) {
      const q = query.slice(1).trim();
      return props.commands
        .map((c) => ({ label: c.title, kind: "cmd" as const, run: c.run, score: subsequenceScore(c.title, q) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => a.score - b.score)
        .slice(0, 50);
    }
    return files
      .map((f) => ({ label: f, kind: "file" as const, run: () => props.onOpenFile(f), score: subsequenceScore(f, query) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 50);
  }, [query, files, props, commandMode]);

  useEffect(() => {
    setSel(0);
  }, [query]);

  function activate(i: number): void {
    const item = items[i];
    if (!item) return;
    props.onClose();
    item.run();
  }

  return (
    <div className="modal-backdrop palette-backdrop" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder="输入文件名快速打开，或输入 > 执行命令…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              activate(sel);
            } else if (e.key === "Escape") {
              props.onClose();
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {items.length === 0 ? <div className="empty">无匹配</div> : null}
          {items.map((item, i) => (
            <button
              type="button"
              key={`${item.kind}:${item.label}`}
              className={`palette-item${i === sel ? " active" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => activate(i)}
            >
              <span className="palette-kind">{item.kind === "cmd" ? "›" : "◎"}</span>
              <span className="palette-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
