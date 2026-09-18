import { useEffect, useMemo, useRef, useState } from "react";
import type { WanwuMode } from "../layout/OrbitBar";
import {
  applyMention,
  completeMentions,
  mentionTokenAt,
  type MentionSuggestion,
} from "./mentionComplete";

type LogItem =
  | { kind: "user" | "assistant" | "error" | "status"; text: string }
  | { kind: "tool"; title: string; status: string; detail?: string };

type ChatSession = {
  localId: string;
  title: string;
  acpSessionId?: string;
  log: LogItem[];
};

function newLocalId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyWelcome(): LogItem[] {
  return [
    {
      kind: "status",
      text: "Agent Studio · wanwu-native ACP。选择 Mode 后描述任务。",
    },
  ];
}

export function AgentStudio(props: {
  mode: WanwuMode;
  enabled: boolean;
  workspaceRoot: string | null;
  activePath: string | null;
  selectionHint?: string;
  /** Flattened LSP diagnostics for @diagnostics mention resolution. */
  diagnosticsSummary?: string;
  /** Recent terminal output for @terminal mention resolution. */
  terminalSummary?: string;
  onStatus: (s: string) => void;
}) {
  const [chats, setChats] = useState<ChatSession[]>([
    { localId: newLocalId(), title: "会话 1", log: emptyWelcome() },
  ]);
  const [activeLocalId, setActiveLocalId] = useState(chats[0]!.localId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const [activeSug, setActiveSug] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeLocalIdRef = useRef(activeLocalId);
  activeLocalIdRef.current = activeLocalId;

  const active = chats.find((c) => c.localId === activeLocalId) ?? chats[0]!;

  function patchActive(updater: (log: LogItem[]) => LogItem[]): void {
    const id = activeLocalIdRef.current;
    setChats((prev) =>
      prev.map((c) => (c.localId === id ? { ...c, log: updater(c.log) } : c)),
    );
  }

  useEffect(() => {
    return window.wanwu.shell.onFocusAgent(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!props.workspaceRoot) {
      setFiles([]);
      return;
    }
    void window.wanwu.fs.listFiles().then(setFiles).catch(() => setFiles([]));
  }, [props.workspaceRoot]);

  const token = useMemo(() => mentionTokenAt(text, cursor), [text, cursor]);
  const suggestions = useMemo(
    () => (token && mentionOpen ? completeMentions(token.partial, files) : []),
    [token, files, mentionOpen],
  );

  function insertMention(sug: MentionSuggestion): void {
    if (!token) return;
    const next = applyMention(text, token, sug.insert);
    setText(next);
    setActiveSug(0);
    const pos = token.start + sug.insert.length + (sug.insert.endsWith(":") ? 0 : 1);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCursor(pos);
    });
  }

  const prevRootRef = useRef<string | null>(null);
  useEffect(() => {
    const next = props.workspaceRoot;
    if (!next) return;
    if (prevRootRef.current && prevRootRef.current !== next) {
      const id = newLocalId();
      setChats([
        {
          localId: id,
          title: "会话 1",
          log: [
            {
              kind: "status",
              text: `工作区已切换 · ${next}（将创建新 ACP session）`,
            },
          ],
        },
      ]);
      setActiveLocalId(id);
      setBusy(false);
    }
    prevRootRef.current = next;
  }, [props.workspaceRoot]);

  useEffect(() => {
    const offs = [
      window.wanwu.acp.onMessage((t) =>
        patchActive((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "assistant") {
            return [...prev.slice(0, -1), { kind: "assistant", text: last.text + t }];
          }
          return [...prev, { kind: "assistant", text: t }];
        }),
      ),
      window.wanwu.acp.onTool((tool) =>
        patchActive((prev) => [
          ...prev,
          { kind: "tool", title: tool.title, status: tool.status, detail: tool.detail },
        ]),
      ),
      window.wanwu.acp.onError((t) =>
        patchActive((prev) => [...prev, { kind: "error", text: t }]),
      ),
      window.wanwu.acp.onSession((info) => {
        const sid = info.sessionId;
        if (!sid) return;
        setChats((prev) =>
          prev.map((c) =>
            c.localId === activeLocalIdRef.current
              ? {
                  ...c,
                  acpSessionId: sid,
                  log: [
                    ...c.log,
                    {
                      kind: "status",
                      text: `session=${sid} · cwd=${info.cwd ?? "?"}`,
                    },
                  ],
                }
              : c,
          ),
        );
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  async function switchChat(localId: string): Promise<void> {
    if (busy || localId === activeLocalId) return;
    const target = chats.find((c) => c.localId === localId);
    if (!target) return;
    setActiveLocalId(localId);
    if (target.acpSessionId) {
      try {
        await window.wanwu.acp.setSession(target.acpSessionId);
        props.onStatus(`切换会话 · ${target.title}`);
      } catch (err) {
        props.onStatus(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function createChat(): Promise<void> {
    if (!props.enabled || busy) return;
    setBusy(true);
    try {
      await window.wanwu.acp.ensure();
      const { sessionId } = await window.wanwu.acp.newChat();
      const localId = newLocalId();
      const title = `会话 ${chats.length + 1}`;
      setChats((prev) => [
        ...prev,
        {
          localId,
          title,
          acpSessionId: sessionId,
          log: [
            {
              kind: "status",
              text: `新会话已创建 · ${sessionId ?? "?"}`,
            },
          ],
        },
      ]);
      setActiveLocalId(localId);
      props.onStatus(`新会话 · ${title}`);
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function send(): Promise<void> {
    const prompt = text.trim();
    if (!prompt || !props.enabled || busy) return;
    setBusy(true);
    setText("");
    const titleFromPrompt = prompt.slice(0, 24);
    setChats((prev) =>
      prev.map((c) =>
        c.localId === activeLocalIdRef.current
          ? {
              ...c,
              title: c.title.startsWith("会话") && c.log.filter((l) => l.kind === "user").length === 0
                ? titleFromPrompt
                : c.title,
              log: [...c.log, { kind: "user", text: prompt }],
            }
          : c,
      ),
    );
    try {
      props.onStatus("连接 ACP…");
      const { sessionId, cwd } = await window.wanwu.acp.ensure();
      setChats((prev) =>
        prev.map((c) =>
          c.localId === activeLocalIdRef.current
            ? { ...c, acpSessionId: sessionId ?? c.acpSessionId }
            : c,
        ),
      );
      props.onStatus(`session=${sessionId ?? "?"} · ${cwd ?? props.workspaceRoot ?? "?"}`);
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
      const result = (await window.wanwu.acp.prompt(`${prefix}${ctx}${prompt}`, {
        diagnostics: props.diagnosticsSummary,
        terminal: props.terminalSummary,
      })) as {
        usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
        checkpointId?: string;
      };
      const usage = result?.usage;
      const tokens =
        usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined)
          ? ` · in ${usage.inputTokens ?? 0} / out ${usage.outputTokens ?? 0}`
          : "";
      const ckpt = result?.checkpointId ? ` · ckpt ${result.checkpointId}` : "";
      props.onStatus(`回合完成${tokens}${ckpt}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchActive((prev) => [...prev, { kind: "error", text: message }]);
      props.onStatus(`错误 · ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="session-rail" role="tablist" aria-label="会话列表">
        <div className="session-list">
          {chats.map((c) => (
            <button
              key={c.localId}
              type="button"
              role="tab"
              aria-selected={c.localId === activeLocalId}
              className={`session-tab${c.localId === activeLocalId ? " active" : ""}`}
              disabled={busy && c.localId !== activeLocalId}
              onClick={() => void switchChat(c.localId)}
              title={c.acpSessionId ?? c.title}
            >
              {c.title}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          disabled={!props.enabled || busy}
          onClick={() => void createChat()}
        >
          新建会话
        </button>
      </div>
      <div className="agent-log">
        {active.log.map((item, i) => {
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
        {suggestions.length > 0 ? (
          <ul className="mention-menu" role="listbox" aria-label="@ 上下文补全">
            {suggestions.map((s, i) => (
              <li key={s.insert}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === activeSug}
                  className={`mention-item${i === activeSug ? " active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(s);
                  }}
                >
                  <span>{s.label}</span>
                  {s.hint ? <span className="mention-hint">{s.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={inputRef}
          value={text}
          disabled={!props.enabled || busy}
          placeholder={props.enabled ? "描述你的意图… 输入 @ 引用文件 / git / 终端 / 诊断" : "请先打开工作区"}
          onChange={(e) => {
            setText(e.target.value);
            setCursor(e.target.selectionStart);
            setActiveSug(0);
            setMentionOpen(true);
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSug((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSug((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
                e.preventDefault();
                const pick = suggestions[activeSug] ?? suggestions[0];
                if (pick) insertMention(pick);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMentionOpen(false);
                return;
              }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-row">
          <span style={{ color: "var(--ww-muted)", fontSize: 12 }}>
            Mode={props.mode} · @ 引用 · Ctrl/Cmd+Enter 发送
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
