import { useEffect, useMemo, useRef, useState } from "react";

export interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

/** F1 / Ctrl+Shift+P command palette with substring filter. */
export function CommandPalette(props: {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [props.open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.commands;
    return props.commands.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [props.commands, query]);

  if (!props.open) return null;

  const runAt = (i: number): void => {
    const cmd = filtered[i];
    if (!cmd) return;
    props.onClose();
    cmd.run();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
      }}
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-label="命令面板"
        style={{
          width: 520,
          maxWidth: "90vw",
          background: "var(--ww-panel, #17191f)",
          border: "1px solid var(--ww-border, #2c313c)",
          borderRadius: 10,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") props.onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, filtered.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              runAt(index);
            }
          }}
          placeholder="输入命令…"
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "transparent",
            border: "none",
            outline: "none",
            color: "inherit",
            fontSize: 14,
            borderBottom: "1px solid var(--ww-border, #2c313c)",
          }}
        />
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 14, opacity: 0.6, fontSize: 13 }}>无匹配命令</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => runAt(i)}
                onMouseEnter={() => setIndex(i)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 14px",
                  background: i === index ? "var(--ww-hover, #262a33)" : "transparent",
                  border: "none",
                  color: "inherit",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <span>{c.title}</span>
                {c.hint ? <span style={{ opacity: 0.5, fontSize: 12 }}>{c.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
