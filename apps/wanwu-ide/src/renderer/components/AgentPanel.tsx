import React, { useEffect, useRef, useState } from "react";
import type { AgentBackendInfo, AgentMode } from "@shared/ipc.js";
import type { BackendChoice } from "@shared/api.js";

export interface TranscriptItem {
  id: number;
  type: "message" | "tool" | "status" | "user";
  text: string;
  status?: string;
}

interface Props {
  status: string;
  backend: AgentBackendInfo | null;
  backendChoice: BackendChoice;
  items: TranscriptItem[];
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onBackendChange: (choice: BackendChoice) => void;
  onSend: (text: string) => void;
}

const MODES: AgentMode[] = ["ask", "plan", "agent", "verify"];

export function AgentPanel({
  status,
  backend,
  backendChoice,
  items,
  mode,
  onModeChange,
  onBackendChange,
  onSend,
}: Props): React.ReactElement {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items]);

  const submit = (): void => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="agent-panel">
      <div className="panel-header">
        <span className="panel-title">Wanwu Agent</span>
        <span className={`agent-status status-${status}`}>{status}</span>
      </div>

      <div className="agent-controls">
        <div className="mode-switch">
          {MODES.map((m) => (
            <button
              key={m}
              className={`mode-btn${m === mode ? " active" : ""}`}
              onClick={() => onModeChange(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <select
          className="backend-select"
          value={backendChoice}
          onChange={(e) => onBackendChange(e.target.value as BackendChoice)}
          title="ACP 后端"
        >
          <option value="mock">mock ACP</option>
          <option value="cli">wanwu CLI (grok)</option>
        </select>
      </div>

      {backend && (
        <div className="backend-badge">
          后端: <code>{backend.backend}</code> · {backend.packaged ? "packaged" : "dev"} ·{" "}
          <code>{shortCmd(backend)}</code>
        </div>
      )}

      <div className="transcript" ref={scrollRef}>
        {items.length === 0 && <div className="panel-empty">向 Agent 提问，试试切换 Plan/Agent 模式</div>}
        {items.map((item) => (
          <div key={item.id} className={`bubble bubble-${item.type}`}>
            {item.type === "tool" && <span className="bubble-tag">工具 · {item.status}</span>}
            {item.type === "status" && <span className="bubble-tag">状态</span>}
            {item.type === "user" && <span className="bubble-tag">你</span>}
            <div className="bubble-text">{item.text}</div>
          </div>
        ))}
      </div>

      <div className="agent-input">
        <textarea
          placeholder={`[${mode}] 输入指令，Enter 发送 (Shift+Enter 换行)`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send-btn" onClick={submit}>
          发送
        </button>
      </div>
    </div>
  );
}

function shortCmd(backend: AgentBackendInfo): string {
  const cmd = backend.command.split(/[\\/]/).pop() ?? backend.command;
  return `${cmd} ${backend.args.map((a) => a.split(/[\\/]/).pop()).join(" ")}`.trim();
}
