import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type TermSession = { id: string; title: string };

let termSeq = 1;

function TerminalInstance(props: { id: string; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 12,
      theme: {
        background: "#05080f",
        foreground: "#e7eef9",
        cursor: "#2ee6a6",
        selectionBackground: "rgba(123, 97, 255, 0.35)",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    void window.wanwu.term.start(props.id, term.cols, term.rows);
    const off = window.wanwu.term.onData((payload) => {
      if (payload.id === props.id) term.write(payload.data);
    });
    const disp = term.onData((data) => {
      void window.wanwu.term.write(props.id, data);
    });
    const onResize = () => {
      fit.fit();
      void window.wanwu.term.resize(props.id, term.cols, term.rows);
    };
    window.addEventListener("resize", onResize);

    return () => {
      off();
      disp.dispose();
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      void window.wanwu.term.stop(props.id);
    };
  }, [props.id]);

  // Refit when becoming visible again.
  useEffect(() => {
    if (props.active && termRef.current && fitRef.current) {
      const t = setTimeout(() => {
        fitRef.current?.fit();
        if (termRef.current) {
          void window.wanwu.term.resize(props.id, termRef.current.cols, termRef.current.rows);
        }
      }, 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [props.active, props.id]);

  return (
    <div
      ref={hostRef}
      style={{ height: "100%", width: "100%", display: props.active ? "block" : "none" }}
    />
  );
}

/** Multi-terminal drawer: tabs of independent PTYs. */
export function TerminalPane(props: { active: boolean }) {
  const [sessions, setSessions] = useState<TermSession[]>([{ id: "t1", title: "终端 1" }]);
  const [activeId, setActiveId] = useState("t1");

  if (!props.active) return null;

  const addTerminal = (): void => {
    const id = `t${++termSeq}`;
    setSessions((prev) => [...prev, { id, title: `终端 ${prev.length + 1}` }]);
    setActiveId(id);
  };

  const closeTerminal = (id: string): void => {
    void window.wanwu.term.stop(id);
    const next = sessions.filter((s) => s.id !== id);
    if (!next.length) {
      const fresh = `t${++termSeq}`;
      setSessions([{ id: fresh, title: "终端 1" }]);
      setActiveId(fresh);
      return;
    }
    if (activeId === id) setActiveId(next[next.length - 1]!.id);
    setSessions(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "4px 8px",
          borderBottom: "1px solid var(--ww-border, #2c313c)",
          alignItems: "center",
        }}
      >
        {sessions.map((s) => (
          <span key={s.id} style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              type="button"
              className="btn"
              style={{
                padding: "1px 8px",
                fontSize: 11,
                opacity: s.id === activeId ? 1 : 0.55,
              }}
              onClick={() => setActiveId(s.id)}
            >
              {s.title}
            </button>
            {sessions.length > 1 ? (
              <button
                type="button"
                className="btn"
                style={{ padding: "0 4px", fontSize: 11, opacity: 0.5 }}
                onClick={() => closeTerminal(s.id)}
                title="关闭终端"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        <button
          type="button"
          className="btn"
          style={{ padding: "1px 8px", fontSize: 11 }}
          onClick={addTerminal}
          title="新建终端"
        >
          ＋
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {sessions.map((s) => (
          <TerminalInstance key={s.id} id={s.id} active={s.id === activeId} />
        ))}
      </div>
    </div>
  );
}
