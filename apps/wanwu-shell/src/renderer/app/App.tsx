import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OrbitBar, type WanwuMode } from "../layout/OrbitBar";
import { SplitHandle } from "../layout/SplitHandle";
import { loadLayout, saveLayout } from "../layout/layoutStorage";
import { FileTree } from "../files/FileTree";
import { SearchPanel } from "../files/SearchPanel";
import type { EditorTab, MarkerDiag } from "../editor/MonacoPane";
import { AgentStudio } from "../agent/AgentStudio";
import { TerminalPane } from "../terminal/TerminalPane";
import { ConfirmModal } from "../agent/ConfirmModal";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { CommandPalette } from "../palette/CommandPalette";
import { WelcomeGate } from "../onboarding/WelcomeGate";

const MonacoPane = lazy(() =>
  import("../editor/MonacoPane").then((m) => ({ default: m.MonacoPane })),
);
const DiffReview = lazy(() =>
  import("../agent/DiffReview").then((m) => ({ default: m.DiffReview })),
);

/** Flatten LSP markers into a compact summary for the agent (@diagnostics). */
function formatDiagnosticsSummary(diagnostics: Record<string, MarkerDiag[]>): string {
  const lines: string[] = [];
  for (const [path, diags] of Object.entries(diagnostics)) {
    for (const d of diags) {
      if (d.severity !== "error" && d.severity !== "warning") continue;
      lines.push(`${path}:${d.startLine}:${d.startCharacter} ${d.severity} ${d.message}`);
      if (lines.length >= 50) break;
    }
    if (lines.length >= 50) break;
  }
  return lines.length ? lines.join("\n") : "(no diagnostics)";
}

