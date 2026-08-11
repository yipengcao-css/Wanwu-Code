import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function TerminalPane(props: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!props.active || !hostRef.current || termRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, ui-monospace, monospace",
      fontSize: 12,
      theme: {
        background: "#05080f",
        foreground: "#e7eef9",
        cursor: "#2ee6a6",
        selectionBackground: rgba(123, 97, 255, 0.35),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();
    termRef.current = term;

    void window.wanwu.term.start();
    const off = window.wanwu.term.onData((data) => term.write(data));
    const disp = term.onData((data) => {
      void window.wanwu.term.write(data);
    });
    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      off();
      disp.dispose();
      window.removeEventListener("resize", onResize);
      term.dispose();
      termRef.current = null;
      void window.wanwu.term.stop();
    };
  }, [props.active]);

  return <div ref={hostRef} style={{ height: "100%", width: "100%" }} />;
}

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}
