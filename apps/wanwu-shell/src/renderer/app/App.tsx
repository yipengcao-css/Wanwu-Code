import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OrbitBar, type WanwuMode } from "../layout/OrbitBar";
import { SplitHandle } from "../layout/SplitHandle";
import { loadLayout, saveLayout } from "../layout/layoutStorage";
import { FileTree } from "../files/FileTree";
import { SearchPanel } from "../files/SearchPanel";
import type { CursorFocus } from "../editor/editorContext";
import { formatPrimaryEditor } from "../editor/editorActions";
import { rememberViewed } from "../editor/recentFiles";
import {
  RECENT_WORKSPACES_KEY,
  readRecentWorkspaces,
  rememberWorkspace,
  workspaceLabel,
} from "../workspace/recentWorkspaces";
import type { EditorSelection, EditorTab, MarkerDiag } from "../editor/MonacoPane";
import { AgentStudio } from "../agent/AgentStudio";
import { ProblemsPanel } from "../problems/ProblemsPanel";
import { mergeDiagnostics } from "../../shared/problems";
import { SourceControl } from "../scm/SourceControl";
import { TerminalPane } from "../terminal/TerminalPane";
import { applyHunkChoices, diffHunks } from "../agent/diffHunks";
import { DiffReview } from "../agent/DiffReview";
import { ConfirmModal } from "../agent/ConfirmModal";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { CommandPalette } from "../palette/CommandPalette";

const MonacoPane = lazy(() =>
  import("../editor/MonacoPane").then((m) => ({ default: m.MonacoPane })),
);

function riskLabel(risk?: string): string {
  if (risk === "high") return "高";
  if (risk === "medium") return "中";
  if (risk === "low") return "低";
  return "未知";
}

/** Flatten LSP markers into a compact summary. Lines and columns are 1-based, like the editor and Read. */
function formatDiagnosticsSummary(diagnostics: Record<string, MarkerDiag[]>): string {
  const lines: string[] = [];
  for (const [path, diags] of Object.entries(diagnostics)) {
    for (const d of diags) {
      if (d.severity !== "error" && d.severity !== "warning") continue;
      lines.push(`${path}:${d.startLine + 1}:${d.startCharacter + 1} ${d.severity} ${d.message}`);
      if (lines.length >= 50) break;
    }
    if (lines.length >= 50) break;
  }
  return lines.length ? lines.join("\n") : "(no diagnostics)";
}

