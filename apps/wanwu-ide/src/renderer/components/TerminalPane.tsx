import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export function TerminalPane(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shell, setShell] = useState<string>("");

  useEffect(() => {
    const id = `term-${Date.now()}`;
    const term = new Terminal({
      fontFamily: "JetBrains Mono, Menlo, Consolas, monospace",
      fontSize: 13,
      theme: { background: "#0d1117", foreground: "#c9d1d9" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const host = hostRef.current;
    if (!host) return;
    term.open(host);
    fit.fit();

    let disposed = false;
    void window.wanwu.terminal
      .create(id, term.cols, term.rows)
      .then((info) => {
        if (!disposed) setShell(info.shell);
      })
      .catch((err: unknown) => {
        term.writeln(`\r\n[终端启动失败] ${String(err)}`);
      });

    const dataSub = window.wanwu.terminal.onData((event) => {
      if (event.id === id) term.write(event.data);
    });
    const exitSub = window.wanwu.terminal.onExit((event) => {
      if (event.id === id) term.writeln(`\r\n[进程退出，代码 ${event.exitCode}]`);
    });
    const inputDisposable = term.onData((data) => {
      void window.wanwu.terminal.input(id, data);
    });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        void window.wanwu.terminal.resize(id, term.cols, term.rows);
      } catch {
        /* ignore */
      }
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      dataSub();
      exitSub();
      inputDisposable.dispose();
      void window.wanwu.terminal.dispose(id);
      term.dispose();
    };
  }, []);

  return (
    <div className="terminal-pane">
      <div className="panel-header">
        <span className="panel-title">终端</span>
        <span className="terminal-shell">{shell}</span>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
