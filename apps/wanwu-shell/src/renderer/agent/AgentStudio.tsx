import { useEffect, useMemo, useRef, useState } from "react";
import type { WanwuMode } from "../layout/OrbitBar";
import {
  applyMention,
  completeMentions,
  mentionTokenAt,
  type MentionSuggestion,
} from "./mentionComplete";
import {
  historyToLog,
  parseTodoToolText,
  upsertToolLog,
  type LogItem,
  type TodoRow,
} from "./sessionLog";

type ChatSession = {
  localId: string;
  title: string;
  acpSessionId?: string;
  log: LogItem[];
  hydrated?: boolean;
};

type PendingImage = { id: string; name: string; path: string; preview?: string };

type PendingPermission = { id: number; toolName: string; summary: string; risk?: string };

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
  openTabs?: string[];
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
  const [images, setImages] = useState<PendingImage[]>([]);
  const [perm, setPerm] = useState<PendingPermission | null>(null);
  const [queued, setQueued] = useState(0);
  const [lastCkpt, setLastCkpt] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ in?: number; out?: number } | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeLocalIdRef = useRef(activeLocalId);
  const busyRef = useRef(false);
  const queueRef = useRef<Array<{ prompt: string; images: PendingImage[] }>>([]);
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
    const switched = Boolean(prevRootRef.current && prevRootRef.current !== next);
    prevRootRef.current = next;
    if (switched) {
      setBusy(false);
      busyRef.current = false;
      queueRef.current = [];
      setQueued(0);
      setTodos([]);
    }
    void (async () => {
      try {
        await window.wanwu.acp.ensure();
        const { sessions } = await window.wanwu.acp.listSessions();
        if (!sessions.length) {
          if (switched) {
            const id = newLocalId();
            setChats([
              {
                localId: id,
                title: "会话 1",
                hydrated: true,
                log: [
                  {
                    kind: "status",
                    text: `工作区已切换 · ${next}（将创建新 ACP session）`,
                  },
                ],
              },
            ]);
            setActiveLocalId(id);
          }
          return;
        }
        const mapped: ChatSession[] = sessions.map((s) => ({
          localId: s.id,
          title: (s.preview || "会话").slice(0, 24),
          acpSessionId: s.id,
          hydrated: false,
          log: [
            {
              kind: "status",
              text: `已保存 · ${(s.updatedAt ?? "").slice(0, 16).replace("T", " ")} · 点击加载`,
            },
          ],
        }));
        setChats(mapped);
        setActiveLocalId(mapped[0]!.localId);
        const first = mapped[0]!;
        if (first.acpSessionId) {
          const loaded = await window.wanwu.acp.loadSession(first.acpSessionId);
          setChats((prev) =>
            prev.map((c) =>
              c.localId === first.localId
                ? { ...c, hydrated: true, log: historyToLog(loaded.history ?? []) }
                : c,
            ),
          );
        }
      } catch {
        /* first prompt still creates a session */
      }
    })();
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
      window.wanwu.acp.onTool((tool) => {
        const parsed = tool.title === "Todo" ? parseTodoToolText(tool.detail) : null;
        if (parsed) setTodos(parsed);
        patchActive((prev) => upsertToolLog(prev, tool));
      }),
      window.wanwu.acp.onError((t) =>
        patchActive((prev) => [...prev, { kind: "error", text: t }]),
      ),
      window.wanwu.acp.onPermission((req) => {
        setPerm(req);
        patchActive((prev) => [
          ...prev,
          {
            kind: "status",
            text: `等待权限确认 · ${req.toolName} · ${req.summary.slice(0, 80)}`,
          },
        ]);
      }),
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
    setTodos([]);
    try {
      if (target.acpSessionId && !target.hydrated) {
        const loaded = await window.wanwu.acp.loadSession(target.acpSessionId);
        setChats((prev) =>
          prev.map((c) =>
            c.localId === localId
              ? { ...c, hydrated: true, log: historyToLog(loaded.history ?? []) }
              : c,
          ),
        );
        props.onStatus(`恢复会话 · ${target.title}`);
        return;
      }
      if (target.acpSessionId) {
        await window.wanwu.acp.setSession(target.acpSessionId);
        props.onStatus(`切换会话 · ${target.title}`);
      }
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
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
          hydrated: true,
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

  async function attachFiles(incoming: File[]): Promise<void> {
    for (const file of incoming) {
      if (!file.type.startsWith("image/")) continue;
      const dataBase64 = await fileToBase64(file);
      try {
        const saved = await window.wanwu.media.saveImage({
          name: file.name,
          mime: file.type,
          dataBase64,
        });
        const preview = URL.createObjectURL(file);
        setImages((prev) => [
          ...prev,
          { id: `${Date.now()}-${file.name}`, name: file.name, path: saved, preview },
        ]);
      } catch (err) {
        props.onStatus(err instanceof Error ? err.message : String(err));
      }
    }
  }

  async function pickImages(): Promise<void> {
    try {
      const paths = await window.wanwu.media.pickImages();
      setImages((prev) => [
        ...prev,
        ...paths.map((path) => ({
          id: `${Date.now()}-${path}`,
          name: path.split(/[\\/]/).pop() ?? path,
          path,
        })),
      ]);
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function send(override?: { prompt: string; images: PendingImage[] }): Promise<void> {
    const prompt = override?.prompt ?? text.trim();
    const pending = override?.images ?? images;
    if ((!prompt && pending.length === 0) || !props.enabled) return;
    if (busyRef.current && !override) {
      queueRef.current.push({ prompt, images: pending });
      setQueued(queueRef.current.length);
      setText("");
      setImages([]);
      patchActive((prev) => [
        ...prev,
        {
          kind: "user",
          text:
            (prompt || "（附图）") +
            (pending.length ? `\n[已附加 ${pending.length} 张图片]` : "") +
            "\n（已排队）",
        },
      ]);
      props.onStatus(`已排队 · ${queueRef.current.length} 条（当前回合结束后发送）`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    if (!override) {
      setText("");
      setImages([]);
    }
    if (!override) {
      const titleFromPrompt = (prompt || pending[0]?.name || "附图").slice(0, 24);
      setChats((prev) =>
        prev.map((c) =>
          c.localId === activeLocalIdRef.current
            ? {
                ...c,
                title: c.title.startsWith("会话") && c.log.filter((l) => l.kind === "user").length === 0
                  ? titleFromPrompt
                  : c.title,
                log: [
                  ...c.log,
                  {
                    kind: "user",
                    text:
                      (prompt || "（附图）") +
                      (pending.length ? `\n[已附加 ${pending.length} 张图片]` : ""),
                  },
                ],
              }
            : c,
        ),
      );
    }
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
      const tabs = (props.openTabs ?? []).filter(Boolean);
      const ctx = props.activePath || tabs.length
        ? `[EDITOR_CONTEXT]\n${
            props.activePath ? `Active file: ${props.activePath}\n` : ""
          }${tabs.length ? `Open tabs: ${tabs.join(", ")}\n` : ""}${
            props.selectionHint ? `Preview:\n\`\`\`\n${props.selectionHint}\n\`\`\`\n` : ""
          }[/EDITOR_CONTEXT]\n`
        : "";
      const result = await window.wanwu.acp.prompt(`${prefix}${ctx}${prompt || "请查看附图。"}`, {
        diagnostics: props.diagnosticsSummary,
        terminal: props.terminalSummary,
        images: pending.length ? pending.map((img) => img.path) : undefined,
      });
      pending.forEach((img) => {
        if (img.preview) URL.revokeObjectURL(img.preview);
      });
      const usage = result?.usage;
      const tokens =
        usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined)
          ? ` · in ${usage.inputTokens ?? 0} / out ${usage.outputTokens ?? 0}`
          : "";
      const ckpt = result?.checkpointId ? ` · ckpt ${result.checkpointId}` : "";
      if (result?.checkpointId) setLastCkpt(result.checkpointId);
      if (usage) setLastUsage({ in: usage.inputTokens, out: usage.outputTokens });
      const pics = pending.length ? ` · 已发送 ${pending.length} 张图` : "";
      props.onStatus(`回合完成${tokens}${ckpt}${pics}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(message)) {
        patchActive((prev) => [...prev, { kind: "status", text: "已停止生成" }]);
        props.onStatus("已停止");
      } else {
        if (!override) setImages(pending);
        patchActive((prev) => [...prev, { kind: "error", text: message }]);
        props.onStatus(`错误 · ${message}`);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      const next = queueRef.current.shift();
      setQueued(queueRef.current.length);
      if (next) void send(next);
    }
  }

  async function stop(): Promise<void> {
    queueRef.current = [];
    setQueued(0);
    try {
      await window.wanwu.acp.cancel();
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function undoLast(): Promise<void> {
    try {
      const r = await window.wanwu.ckpt.restore(lastCkpt ?? undefined);
      const n = r.restored.length + r.deleted.length;
      props.onStatus(`已撤销 ${r.id} · ${n} 个文件`);
      patchActive((prev) => [
        ...prev,
        { kind: "status", text: `已撤销检查点 ${r.id}（${n} 个文件）` },
      ]);
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
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
        {todos.length ? (
          <div className="todo-panel" aria-label="任务清单">
            <div className="todo-head">
              任务 {todos.filter((t) => t.status === "completed").length}/{todos.length}
            </div>
            <ul>
              {todos.map((t, i) => (
                <li key={`${t.content}-${i}`} className={`todo-item ${t.status}`}>
                  <span className="todo-mark">
                    {t.status === "completed" ? "●" : t.status === "in_progress" ? "◐" : "○"}
                  </span>
                  {t.content}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {active.log.map((item, i) => {
          if (item.kind === "tool") {
            return (
              <div key={item.id ?? i} className="chip-row">
                <span className={`chip ${item.status}`}>
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
      {perm ? (
        <div className="card" role="alertdialog" aria-label="权限确认">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>权限 · {perm.toolName}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>{perm.summary}</div>
          <div className="chip-row">
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                void window.wanwu.acp.respondPermission(perm.id, "deny");
                setPerm(null);
              }}
            >
              拒绝
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void window.wanwu.acp.respondPermission(perm.id, "allow-session");
                setPerm(null);
              }}
            >
              本会话允许
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void window.wanwu.acp.respondPermission(perm.id, "allow-once");
                setPerm(null);
              }}
            >
              允许一次
            </button>
          </div>
        </div>
      ) : null}
      <div
        className="composer"
        onDragOver={(e) => {
          if (!props.enabled) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (!props.enabled) return;
          e.preventDefault();
          void attachFiles(Array.from(e.dataTransfer.files));
        }}
      >
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
        {images.length ? (
          <div className="attach-row" aria-label="待发送图片">
            {images.map((img) => (
              <span key={img.id} className="attach-chip">
                {img.preview ? <img src={img.preview} alt="" className="attach-thumb" /> : null}
                <span className="attach-name">{img.name}</span>
                <button
                  type="button"
                  className="attach-remove"
                  aria-label={`移除 ${img.name}`}
                  disabled={!props.enabled}
                  onClick={() => {
                    if (img.preview) URL.revokeObjectURL(img.preview);
                    setImages((prev) => prev.filter((x) => x.id !== img.id));
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={inputRef}
          value={text}
          disabled={!props.enabled}
          placeholder={
            !props.enabled
              ? "请先打开工作区"
              : busy
                ? "输入后续消息，当前回合结束后发送…"
                : "描述你的意图… 输入 @ 引用文件 / 代码库 / git / 终端 / 诊断，可粘贴或拖入图片"
          }
          onChange={(e) => {
            setText(e.target.value);
            setCursor(e.target.selectionStart);
            setActiveSug(0);
            setMentionOpen(true);
          }}
          onClick={(e) => setCursor(e.currentTarget.selectionStart)}
          onKeyUp={(e) => setCursor(e.currentTarget.selectionStart)}
          onPaste={(e) => {
            const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (!pasted.length) return;
            e.preventDefault();
            void attachFiles(pasted);
          }}
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
            {props.mode}
            {lastUsage ? ` · in ${lastUsage.in ?? 0}/out ${lastUsage.out ?? 0}` : ""}
            {queued ? ` · 队列 ${queued}` : ""}
            {lastCkpt ? ` · ckpt` : ""}
            {" · @ 引用 · Ctrl/Cmd+Enter · 忙时可排队"}
          </span>
          <div className="composer-actions">
            <button
              type="button"
              className="btn"
              disabled={!props.enabled || !lastCkpt}
              onClick={() => void undoLast()}
              title="撤销上一轮 Agent 改动"
            >
              撤销
            </button>
            <button
              type="button"
              className="btn"
              disabled={!props.enabled}
              onClick={() => void pickImages()}
            >
              附加图片
            </button>
            {busy ? (
              <button type="button" className="btn danger" onClick={() => void stop()}>
                停止
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary"
              disabled={!props.enabled || (!text.trim() && images.length === 0)}
              onClick={() => void send()}
            >
              {busy ? "排队" : "运行"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
