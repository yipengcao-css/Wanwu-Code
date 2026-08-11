import { useEffect, useRef, useState } from "react";
import type { WanwuMode } from "../layout/OrbitBar";

type LogItem =
  | { kind: "user" | "assistant" | "error" | "status"; text: string }
  | { kind: "tool"; title: string; status: string; detail?: string };

export function AgentStudio(props: {
  mode: WanwuMode;
  enabled: boolean;
  activePath: string | null;
  selectionHint?: string;
  onStatus: (s: string) => void;
}) {
  const [log, setLog] = useState<LogItem[]>([
    {
      kind: "status",
      text: "Agent Studio · wanwu-native ACP。选择 Mode 后描述任务。",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return window.wanwu.shell.onFocusAgent(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const offs = [
      window.wanwu.acp.onMessage((t) => setLog((prev) => [...prev, { kind: "assistant", text: t }])),
      window.wanwu.acp.onTool((tool) =>
        setLog((prev) => [
          ...prev,
          { kind: "tool", title: tool.title, status: tool.status, detail: tool.detail },
        ]),
      ),
      window.wanwu.acp.onError((t) => setLog((prev) => [...prev, { kind: "error", text: t }])),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  async function send(): Promise<void> {
    const prompt = text.trim();
    if (!prompt || !props.enabled || busy) return;
    setBusy(true);
    setText("");
    setLog((prev) => [...prev, { kind: "user", text: prompt }]);
    try {
      props.onStatus("连接 ACP…");
      const { sessionId } = await window.wanwu.acp.ensure();
      props.onStatus(`session=${sessionId ?? "?"}`);
      const prefix =
        props.mode === "plan"
          ? "[MODE=plan] 只产出计划，不要修改文件。\n"
          : props.mode === "ask"
            ? "[MODE=ask] 只回答问题，不要修改文件。\n"
            : props.mode === "verify"
              ? "[MODE=verify] 验证最近变更（测试/lint），不要继续写功能。\n"
              : "[MODE=agent] 可以在权限允许下修改代码。\n";
      const ctx = props.activePath
        ? `[EDITOR_CONTEXT]\nOpen file: ${props.activePath}\n${
            props.selectionHint ? `Preview:\n\`\`\`\n${props.selectionHint}\n\`\`\`\n` : ""
          }[/EDITOR_CONTEXT]\n`
        : "";
      await window.wanwu.acp.prompt(`${prefix}${ctx}${prompt}`);
      props.onStatus("回合完成");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLog((prev) => [...prev, { kind: "error", text: message }]);
      props.onStatus(`错误 · ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="agent-log">
        {log.map((item, i) => {
          if (item.kind === "tool") {
            return (
              <div key={i} className="chip-row">
                <span className="chip">
                  {item.status} {item.title}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
              </div>
            );
          }
          if (item.kind === "status") {
            return (
              <div key={i} className="card" style={{ opacity: 0.75, fontSize: 12 }}>
                {item.text}
              </div>
            );
          }
          return (
            <div key={i} className={`card ${item.kind}`}>
              {item.text}
            </div>
          );
        })}
      </div>
      <div className="composer">
        <textarea
          ref={inputRef}
          value={text}
          disabled={!props.enabled || busy}
          placeholder={props.enabled ? "描述你的意图…" : "请先打开工作区"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-row">
          <span style={{ color: "var(--ww-muted)", fontSize: 12 }}>
            Mode={props.mode} · Ctrl/Cmd+Enter 发送
          </span>
          <button
            type="button"
            className="btn primary"
            disabled={!props.enabled || busy || !text.trim()}
            onClick={() => void send()}
          >
            {busy ? "运行中…" : "运行"}
          </button>
        </div>
      </div>
    </>
  );
}
