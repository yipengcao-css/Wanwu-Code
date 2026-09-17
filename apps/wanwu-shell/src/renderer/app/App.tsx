import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OrbitBar, type WanwuMode } from "../layout/OrbitBar";
import { SplitHandle } from "../layout/SplitHandle";
import { loadLayout, saveLayout } from "../layout/layoutStorage";
import { FileTree } from "../files/FileTree";
import { SearchPanel } from "../files/SearchPanel";
import { GitPanel } from "../files/GitPanel";
import { MonacoPane, type EditorTab } from "../editor/MonacoPane";
import { AgentStudio } from "../agent/AgentStudio";
import { TerminalPane } from "../terminal/TerminalPane";
import { DiffModal } from "../agent/DiffModal";
import { PermissionModal } from "../agent/PermissionModal";

type LeftView = "files" | "search" | "git";
type PermReq = { id: number; toolName: string; summary: string; risk?: string };
type EditReq = { path: string; before: string; after: string };

export function App() {
  const initial = loadLayout();
  const [root, setRoot] = useState<string | null>(null);
  const [mode, setMode] = useState<WanwuMode>("agent");
  const [leftView, setLeftView] = useState<LeftView>("files");
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [termOpen, setTermOpen] = useState(initial.termOpen);
  const [filesW, setFilesW] = useState(initial.filesW);
  const [agentW, setAgentW] = useState(initial.agentW);
  const [termH, setTermH] = useState(initial.termH);
  const [status, setStatus] = useState("就绪 · Wanwu Lattice");
  const [refreshToken, setRefreshToken] = useState(0);
  const [perm, setPerm] = useState<PermReq | null>(null);
  const [edit, setEdit] = useState<EditReq | null>(null);

  const modeRef = useRef<WanwuMode>(mode);
  const allowSession = useRef<Set<string>>(new Set());
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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
  }, []);

  useEffect(() => {
    return window.wanwu.shell.onToggleTerminal(() => setTermOpen((v) => !v));
  }, []);

  useEffect(() => {
    const offP = window.wanwu.acp.onPermission((req) => {
      // P2: "本会话始终允许" — auto-approve remembered tools without prompting.
      if (allowSession.current.has(req.toolName)) {
        void window.wanwu.acp.respondPermission(req.id, "allow_once");
        return;
      }
      setPerm(req);
    });
    const offE = window.wanwu.acp.onEdit((e) => {
      // P2: client-side mode enforcement — Ask/Plan must never write to disk.
      if (modeRef.current === "ask" || modeRef.current === "plan") {
        setStatus(`已拦截提案 · ${modeRef.current} 模式不写盘（${e.path}）`);
        return;
      }
      setEdit(e);
    });
    const offFs = window.wanwu.fs.onChanged(() => setRefreshToken((n) => n + 1));
    return () => {
      offP();
      offE();
      offFs();
    };
  }, []);

  // Renderer-local hotkeys (backup for before-input-event)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "i" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
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

  const openFolder = useCallback(async () => {
    const dir = await window.wanwu.workspace.openDialog();
    if (dir) {
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
      setRefreshToken((n) => n + 1);
      setStatus(`工作区 · ${dir}`);
      await window.wanwu.acp.dispose();
    }
  }, []);

  const openFile = useCallback(async (rel: string) => {
    const res = await window.wanwu.fs.read(rel);
    setTabs((prev) => {
      if (prev.some((t) => t.path === rel)) {
        return prev.map((t) =>
          t.path === rel ? { ...t, content: res.content, binary: res.binary, dirty: false } : t,
        );
      }
      return [...prev, { path: rel, content: res.content, dirty: false, binary: res.binary }];
    });
    setActivePath(rel);
  }, []);

  const onChange = useCallback((path: string, value: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content: value, dirty: true } : t)),
    );
  }, []);

  const saveActive = useCallback(async () => {
    if (!activeTab || activeTab.binary) return;
    await window.wanwu.fs.write(activeTab.path, activeTab.content);
    setTabs((prev) =>
      prev.map((t) => (t.path === activeTab.path ? { ...t, dirty: false } : t)),
    );
    setStatus(`已保存 · ${activeTab.path}`);
  }, [activeTab]);

  const respondPerm = useCallback(
    (optionId: string) => {
      if (!perm) return;
      if (optionId === "allow_always") allowSession.current.add(perm.toolName);
      void window.wanwu.acp.respondPermission(perm.id, optionId);
      setPerm(null);
    },
    [perm],
  );

  const acceptEdit = useCallback(async () => {
    if (!edit) return;
    await window.wanwu.fs.write(edit.path, edit.after);
    setTabs((prev) => {
      const others = prev.filter((t) => t.path !== edit.path);
      return [...others, { path: edit.path, content: edit.after, dirty: false, binary: false }];
    });
    setActivePath(edit.path);
    setStatus(`已接受编辑 · ${edit.path}`);
    setEdit(null);
    setRefreshToken((n) => n + 1);
  }, [edit]);

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
        workspaceLabel={root ? root.split(/[\\/]/).filter(Boolean).slice(-2).join("/") : "未打开工作区"}
      />
      <div className="workspace">
        <aside className="panel files-panel">
          <div className="left-switch">
            <button type="button" className={leftView === "files" ? "active" : ""} onClick={() => setLeftView("files")}>
              资源
            </button>
            <button type="button" className={leftView === "search" ? "active" : ""} onClick={() => setLeftView("search")}>
              搜索
            </button>
            <button type="button" className={leftView === "git" ? "active" : ""} onClick={() => setLeftView("git")}>
              源代码
            </button>
          </div>
          {!root ? (
            <div className="empty">
              打开一个文件夹开始。
              <br />
              <button className="btn primary" style={{ marginTop: 12 }} onClick={() => void openFolder()}>
                打开文件夹
              </button>
            </div>
          ) : leftView === "files" ? (
            <FileTree rootLabel={root} onOpenFile={(p) => void openFile(p)} activePath={activePath} refreshToken={refreshToken} />
          ) : leftView === "search" ? (
            <SearchPanel onOpenFile={(p) => void openFile(p)} />
          ) : (
            <GitPanel refreshToken={refreshToken} onOpenFile={(p) => void openFile(p)} onStatus={setStatus} />
          )}
        </aside>
        <SplitHandle
          orientation="vertical"
          onDrag={(d) => setFilesW((w) => Math.min(420, Math.max(160, w + d)))}
        />
        <section className="editor-pane">
          <MonacoPane
            tabs={tabs}
            activePath={activePath}
            onSelect={setActivePath}
            onChange={onChange}
            onClose={(p) => {
              setTabs((prev) => prev.filter((t) => t.path !== p));
              if (activePath === p) setActivePath(null);
            }}
          />
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
            activePath={activePath}
            selectionHint={activeTab?.content.slice(0, 500)}
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
            <TerminalPane active={termOpen} />
          </div>
        </>
      ) : null}
      <footer className="status">
        <span className="status-dot" />
        <span>{status}</span>
        <span style={{ marginLeft: "auto" }}>Ctrl/Cmd+I Agent · Ctrl/Cmd+` Terminal · 拖拽分栏可调</span>
      </footer>

      {perm ? (
        <PermissionModal
          toolName={perm.toolName}
          summary={perm.summary}
          risk={perm.risk}
          onRespond={respondPerm}
        />
      ) : null}

      {edit ? (
        <DiffModal
          path={edit.path}
          before={edit.before}
          after={edit.after}
          onAccept={() => void acceptEdit()}
          onReject={() => setEdit(null)}
        />
      ) : null}
    </div>
  );
}
