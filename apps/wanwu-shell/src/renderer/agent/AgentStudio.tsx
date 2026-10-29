import { useCallback, useEffect, useRef, useState } from "react";
import type { WanwuMode } from "../layout/OrbitBar";
import {
  activeMentionPartial,
  applyMentionInsert,
  mergeMentionSuggestions,
} from "./mentionComplete";
import { TodoPanel, type TodoItemView } from "./TodoPanel";

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
      text: "Agent Studio · wanwu-native ACP。输入 @ 引用文件/目录；选择 Mode 后描述任务。",
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
  terminalTail?: string;
  onStatus: (s: string) => void;
  onCheckpointRestored?: (payload: { restored: string[]; deleted: string[] }) => void;
}) {
  const [chats, setChats] = useState<ChatSession[]>([
    { localId: newLocalId(), title: "会话 1", log: emptyWelcome() },
  ]);
  const [activeLocalId, setActiveLocalId] = useState(chats[0]!.localId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [todos, setTodos] = useState<TodoItemView[]>([]);
  const [lastCheckpointId, setLastCheckpointId] = useState<string | null>(null);
  const [mentionHits, setMentionHits] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [caret, setCaret] = useState(0);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeLocalIdRef = useRef(activeLocalId);
  activeLocalIdRef.current = activeLocalId;
  const mentionReq = useRef(0);

  const active = chats.find((c) => c.localId === activeLocalId) ?? chats[0]!;

  function patchActive(updater: (log: LogItem[]) => LogItem[]): void {
    const id = activeLocalIdRef.current;
    setChats((prev) =>
      prev.map((c) => (c.localId === id ? { ...c, log: updater(c.log) } : c)),
    );
  }

  const refreshMentions = useCallback(
    async (partial: string | null) => {
      if (!partial || !props.enabled) {
        setMentionHits([]);
        return;
      }
      const id = ++mentionReq.current;
      try {
        const { paths, specials } = await window.wanwu.fs.mentionCandidates(partial);
        if (id !== mentionReq.current) return;
        setMentionHits(mergeMentionSuggestions(paths, specials, partial));
        setMentionIndex(0);
      } catch {
        if (id === mentionReq.current) setMentionHits([]);
      }
    },
    [props.enabled],
  );

  useEffect(() => {
    return window.wanwu.shell.onFocusAgent(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const partial = activeMentionPartial(text, caret);
    void refreshMentions(partial);
  }, [text, caret, refreshMentions]);

  useEffect(() => {
    const offs = [
      window.wanwu.acp.onTodo((items) => setTodos(items)),
      window.wanwu.acp.onCheckpointRestored((payload) => {
        props.onCheckpointRestored?.({
          restored: payload.restored ?? [],
          deleted: payload.deleted ?? [],
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [props.onCheckpointRestored]);

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
      setTodos([]);
      setLastCheckpointId(null);
    }
    prevRootRef.current = next;
  }, [props.workspaceRoot]);

  useEffect(() => {
    const offs = [
      window.wanwu.acp.onMessage((t) =>
        patchActive((prev) => [...prev, { kind: "assistant", text: t }]),
      ),
      window.wanwu.acp.onTool((tool) => {
        if (tool.title === "Todo" && tool.status === "completed" && tool.detail) {
          /* todo_list event is authoritative; tool chip is fallback only */
        }
        patchActive((prev) => [
          ...prev,
          { kind: "tool", title: tool.title, status: tool.status, detail: tool.detail },
        ]);
      }),
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

  function insertMention(token: string): void {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? caret;
    const next = applyMentionInsert(text, pos, token);
    setText(next.text);
    setCaret(next.caret);
    setMentionHits([]);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.caret, next.caret);
    });
  }

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
      setTodos([]);
      props.onStatus(`新会话 · ${title}`);
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function restoreCheckpoint(): Promise<void> {
    if (!props.enabled || restoreBusy) return;
    setRestoreBusy(true);
    try {
      await window.wanwu.acp.ensure();
      const result = await window.wanwu.acp.restoreCheckpoint(lastCheckpointId ?? undefined);
      if (result.ok) {
        patchActive((prev) => [
          ...prev,
          {
            kind: "status",
            text: `已恢复检查点 ${result.checkpointId ?? "?"} · 还原 ${result.restored?.length ?? 0} 个文件`,
          },
        ]);
        props.onStatus(`检查点已恢复 · ${result.checkpointId ?? "?"}`);
      } else {
        const msg =
          result.missing?.length
            ? `恢复不完整：缺少 ${result.missing.join(", ")}`
            : "没有可恢复的检查点";
        patchActive((prev) => [...prev, { kind: "error", text: msg }]);
        props.onStatus(msg);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchActive((prev) => [...prev, { kind: "error", text: message }]);
      props.onStatus(message);
    } finally {
      setRestoreBusy(false);
    }
  }

  async function send(): Promise<void> {
    const prompt = text.trim();
    if (!prompt || !props.enabled || busy) return;
    setBusy(true);
    setText("");
    setMentionHits([]);
    const titleFromPrompt = prompt.slice(0, 24);
    setChats((prev) =>
      prev.map((c) =>
        c.localId === activeLocalIdRef.current
          ? {
              ...c,
              title:
                c.title.startsWith("会话") && c.log.filter((l) => l.kind === "user").length === 0
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
      const out = await window.wanwu.acp.prompt(`${prefix}${ctx}${prompt}`, {
        diagnostics: props.diagnosticsSummary,
        terminal: props.terminalTail,
      });
      if (out?.checkpointId) setLastCheckpointId(out.checkpointId);
      props.onStatus("回合完成");
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
          disabled={!props.enabled || busy || restoreBusy}
          title={lastCheckpointId ? `回滚 ${lastCheckpointId}` : "回滚最近一次 Agent 检查点"}
          onClick={() => void restoreCheckpoint()}
        >
          {restoreBusy ? "恢复中…" : "恢复到上一轮"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!props.enabled || busy}
          onClick={() => void createChat()}
        >
          新建会话
        </button>
      </div>
      <TodoPanel items={todos} />
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
        {mentionHits.length ? (
          <ul className="mention-menu" role="listbox" aria-label="@ 引用补全">
            {mentionHits.map((hit, idx) => (
              <li key={hit}>
                <button
                  type="button"
                  role="option"
                  aria-selected={idx === mentionIndex}
                  className={idx === mentionIndex ? "active" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(hit);
                  }}
                >
                  {hit}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={inputRef}
          value={text}
          disabled={!props.enabled || busy}
          placeholder={props.enabled ? "描述你的意图… 输入 @ 引用文件/目录/git" : "请先打开工作区"}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
          }}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (mentionHits.length) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % mentionHits.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => (i - 1 + mentionHits.length) % mentionHits.length);
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey)) {
                e.preventDefault();
                insertMention(mentionHits[mentionIndex] ?? mentionHits[0]!);
                return;
              }
              if (e.key === "Escape") {
                setMentionHits([]);
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
