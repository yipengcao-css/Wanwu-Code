import { useEffect, useRef, useState } from "react";

type Status = "running" | "pass" | "fail";

export function VerifyPanel(props: { onClose: () => void }) {
  const [lines, setLines] = useState<string>("");
  const [status, setStatus] = useState<Status>("running");
  const [command, setCommand] = useState<string>("");
  const logRef = useRef<HTMLPreElement>(null);

  function start(): void {
    setLines("");
    setStatus("running");
    void window.wanwu.verify.run().then((r) => setCommand(r.command));
  }

  useEffect(() => {
    const offData = window.wanwu.verify.onData((chunk) => setLines((prev) => prev + chunk));
    const offDone = window.wanwu.verify.onDone((r) => setStatus(r.exitCode === 0 ? "pass" : "fail"));
    start();
    return () => {
      offData();
      offDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  const badge =
    status === "running" ? "运行中…" : status === "pass" ? "通过 ✓" : "失败 ✗";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal verify-modal">
        <h3>
          验证 · <code>{command || "…"}</code>
          <span className={`verify-badge verify-${status}`}>{badge}</span>
        </h3>
        <pre className="verify-log" ref={logRef}>
          {lines || "启动中…"}
        </pre>
        <div className="modal-actions">
          {status === "running" ? (
            <button type="button" className="btn danger" onClick={() => void window.wanwu.verify.cancel()}>
              取消
            </button>
          ) : (
            <button type="button" className="btn" onClick={start}>
              重跑
            </button>
          )}
          <button type="button" className="btn primary" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
