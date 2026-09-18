import { useEffect, useRef, useState } from "react";
import type { WanwuMode } from "../layout/OrbitBar";

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
  onStatus: (s: string) => void;
}) {
  const [chats, setChats] = useState<ChatSession[]>([
    { localId: newLocalId(), title: "会话 1", log: emptyWelcome() },
  ]);
  const [activeLocalId, setActiveLocalId] = useState(chats[0]!.localId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<Array<{ id: string; name: string; path: string; preview?: string }>>(
    [],
  );
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
        patchActive((prev) => [...prev, { kind: "assistant", text: t }]),
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

  async function attachFiles(files: File[]): Promise<void> {
    for (const file of files) {
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

  async function send(): Promise<void> {
    const prompt = text.trim();
    const pending = images;
    if ((!prompt && pending.length === 0) || !props.enabled || busy) return;
    setBusy(true);
    setText("");
    setImages([]);
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
      await window.wanwu.acp.prompt(`${prefix}${ctx}${prompt || "请查看附图。"}`, {
        diagnostics: props.diagnosticsSummary,
        images: pending.length ? pending.map((img) => img.path) : undefined,
      });
      pending.forEach((img) => {
        if (img.preview) URL.revokeObjectURL(img.preview);
      });
      props.onStatus(pending.length ? `回合完成 · 已发送 ${pending.length} 张图` : "回合完成");
    } catch (err) {
      setImages(pending);
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
      <div
        className="composer"
        onDragOver={(e) => {
          if (!props.enabled || busy) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (!props.enabled || busy) return;
          e.preventDefault();
          void attachFiles(Array.from(e.dataTransfer.files));
        }}
      >
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
                  disabled={busy}
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
          disabled={!props.enabled || busy}
          placeholder={props.enabled ? "描述你的意图… 可粘贴或拖入图片" : "请先打开工作区"}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (!files.length) return;
            e.preventDefault();
            void attachFiles(files);
          }}
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
          <div className="composer-actions">
            <button
              type="button"
              className="btn"
              disabled={!props.enabled || busy}
              onClick={() => void pickImages()}
            >
              附加图片
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!props.enabled || busy || (!text.trim() && images.length === 0)}
              onClick={() => void send()}
            >
              {busy ? "运行中…" : "运行"}
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