export function App() {
  const initial = loadLayout();
  const [root, setRoot] = useState<string | null>(null);
  const [mode, setMode] = useState<WanwuMode>("agent");
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, MarkerDiag[]>>({});
  const [termOpen, setTermOpen] = useState(initial.termOpen);
  const [sideTab, setSideTab] = useState<"files" | "search">("files");
  const [gotoLine, setGotoLine] = useState<{ path: string; line: number; n: number } | null>(null);
  const gotoSeq = useRef(0);
  const [filesW, setFilesW] = useState(initial.filesW);
  const [agentW, setAgentW] = useState(initial.agentW);
  const [termH, setTermH] = useState(initial.termH);
  const [status, setStatus] = useState("就绪 · Wanwu Lattice");
  const [termTail, setTermTail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const changeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [perm, setPerm] = useState<{
    id: number;
    toolName: string;
    summary: string;
    risk?: string;
  } | null>(null);
  const [edit, setEdit] = useState<{ path: string; before: string; after: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );

  useEffect(() => {
    saveLayout({ filesW, agentW, termH, termOpen });
  }, [filesW, agentW, termH, termOpen]);

  useEffect(() => {
    void window.wanwu.workspace.getRoot().then((r) => {
      if (r) setRoot(r);
    });
    void window.wanwu.settings.get().then((s) => setHasApiKey(s.hasApiKey));
  }, []);

  useEffect(() => {
    return window.wanwu.shell.onToggleTerminal(() => setTermOpen((v) => !v));
  }, []);

  useEffect(() => {
    const offP = window.wanwu.acp.onPermission((req) => setPerm(req));
    const offE = window.wanwu.acp.onEdit((e) => setEdit(e));
    return () => {
      offP();
      offE();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1" || ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "i" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
      }
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
      if (e.key === "`") {
        e.preventDefault();
        setTermOpen((v) => !v);
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    return window.wanwu.workspace.onChanged((dir) => {
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
      setDiagnostics({});
      void window.wanwu.lsp.dispose();
      setStatus(`工作区 · ${dir}`);
    });
  }, []);

  useEffect(() => {
    const offDiag = window.wanwu.lsp.onDiagnostics((payload) => {
      setDiagnostics((prev) => ({ ...prev, [payload.path]: payload.diagnostics }));
      const errs = payload.diagnostics.filter((d) => d.severity === "error").length;
      if (errs > 0) {
        setStatus(`LSP · ${payload.path} · ${errs} error(s)`);
      }
    });
    const offErr = window.wanwu.lsp.onError((text) => {
      setStatus(text.slice(0, 120));
    });
    return () => {
      offDiag();
      offErr();
    };
  }, []);

  const openFolder = useCallback(async () => {
    const dir = await window.wanwu.workspace.openDialog();
    if (dir) {
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
      setDiagnostics({});
      void window.wanwu.lsp.dispose();
      setStatus(`工作区 · ${dir}`);
    }
  }, []);

  const openFile = useCallback(async (rel: string) => {
    const content = await window.wanwu.fs.read(rel);
    setTabs((prev) => {
      if (prev.some((t) => t.path === rel)) return prev;
      return [...prev, { path: rel, content, dirty: false }];
    });
    setActivePath(rel);
    // Main side filters to languages with a configured server (hasLspMapping).
    void window.wanwu.lsp.didOpen(rel, content);
  }, []);

  const onChange = useCallback((path: string, value: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content: value, dirty: true } : t)),
    );
    const prev = changeTimers.current.get(path);
    if (prev) clearTimeout(prev);
    changeTimers.current.set(
      path,
      setTimeout(() => {
        void window.wanwu.lsp.didChange(path, value);
        changeTimers.current.delete(path);
      }, 300),
    );
  }, []);

  const saveActive = useCallback(async () => {
    if (!activeTab) return;
    await window.wanwu.fs.write(activeTab.path, activeTab.content);
    setTabs((prev) =>
      prev.map((t) => (t.path === activeTab.path ? { ...t, dirty: false } : t)),
    );
    setStatus(`已保存 · ${activeTab.path}`);
  }, [activeTab]);

  const style = {
    ["--ww-files-w" as string]: `${filesW}px`,
    ["--ww-agent-w" as string]: `${agentW}px`,
    ["--ww-term-h" as string]: `${termH}px`,
  } as CSSProperties;

  return (
    <div className={`app${termOpen ? " term-open" : ""}`} style={style}>
      <OrbitBar
        mode={mode}
        onMode={setMode}
        onOpenFolder={() => void openFolder()}
        onToggleTerminal={() => setTermOpen((v) => !v)}
        onSave={() => void saveActive()}
        onOpenSettings={() => setSettingsOpen(true)}
        workspaceLabel={root ? root.split(/[\\/]/).filter(Boolean).slice(-2).join("/") : "未打开工作区"}
      />
      <div className="workspace">
        <aside className="panel files-panel">
          <div className="panel-title" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ padding: "1px 8px", fontSize: 11, opacity: sideTab === "files" ? 1 : 0.55 }}
              onClick={() => setSideTab("files")}
            >
              文件
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: "1px 8px", fontSize: 11, opacity: sideTab === "search" ? 1 : 0.55 }}
              onClick={() => setSideTab("search")}
            >
              搜索
            </button>
          </div>
          {root ? (
            sideTab === "files" ? (
              <FileTree rootLabel={root} onOpenFile={(p) => void openFile(p)} activePath={activePath} />
            ) : (
              <SearchPanel
                onOpenFile={(p, line) => {
                  void openFile(p);
                  if (line) setGotoLine({ path: p, line, n: ++gotoSeq.current });
                }}
              />
            )
          ) : (
            <div className="empty">
              <p>尚未打开工作区。</p>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void openFolder()}>
                打开文件夹
              </button>
            </div>
          )}
        </aside>
        <SplitHandle
          orientation="vertical"
          onDrag={(d) => setFilesW((w) => Math.min(420, Math.max(160, w + d)))}
        />
        <section className="editor-pane">
          {root ? (
            <Suspense fallback={<div className="empty">加载编辑器…</div>}>
              <MonacoPane
                tabs={tabs}
                activePath={activePath}
                diagnostics={diagnostics}
                gotoLine={gotoLine}
                onSelect={setActivePath}
                onChange={onChange}
                onClose={(p) => {
                  setTabs((prev) => prev.filter((t) => t.path !== p));
                  if (activePath === p) setActivePath(null);
                  setDiagnostics((prev) => {
                    const next = { ...prev };
                    delete next[p];
                    return next;
                  });
                  void window.wanwu.lsp.didClose(p);
                }}
              />
            </Suspense>
          ) : (
            <WelcomeGate
              onOpenFolder={() => void openFolder()}
              onOpenSettings={() => setSettingsOpen(true)}
              hasApiKey={hasApiKey}
            />
          )}
        </section>
        <SplitHandle
          orientation="vertical"
          onDrag={(d) => setAgentW((w) => Math.min(640, Math.max(300, w - d)))}
        />
        <aside className="panel agent">
          <div className="panel-title">Agent Studio</div>
          <AgentStudio
            mode={mode}
            enabled={Boolean(root)}
            workspaceRoot={root}
            activePath={activePath}
            selectionHint={activeTab?.content.slice(0, 500)}
            diagnosticsSummary={formatDiagnosticsSummary(diagnostics)}
            terminalSummary={termTail || undefined}
            onStatus={setStatus}
          />
        </aside>
      </div>
      {termOpen ? (
        <>
          <SplitHandle
            orientation="horizontal"
            onDrag={(d) => setTermH((h) => Math.min(480, Math.max(120, h - d)))}
          />
          <div className="terminal-drawer">
            <TerminalPane
              key={root ?? "no-ws"}
              active={termOpen}
              onOutput={(data) => {
                const clean = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
                if (!clean) return;
                setTermTail((prev) => `${prev}${clean}`.slice(-4000));
              }}
            />
          </div>
        </>
      ) : null}
      <footer className="status">
        <span className={`status-dot${hasApiKey === false ? " warn" : ""}`} />
        <span>{status}</span>
        <span className="status-hotkeys">
          F1 命令面板 · Ctrl/Cmd+, 设置 · Ctrl/Cmd+I Agent · Ctrl/Cmd+` 终端 · Ctrl+K 内联编辑
        </span>
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setHasApiKey(s.hasApiKey);
          setStatus(`已更新模型 · ${s.activeProvider}/${s.model}`);
        }}
      />

      {perm ? (
        <ConfirmModal
          title={`权限 · ${perm.toolName}`}
          body={`${perm.summary}\nrisk=${perm.risk ?? "?"}`}
          acceptLabel="允许一次"
          sessionLabel="本会话允许"
          rejectLabel="拒绝"
          onAccept={() => {
            void window.wanwu.acp.respondPermission(perm.id, "allow-once");
            setPerm(null);
          }}
          onSession={() => {
            void window.wanwu.acp.respondPermission(perm.id, "allow-session");
            setPerm(null);
          }}
          onReject={() => {
            void window.wanwu.acp.respondPermission(perm.id, "deny");
            setPerm(null);
          }}
        />
      ) : null}

      {edit ? (
        <Suspense fallback={null}>
          <DiffReview
            path={edit.path}
            before={edit.before}
            after={edit.after}
            onAccept={() => {
              void (async () => {
                await window.wanwu.fs.write(edit.path, edit.after);
                setTabs((prev) => {
                  const others = prev.filter((t) => t.path !== edit.path);
                  return [...others, { path: edit.path, content: edit.after, dirty: false }];
                });
                setActivePath(edit.path);
                setEdit(null);
                setStatus(`已接受编辑 · ${edit.path}`);
              })();
            }}
            onReject={() => setEdit(null)}
          />
        </Suspense>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={[
          { id: "open-folder", title: "打开文件夹", run: () => void openFolder() },
          { id: "save", title: "保存当前文件", hint: "Ctrl+S", run: () => void saveActive() },
          {
            id: "toggle-terminal",
            title: "开关终端",
            hint: "Ctrl+`",
            run: () => setTermOpen((v) => !v),
          },
          { id: "settings", title: "设置", hint: "Ctrl+,", run: () => setSettingsOpen(true) },
          {
            id: "focus-agent",
            title: "聚焦 Agent 输入",
            hint: "Ctrl+I",
            run: () => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus(),
          },
          {
            id: "side-search",
            title: "全局搜索",
            run: () => setSideTab("search"),
          },
          {
            id: "side-files",
            title: "文件树",
            run: () => setSideTab("files"),
          },
          ...(["ask", "plan", "agent", "verify"] as const).map((m) => ({
            id: `mode-${m}`,
            title: `切换到 ${m} 模式`,
            run: () => setMode(m),
          })),
        ]}
      />
    </div>
  );
}
