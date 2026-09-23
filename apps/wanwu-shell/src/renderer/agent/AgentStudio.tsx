import { useEffect, useMemo, useRef, useState } from "react";
import type { WanwuMode } from "../layout/OrbitBar";
import {
  applyMention,
  completeMentions,
  mentionTokenAt,
  type MentionSuggestion,
} from "./mentionComplete";
import { MessageBody, ToolChip } from "./MessageBody";
import { modelsForProvider } from "./modelPresets";
import {
  appendThought,
  historyToLog,
  parseDebugWaiting,
  parseTodoToolText,
  upsertToolLog,
  type LogItem,
  type TodoRow,
} from "./sessionLog";

type StudioSkill = {
  id: string;
  name: string;
  source: "workspace" | "agents" | "user";
  summary: string;
};

function skillsStorageKey(root: string): string {
  return `wanwu.attachedSkills:${root}`;
}

function sourceLabel(source: StudioSkill["source"]): string {
  if (source === "agents") return "仓库";
  if (source === "user") return "用户";
  return "工作区";
}

type ChatSession = {
  localId: string;
  title: string;
  acpSessionId?: string;
  log: LogItem[];
  hydrated?: boolean;
};

type PendingImage = { id: string; name: string; path: string; preview?: string };

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

export type StudioSelection = {
  path: string;
  text: string;
  startLine: number;
  endLine: number;
};

function buildEditorContext(opts: {
  activePath: string | null;
  openTabs?: string[];
  selection?: StudioSelection | null;
}): string {
  const lines: string[] = [];
  if (opts.activePath) lines.push(`Active file: ${opts.activePath}`);
  const tabs = (opts.openTabs ?? []).filter(Boolean);
  if (tabs.length) lines.push(`Open tabs: ${tabs.join(", ")}`);
  if (opts.selection?.text.trim()) {
    const s = opts.selection;
    lines.push(`Selection (${s.path}:${s.startLine}-${s.endLine}):`);
    lines.push("```");
    lines.push(s.text.slice(0, 8000));
    lines.push("```");
  }
  return lines.length ? `[EDITOR_CONTEXT]\n${lines.join("\n")}\n[/EDITOR_CONTEXT]\n` : "";
}

function modePrefix(mode: WanwuMode): string {
  if (mode === "plan") return "[MODE=plan] 只产出计划，不要修改文件。\n";
  if (mode === "ask") return "[MODE=ask] 只回答问题，不要修改文件。\n";
  if (mode === "verify") return "[MODE=verify] 验证最近变更（测试/lint），不要继续写功能。\n";
  if (mode === "debug") {
    return "[MODE=debug] 先假设再插桩（标记 WANWU_DEBUG），等用户复现，再定点修并清理插桩。不要一上来改业务。\n";
  }
  return "[MODE=agent] 可以在权限允许下修改代码。\n";
}