export function App() {
  const initial = loadLayout();
  const [root, setRoot] = useState<string | null>(null);
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>(() => {
    try {
      return readRecentWorkspaces(localStorage.getItem(RECENT_WORKSPACES_KEY));
    } catch {
      return [];
    }
  });
  const [mode, setMode] = useState<WanwuMode>("agent");
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, MarkerDiag[]>>({});
  const [scanned, setScanned] = useState<Record<string, MarkerDiag[]>>({});
  const [scanningProblems, setScanningProblems] = useState(false);
  const [problemNote, setProblemNote] = useState<string | null>(null);
  const mergedDiagnostics = useMemo(
    () => mergeDiagnostics(diagnostics, scanned),
    [diagnostics, scanned],
  );
  const [termOpen, setTermOpen] = useState(initial.termOpen);
  const [sideTab, setSideTab] = useState<"files" | "search" | "scm" | "problems">("files");
  const [revealDir, setRevealDir] = useState<string | null>(null);
  const [splitPath, setSplitPath] = useState<string | null>(null);
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
  const [edits, setEdits] = useState<Array<{ path: string; before: string; after: string }>>([]);
  const [acceptedHunks, setAcceptedHunks] = useState<Record<string, boolean>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const [cursorFocus, setCursorFocus] = useState<CursorFocus | null>(null);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [addSelectionTick, setAddSelectionTick] = useState(0);
  const [modelLabel, setModelLabel] = useState("");

  useEffect(() => {
    setRecentFiles((prev) => rememberViewed(prev, activePath));
  }, [activePath]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) ?? null,
    [tabs, activePath],
  );
  const review = edits[0];
  const reviewHunks = useMemo(
    () => (review ? diffHunks(review.before, review.after) : []),
    [review],
  );
  const onToggleHunk = useCallback((id: string, accept: boolean) => {
    setAcceptedHunks((prev) => ({ ...prev, [id]: accept }));
  }, []);
  const inlineReview = useMemo(() => {
    if (!review || activeTab?.path !== review.path || activeTab.content !== review.before) return null;
    return { hunks: reviewHunks, accepted: acceptedHunks, onToggle: onToggleHunk };
  }, [review, activeTab, reviewHunks, acceptedHunks, onToggleHunk]);

  useEffect(() => {
    if (!review) return;
    const next: Record<string, boolean> = {};
    for (const hunk of diffHunks(review.before, review.after)) next[hunk.id] = true;
    setAcceptedHunks(next);
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === review.path);
      if (!existing) return [...prev, { path: review.path, content: review.before, dirty: false }];
      if (!existing.dirty && existing.content !== review.before) {
        return prev.map((t) =>
          t.path === review.path ? { ...t, content: review.before, dirty: false } : t,
        );
      }
      return prev;
    });
    setActivePath(review.path);
  }, [review]);

  useEffect(() => {
    saveLayout({ filesW, agentW, termH, termOpen });
  }, [filesW, agentW, termH, termOpen]);

  useEffect(() => {
    if (!root) return;
    try {
      const next = rememberWorkspace(localStorage.getItem(RECENT_WORKSPACES_KEY), root);
      localStorage.setItem(RECENT_WORKSPACES_KEY, next);
      setRecentWorkspaces(readRecentWorkspaces(next));
    } catch {
      /* storage unavailable */
    }
  }, [root]);

  useEffect(() => {
    if (!recentWorkspaces.length) return;
    let cancelled = false;
    void window.wanwu.workspace.existing(recentWorkspaces).then((live) => {
      if (cancelled) return;
      if (live.length === recentWorkspaces.length && live.every((dir, i) => dir === recentWorkspaces[i])) return;
      try {
        localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(live));
      } catch {
        /* storage unavailable */
      }
      setRecentWorkspaces(live);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [recentWorkspaces]);

  useEffect(() => {
    void window.wanwu.workspace.getRoot().then((r) => {
      if (r) setRoot(r);
    });
    void window.wanwu.settings.get().then((s) => {
      setHasApiKey(s.hasApiKey);
      setModelLabel(`${s.activeProvider}/${s.model}`);
    });
  }, []);

  useEffect(() => {
    return window.wanwu.shell.onToggleTerminal(() => setTermOpen((v) => !v));
  }, []);

  useEffect(() => {
    const offP = window.wanwu.acp.onPermission((req) => setPerm(req));
    const offE = window.wanwu.acp.onEdit((e) =>
      setEdits((prev) => {
        const rest = prev.filter((x) => x.path !== e.path);
        if (e.before === e.after) return rest;
        return [...rest, e];
      }),
    );
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
    return window.wanwu.fs.onChanged((rel) => {
      const norm = rel.replace(/\\/g, "/");
      setTabs((prev) => {
        const hit = prev.find((t) => t.path === norm || t.path === rel);
        if (!hit || hit.dirty) return prev;
        void window.wanwu.fs.read(hit.path).then((content) => {
          setTabs((cur) =>
            cur.map((t) => (t.path === hit.path && !t.dirty ? { ...t, content } : t)),
          );
        });
        return prev;
      });
    });
  }, []);

  useEffect(() => {
    return window.wanwu.workspace.onChanged((dir) => {
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
      setSelection(null);
      setRecentFiles([]);
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

  useEffect(() => {
    if (!root) {
      setScanned({});
      setProblemNote(null);
      setScanningProblems(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      setScanningProblems(true);
      void window.wanwu.problems
        .scan()
        .then((result) => {
          if (cancelled) return;
          const next: Record<string, MarkerDiag[]> = {};
          for (const row of result.problems) {
            const { path: file, ...diag } = row;
            (next[file] ??= []).push(diag);
          }
          setScanned(next);
          setProblemNote(result.note || null);
        })
        .catch(() => {
          if (!cancelled) setProblemNote("工作区扫描没有完成。");
        })
        .finally(() => {
          if (!cancelled) setScanningProblems(false);
        });
    };
    timer = setTimeout(run, 400);
    const off = window.wanwu.fs.onChanged(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 1200);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      off();
    };
  }, [root]);

  const openRecent = useCallback(async (dir: string) => {
    const live = await window.wanwu.workspace.existing([dir]);
    if (!live.includes(dir)) {
      setRecentWorkspaces((prev) => {
        const next = prev.filter((item) => item !== dir);
        try {
          localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(next));
        } catch {
          /* storage unavailable */
        }
        return next;
      });
      setStatus("这个文件夹已经不在了");
      return;
    }
    const opened = await window.wanwu.workspace.openPath(dir);
    setRoot(opened);
    setTabs([]);
    setActivePath(null);
    setSelection(null);
    setRecentFiles([]);
    setDiagnostics({});
    void window.wanwu.lsp.dispose();
    setStatus(`工作区 · ${opened}`);
  }, []);

  const openFolder = useCallback(async () => {
    const dir = await window.wanwu.workspace.openDialog();
    if (dir) {
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
      setSelection(null);
      setRecentFiles([]);
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
    const formatted = await formatPrimaryEditor();
    const content = formatted ?? activeTab.content;
    await window.wanwu.fs.write(activeTab.path, content);
    setTabs((prev) =>
      prev.map((t) => (t.path === activeTab.path ? { ...t, content, dirty: false } : t)),
    );
    setStatus(`已保存 · ${activeTab.path}`);
  }, [activeTab]);

  const showEditor = tabs.length > 0 || Boolean(review);

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
        onOpenRecent={(dir) => void openRecent(dir)}
        recentWorkspaces={recentWorkspaces}
        onToggleTerminal={() => setTermOpen((v) => !v)}
        onSave={() => void saveActive()}
        onOpenSettings={() => setSettingsOpen(true)}
        workspaceLabel={root ? workspaceLabel(root) : "未打开工作区"}
      />
      <div className={`workspace${showEditor ? "" : " no-editor"}`}>
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
            <button
              type="button"
              className="btn"
              style={{ padding: "1px 8px", fontSize: 11, opacity: sideTab === "scm" ? 1 : 0.55 }}
              onClick={() => setSideTab("scm")}
            >
              更改
            </button>
            <button
              type="button"
              className="btn"
              style={{ padding: "1px 8px", fontSize: 11, opacity: sideTab === "problems" ? 1 : 0.55 }}
              onClick={() => setSideTab("problems")}
            >
              问题
            </button>
          </div>
          {root ? (
            sideTab === "files" ? (
              <FileTree
                rootLabel={root}
                onOpenFile={(p) => void openFile(p)}
                activePath={activePath}
                revealDir={revealDir}
              />
            ) : sideTab === "search" ? (
              <SearchPanel
                onOpenFile={(p, line) => {
                  void openFile(p);
                  if (line) setGotoLine({ path: p, line, n: ++gotoSeq.current });
                }}
              />
            ) : sideTab === "scm" ? (
              <SourceControl rootLabel={root} onOpenFile={(p) => void openFile(p)} />
            ) : (
              <ProblemsPanel
                diagnostics={mergedDiagnostics}
                scanning={scanningProblems}
                note={problemNote}
                onOpen={(p, line) => {
                  void openFile(p);
                  setGotoLine({ path: p, line, n: ++gotoSeq.current });
                }}
              />
            )
          ) : (
            <div className="empty">
              <p>尚未打开工作区。也可以直接在右侧描述任务；需要写文件时会在桌面自动创建项目文件夹。</p>
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void openFolder()}>
                打开文件夹
              </button>
              {recentWorkspaces.length > 0 ? (
                <ul className="recent-list">
                  {recentWorkspaces.map((dir) => (
                    <li key={dir}>
                      <button type="button" className="btn" onClick={() => void openRecent(dir)}>
                        {workspaceLabel(dir)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </aside>
        <SplitHandle
          orientation="vertical"
          onDrag={(d) => setFilesW((w) => Math.min(420, Math.max(160, w + d)))}
        />
        {showEditor ? (
        <section className="editor-pane">
          {review ? (
            <DiffReview
              path={review.path}
              hunks={reviewHunks}
              accepted={acceptedHunks}
              queueLabel={edits.length > 1 ? `1/${edits.length}` : undefined}
              onToggle={onToggleHunk}
              onAccept={() => {
                const merged = applyHunkChoices(review.before, reviewHunks, acceptedHunks);
                void (async () => {
                  await window.wanwu.fs.write(review.path, merged);
                  setTabs((prev) => {
                    const others = prev.filter((t) => t.path !== review.path);
                    return [...others, { path: review.path, content: merged, dirty: false }];
                  });
                  setActivePath(review.path);
                  setEdits((prev) => prev.slice(1));
                  setStatus(`已写入接受的代码块 · ${review.path}`);
                })();
              }}
              onReject={() => setEdits((prev) => prev.slice(1))}
              onAcceptAll={
                edits.length > 1
                  ? () => {
                      void (async () => {
                        for (const edit of edits) {
                          await window.wanwu.fs.write(edit.path, edit.after);
                          setTabs((prev) => {
                            const others = prev.filter((t) => t.path !== edit.path);
                            return [...others, { path: edit.path, content: edit.after, dirty: false }];
                          });
                        }
                        setActivePath(edits[edits.length - 1]?.path ?? null);
                        setEdits([]);
                        setStatus(`已接受 ${edits.length} 个文件`);
                      })();
                    }
                  : undefined
              }
              onRejectAll={edits.length > 1 ? () => setEdits([]) : undefined}
            />
          ) : null}
          {tabs.length > 0 ? (
            <Suspense fallback={<div className="empty">加载编辑器…</div>}>
              <MonacoPane
                tabs={tabs}
                activePath={activePath}
                diagnostics={mergedDiagnostics}
                gotoLine={gotoLine}
                onSelect={setActivePath}
                onChange={onChange}
                onSelectionChange={setSelection}
                onCursorContext={setCursorFocus}
                onOpenDir={(dir) => {
                  setSideTab("files");
                  setRevealDir(dir);
                }}
                review={inlineReview}
                splitPath={splitPath}
                onToggleSplit={() =>
                  setSplitPath((prev) => (prev ? null : activePath))
                }
                onClose={(p) => {
                  setTabs((prev) => prev.filter((t) => t.path !== p));
                  if (splitPath === p) setSplitPath(null);
                  if (activePath === p) {
                    setActivePath(null);
                    setSelection(null);
                  }
                  setDiagnostics((prev) => {
                    const next = { ...prev };
                    delete next[p];
                    return next;
                  });
                  void window.wanwu.lsp.didClose(p);
                }}
              />
            </Suspense>
          ) : null}
        </section>
        ) : null}
        {showEditor ? (
        <SplitHandle
          orientation="vertical"
          onDrag={(d) => setAgentW((w) => Math.min(640, Math.max(300, w - d)))}
        />
        ) : null}
        <aside className="panel agent">
          <div className="panel-title">Agent Studio</div>
          <AgentStudio
            mode={mode}
            enabled
            workspaceRoot={root}
            activePath={activePath}
            openTabs={tabs.map((t) => t.path)}
            recentFiles={recentFiles}
            selection={selection}
            cursor={cursorFocus}
            addSelectionTick={addSelectionTick}
            modelLabel={modelLabel}
            diagnosticsSummary={formatDiagnosticsSummary(mergedDiagnostics)}
            terminalSummary={termTail || undefined}
            onStatus={setStatus}
            onMode={setMode}
            onOpenSettings={() => setSettingsOpen(true)}
            onModelChange={(label) => {
              setModelLabel(label);
              setStatus(`已切换模型 · ${label}`);
            }}
            onOpenFile={(p, line) => {
              void openFile(p)
                .then(() => {
                  if (line) setGotoLine({ path: p, line, n: ++gotoSeq.current });
                  setStatus(line ? `已打开 ${p}:${line}` : `已打开 ${p}`);
                })
                .catch((err: unknown) => {
                  setStatus(err instanceof Error ? err.message : String(err));
                });
            }}
            onApplyCode={(code, mode) => {
              const tab = tabs.find((t) => t.path === activePath);
              if (!tab || !activePath) {
                setStatus("先打开一个文件，再把代码块插进去");
                return;
              }
              if (mode === "replace") {
                onChange(activePath, code);
                setStatus(`已用代码块替换 ${activePath}`);
                return;
              }
              const lines = tab.content.split("\n");
              if (selection && selection.path === activePath && selection.text) {
                const count = selection.endLine - selection.startLine + 1;
                lines.splice(Math.max(0, selection.startLine - 1), count, code);
                onChange(activePath, lines.join("\n"));
                setStatus(`已用代码块替换选区 · ${activePath}`);
                return;
              }
              const at = cursorFocus?.path === activePath ? cursorFocus.line : lines.length + 1;
              lines.splice(Math.max(0, at - 1), 0, code);
              onChange(activePath, lines.join("\n"));
              setStatus(`已插入到 ${activePath}:${at}`);
            }}
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
          F1 命令面板 · Ctrl/Cmd+, 设置 · Ctrl/Cmd+I Agent · Ctrl/Cmd+` 终端 · Ctrl+K 内联编辑/终端命令 · Tab 接受预测 · Alt+→ 接受一词
        </span>
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setHasApiKey(s.hasApiKey);
          setModelLabel(`${s.activeProvider}/${s.model}`);
          setStatus(`已更新模型 · ${s.activeProvider}/${s.model}`);
        }}
      />

      {perm ? (
        <ConfirmModal
          title={`权限 · ${perm.toolName}`}
          body={`${perm.summary}\n风险：${riskLabel(perm.risk)}`}
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
            id: "add-selection",
            title: "将编辑器选区加入 Agent",
            hint: "选区",
            run: () => setAddSelectionTick((n) => n + 1),
          },
          {
            id: "term-ask",
            title: "终端 Ctrl+K 生成命令",
            hint: "Ctrl+K",
            run: () => setTermOpen(true),
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
          ...(["ask", "plan", "agent", "verify", "debug"] as const).map((m) => ({
            id: `mode-${m}`,
            title: `切换到 ${m} 模式`,
            run: () => setMode(m),
          })),
        ]}
      />
    </div>
  );
}
