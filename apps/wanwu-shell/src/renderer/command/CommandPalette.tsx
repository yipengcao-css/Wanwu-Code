import { useEffect, useMemo, useState } from "react";

export type Command = { title: string; run: () => void };
type SymbolHit = { name: string; kind: string; path: string; line: number; preview: string };

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

type Item = { label: string; hint?: string; kind: "cmd" | "file" | "symbol"; run: () => void; score: number };

export function CommandPalette(props: {
  commands: Command[];
  onOpenFile: (path: string) => void;
  onOpenSymbol: (path: string, line: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<SymbolHit[]>([]);
  const [sel, setSel] = useState(0);

  const commandMode = query.startsWith(">");
  const symbolMode = query.startsWith("#");

  useEffect(() => {
    void window.wanwu.fs.allFiles().then(setFiles);
  }, []);

  useEffect(() => {
    if (!symbolMode) return;
    const q = query.slice(1).trim();
    let cancelled = false;
    const t = setTimeout(() => {
      void window.wanwu.symbols.find(q).then((s) => {
        if (!cancelled) setSymbols(s);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, symbolMode]);

  const items = useMemo<Item[]>(() => {
    if (symbolMode) {
      return symbols
        .slice(0, 100)
        .map((s) => ({
          label: `${s.name}  ·  ${s.path}:${s.line}`,
          hint: s.kind,
          kind: "symbol" as const,
          run: () => props.onOpenSymbol(s.path, s.line),
          score: 0,
        }));
    }
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
  }, [query, files, symbols, props, commandMode, symbolMode]);

  useEffect(() => {
    setSel(0);
  }, [query, symbols]);

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
          placeholder="文件名快速打开 · 输入 > 执行命令 · 输入 # 跳转符号…"
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
        <div className="palette-list">
          {items.length === 0 ? <div className="empty">无匹配</div> : null}
          {items.map((item, i) => (
            <button
              type="button"
              key={`${item.kind}:${item.label}:${i}`}
              className={`palette-item${i === sel ? " active" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => activate(i)}
            >
              <span className="palette-kind">
                {item.kind === "cmd" ? "›" : item.kind === "symbol" ? "ƒ" : "◎"}
              </span>
              <span className="palette-label">{item.label}</span>
              {item.hint ? <span className="palette-hint">{item.hint}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