export function AgentStudio(props: {
  mode: WanwuMode;
  enabled: boolean;
  workspaceRoot: string | null;
  activePath: string | null;
  openTabs?: string[];
  selection?: StudioSelection | null;
  addSelectionTick?: number;
  modelLabel?: string;
  /** Flattened LSP diagnostics for @diagnostics mention resolution. */
  diagnosticsSummary?: string;
  /** Recent terminal output for @terminal mention resolution. */
  terminalSummary?: string;
  onStatus: (s: string) => void;
  onMode?: (m: WanwuMode) => void;
  onOpenSettings?: () => void;
  onModelChange?: (label: string) => void;
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
  const [queued, setQueued] = useState(0);
  const [lastCkpt, setLastCkpt] = useState<string | null>(null);
  const [lastUsage, setLastUsage] = useState<{ in?: number; out?: number } | null>(null);
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [includeSelection, setIncludeSelection] = useState(true);
  const [planDraft, setPlanDraft] = useState<string | null>(null);
  const [debugWaiting, setDebugWaiting] = useState(false);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [availableSkills, setAvailableSkills] = useState<StudioSkill[]>([]);
  const [attachedSkillIds, setAttachedSkillIds] = useState<string[]>([]);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelChoices, setModelChoices] = useState<string[]>([]);
  const [currentModel, setCurrentModel] = useState("");
  const [modelBusy, setModelBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeLocalIdRef = useRef(activeLocalId);
  const busyRef = useRef(false);
  const queueRef = useRef<Array<{ prompt: string; images: PendingImage[] }>>([]);
  const sendRef = useRef<
    (override?: {
      prompt: string;
      images: PendingImage[];
      mode?: WanwuMode;
      userLabel?: string;
    }) => Promise<void>
  >(async () => undefined);
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
    setIncludeSelection(true);
  }, [props.selection?.path, props.selection?.startLine, props.selection?.endLine, props.selection?.text]);

  useEffect(() => {
    const tick = props.addSelectionTick;
    const sel = props.selection;
    if (!tick || !sel) return;
    const pin = `@${sel.path}:${sel.startLine}-${sel.endLine}`;
    setText((prev) => {
      if (prev.includes(pin)) return prev;
      return `${prev}${prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : ""}${pin} `;
    });
    setIncludeSelection(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [props.addSelectionTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!props.workspaceRoot) {
      setFiles([]);
      setAvailableSkills([]);
      setAttachedSkillIds([]);
      return;
    }
    void window.wanwu.fs.listFiles().then(setFiles).catch(() => setFiles([]));
    const root = props.workspaceRoot;
    void window.wanwu.skills.list().then((list) => {
      setAvailableSkills(list);
      try {
        const saved = sessionStorage.getItem(skillsStorageKey(root));
        if (saved !== null) {
          const ids = JSON.parse(saved) as unknown;
          if (Array.isArray(ids)) {
            setAttachedSkillIds(ids.filter((id): id is string => typeof id === "string"));
            return;
          }
        }
      } catch {
        /* first load */
      }
      setAttachedSkillIds(list.filter((s) => s.source === "workspace").map((s) => s.id));
    }).catch(() => setAvailableSkills([]));
  }, [props.workspaceRoot]);

  useEffect(() => {
    if (!props.workspaceRoot) return;
    try {
      sessionStorage.setItem(skillsStorageKey(props.workspaceRoot), JSON.stringify(attachedSkillIds));
    } catch {
      /* ignore quota */
    }
  }, [attachedSkillIds, props.workspaceRoot]);

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
      setDebugWaiting(false);
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
      window.wanwu.acp.onThought((t) => patchActive((prev) => appendThought(prev, t))),
      window.wanwu.acp.onTool((tool) => {
        const parsed = tool.title === "Todo" ? parseTodoToolText(tool.detail) : null;
        if (parsed) setTodos(parsed);
        const waiting = parseDebugWaiting(tool.title, tool.detail);
        if (waiting !== null) setDebugWaiting(waiting);
        patchActive((prev) => upsertToolLog(prev, tool));
      }),
      window.wanwu.acp.onError((t) =>
        patchActive((prev) => [...prev, { kind: "error", text: t }]),
      ),
      window.wanwu.acp.onPermission((req) => {
        const line = req.summary.split("\n").slice(0, 2).join(" · ");
        patchActive((prev) => [
          ...prev,
          {
            kind: "status",
            text: `等待权限确认 · ${req.toolName} · ${line.slice(0, 120)}`,
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
    setDebugWaiting(false);
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
      if (!props.workspaceRoot) {
        const root = await ensureDesktopWorkspace("会话");
        if (!root) return;
      }
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
      setDebugWaiting(false);
      props.onStatus(`新会话 · ${title}`);
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function ensureDesktopWorkspace(prompt: string): Promise<string | null> {
    if (props.workspaceRoot) return props.workspaceRoot;
    try {
      const ensured = await window.wanwu.workspace.ensureDesktop(prompt);
      if (ensured.created) {
        const name = ensured.root.split(/[\\/]/).filter(Boolean).pop() ?? ensured.root;
        patchActive((prev) => [
          ...prev,
          { kind: "status", text: `未选工作区 · 已在桌面创建 ${name}，后续文件写在这里` },
        ]);
        props.onStatus(`桌面工作区 · ${ensured.root}`);
      }
      return ensured.root;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      patchActive((prev) => [...prev, { kind: "error", text: `无法在桌面创建工作区：${message}` }]);
      props.onStatus(`错误 · ${message}`);
      return null;
    }
  }

  async function attachFiles(incoming: File[]): Promise<void> {
    if (!props.workspaceRoot) {
      const root = await ensureDesktopWorkspace("附图");
      if (!root) return;
    }
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

  async function send(override?: {
    prompt: string;
    images: PendingImage[];
    mode?: WanwuMode;
    userLabel?: string;
  }): Promise<void> {
    const prompt = override?.prompt ?? text.trim();
    const pending = override?.images ?? images;
    const sendMode = override?.mode ?? props.mode;
    if ((!prompt && pending.length === 0) || !props.enabled) return;
    if (!props.workspaceRoot) {
      const root = await ensureDesktopWorkspace(prompt || "task");
      if (!root) return;
    }
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
    if (!override || override.userLabel) {
      const shown =
        override?.userLabel ??
        ((prompt || "（附图）") + (pending.length ? `\n[已附加 ${pending.length} 张图片]` : ""));
      const titleFromPrompt = (override?.userLabel ?? (prompt || pending[0]?.name || "附图")).slice(0, 24);
      setChats((prev) =>
        prev.map((c) =>
          c.localId === activeLocalIdRef.current
            ? {
                ...c,
                title: c.title.startsWith("会话") && c.log.filter((l) => l.kind === "user").length === 0
                  ? titleFromPrompt
                  : c.title,
                log: [...c.log, { kind: "user", text: shown }],
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
      if (!override) setLastPrompt(prompt);
      const attached = availableSkills.filter((s) => attachedSkillIds.includes(s.id));
      if (attached.length) {
        patchActive((prev) => [
          ...prev,
          {
            kind: "status",
            text: `本轮 Skill：${attached.map((s) => s.name).join("、")}`,
          },
        ]);
      }
      const skillsReady = availableSkills.length > 0 || attachedSkillIds.length > 0;
      const skillTag = skillsReady ? `[SKILLS=${attachedSkillIds.join(",")}]\n` : "";
      const prefix = `${modePrefix(sendMode)}${skillTag}`;
      const ctx = buildEditorContext({
        activePath: props.activePath,
        openTabs: props.openTabs,
        selection: includeSelection ? props.selection : null,
      });
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
      if (sendMode === "plan") {
        setChats((prev) => {
          const c = prev.find((x) => x.localId === activeLocalIdRef.current);
          const last = [...(c?.log ?? [])].reverse().find((i) => i.kind === "assistant");
          if (last?.kind === "assistant" && last.text.trim()) setPlanDraft(last.text);
          return prev;
        });
      }
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

  sendRef.current = send;

  useEffect(() => {
    const onPromote = (e: Event): void => {
      const d =
        (e as CustomEvent<{ instruction?: string; selection?: string; path?: string }>).detail ?? {};
      props.onMode?.("agent");
      const prompt = [
        "内联编辑升格（Ctrl+K → Agent）：",
        d.path ? `文件：${d.path}` : "",
        d.instruction ? `指令：${d.instruction}` : "",
        d.selection ? `选区：\n\`\`\`\n${String(d.selection).slice(0, 8000)}\n\`\`\`` : "",
        "请按指令在仓库里完成修改；需要配套变更时一并处理。",
      ]
        .filter(Boolean)
        .join("\n");
      void sendRef.current({
        prompt,
        images: [],
        mode: "agent",
        userLabel: `升格：${d.instruction || "内联编辑"}`,
      });
    };
    window.addEventListener("wanwu-promote-agent", onPromote);
    return () => window.removeEventListener("wanwu-promote-agent", onPromote);
  }, [props.onMode]);

  async function stop(): Promise<void> {
    queueRef.current = [];
    setQueued(0);
    try {
      await window.wanwu.acp.cancel();
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickModel(model: string): Promise<void> {
    if (busy || modelBusy) return;
    if (model === currentModel) {
      setModelMenuOpen(false);
      return;
    }
    setModelBusy(true);
    try {
      const saved = await window.wanwu.settings.save({ model });
      await window.wanwu.acp.dispose();
      const label = `${saved.activeProvider}/${saved.model}`;
      setCurrentModel(saved.model);
      props.onModelChange?.(label);
      props.onStatus(`已切换模型 · ${label}`);
      setModelMenuOpen(false);
    } catch (err) {
      props.onStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setModelBusy(false);
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
        {debugWaiting || props.mode === "debug" ? (
          <div className="debug-banner" role="status">
            {debugWaiting
              ? "Debug：请在本机复现，把日志或现象发回。Agent 会先分析再改，并在收工前去掉 WANWU_DEBUG 插桩。"
              : "Debug 模式：先假设 → 插桩（WANWU_DEBUG）→ 等你复现 → 定点修 → 清理。不是 DAP 调试器。"}
          </div>
        ) : null}
        {active.log.map((item, i) => {
          if (item.kind === "tool") {
            return <ToolChip key={item.id ?? i} item={item} />;
          }
          if (item.kind === "status") {
            return (
              <div key={i} className="card" style={{ opacity: 0.75, fontSize: 12 }}>
                {item.text}
              </div>
            );
          }
          if (item.kind === "thought") {
            return (
              <div key={i} className="card thought">
                <MessageBody text={item.text} thinking defaultThinkOpen={busy && i === active.log.length - 1} />
              </div>
            );
          }
          if (item.kind === "assistant") {
            return (
              <div key={i} className="card assistant">
                <MessageBody text={item.text} defaultThinkOpen={busy && i === active.log.length - 1} />
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
        {availableSkills.length || attachedSkillIds.length ? (
          <div className="skill-row" aria-label="本任务附加的 Skill">
            {availableSkills
              .filter((s) => attachedSkillIds.includes(s.id))
              .map((s) => (
                <span key={s.id} className="skill-chip" title={s.summary}>
                  <span className="skill-source">{sourceLabel(s.source)}</span>
                  {s.name}
                  <button
                    type="button"
                    className="attach-remove"
                    aria-label={`移除 Skill ${s.name}`}
                    onClick={() => setAttachedSkillIds((ids) => ids.filter((id) => id !== s.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            <div className="skill-picker-wrap">
              <button
                type="button"
                className="btn"
                disabled={!props.enabled}
                onClick={() => setSkillPickerOpen((v) => !v)}
              >
                附加 Skill
              </button>
              {skillPickerOpen ? (
                <ul className="skill-menu" role="listbox" aria-label="可选 Skill">
                  {availableSkills.length === 0 ? (
                    <li className="skill-empty">工作区还没有 Skill（.wanwu/skills 或 .agents/skills）</li>
                  ) : (
                    availableSkills.map((s) => {
                      const on = attachedSkillIds.includes(s.id);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={on}
                            className={`skill-item${on ? " active" : ""}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setAttachedSkillIds((ids) =>
                                on ? ids.filter((id) => id !== s.id) : [...ids, s.id],
                              );
                            }}
                          >
                            <span>
                              {s.name}
                              <span className="mention-hint">{sourceLabel(s.source)}</span>
                            </span>
                            <span className="mention-hint">{on ? "已附加" : s.summary}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="skill-row">
            <button
              type="button"
              className="btn"
              disabled={!props.enabled}
              onClick={() => setSkillPickerOpen((v) => !v)}
            >
              附加 Skill
            </button>
            {skillPickerOpen ? (
              <div className="skill-picker-wrap">
                <p className="skill-empty">
                  把 markdown 放到 `.wanwu/skills/` 或 `.agents/skills/&lt;name&gt;/SKILL.md`，下一轮任务会按附加顺序走一遍。
                </p>
              </div>
            ) : null}
          </div>
        )}
        {props.selection && includeSelection ? (
          <div className="context-chip-row" aria-label="将随消息发送的选区">
            <span className="context-chip">
              选区 {props.selection.path}:{props.selection.startLine}–{props.selection.endLine}
              <button
                type="button"
                className="attach-remove"
                aria-label="本次不发送选区"
                onClick={() => setIncludeSelection(false)}
              >
                ×
              </button>
            </span>
          </div>
        ) : null}
        {props.mode === "plan" && planDraft && !busy ? (
          <div className="plan-build-row">
            <span className="plan-build-hint">计划已生成。确认后交给 Agent 实施。</span>
            <button
              type="button"
              className="btn primary"
              disabled={!props.enabled}
              onClick={() => {
                props.onMode?.("agent");
                void send({
                  prompt: `按已批准的计划实施，不要扩大范围。\n\n## 计划\n${planDraft}`,
                  images: [],
                  mode: "agent",
                  userLabel: "按此计划执行",
                });
              }}
            >
              按此计划执行
            </button>
          </div>
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
              ? "Agent 未就绪"
              : !props.workspaceRoot
                ? "描述任务… 未打开文件夹时，需要写文件会在桌面自动建项目"
              : busy
                ? "输入后续消息，当前回合结束后发送…"
                : props.mode === "plan"
                  ? "描述要规划的任务… Agent 会先探索再出计划，不会改文件"
                  : props.mode === "ask"
                    ? "提问… 只读代码库，不会改文件"
                    : props.mode === "debug"
                      ? "描述要复现的 bug… Agent 会先假设并插桩，等你复现后再改"
                      : "描述你的意图… 输入 @ 引用文件 / 选区 / 代码库，可粘贴或拖入图片"
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
            <span className="model-menu-wrap">
              <button
                type="button"
                className="model-link"
                disabled={busy || modelBusy}
                aria-expanded={modelMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  if (busy || modelBusy) return;
                  setModelMenuOpen((open) => {
                    const next = !open;
                    if (next) {
                      void window.wanwu.settings.get().then((s) => {
                        setCurrentModel(s.model);
                        setModelChoices(modelsForProvider(s.activeProvider, s.model));
                      });
                    }
                    return next;
                  });
                }}
                title="切换当前模型"
              >
                {modelBusy ? "切换中…" : props.modelLabel || props.mode}
              </button>
              {modelMenuOpen ? (
                <div className="model-menu" role="menu" aria-label="选择模型">
                  {modelChoices.map((model) => (
                    <button
                      key={model}
                      type="button"
                      role="menuitem"
                      className={`model-menu-item${model === currentModel ? " current" : ""}`}
                      disabled={modelBusy}
                      onClick={() => void pickModel(model)}
                    >
                      {model === currentModel ? `${model} · 当前` : model}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    className="model-menu-item"
                    onClick={() => {
                      setModelMenuOpen(false);
                      props.onOpenSettings?.();
                    }}
                  >
                    打开完整设置
                  </button>
                </div>
              ) : null}
            </span>
            {` · ${props.mode}`}
            {lastUsage ? ` · in ${lastUsage.in ?? 0}/out ${lastUsage.out ?? 0}` : ""}
            {queued ? ` · 队列 ${queued}` : ""}
            {lastCkpt ? ` · ckpt` : ""}
            {" · @ 引用 · Ctrl/Cmd+Enter"}
          </span>
          <div className="composer-actions">
            <button
              type="button"
              className="btn"
              disabled={!props.enabled || busy || !lastPrompt}
              onClick={() => {
                if (!lastPrompt) return;
                void send({ prompt: lastPrompt, images: [], userLabel: lastPrompt });
              }}
              title="重试上一条用户消息"
            >
              重试
            </button>
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
