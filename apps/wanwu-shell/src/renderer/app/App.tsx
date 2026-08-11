import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { OrbitBar, type WanwuMode } from "../layout/OrbitBar";
import { SplitHandle } from "../layout/SplitHandle";
import { loadLayout, saveLayout } from "../layout/layoutStorage";
import { FileTree } from "../files/FileTree";
import { MonacoPane, type EditorTab } from "../editor/MonacoPane";
import { AgentStudio } from "../agent/AgentStudio";
import { TerminalPane } from "../terminal/TerminalPane";
import { ConfirmModal } from "../agent/ConfirmModal";

export function App() {
  const initial = loadLayout();
  const [root, setRoot] = useState<string | null>(null);
  const [mode, setMode] = useState<WanwuMode>("agent");
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [termOpen, setTermOpen] = useState(initial.termOpen);
  const [filesW, setFilesW] = useState(initial.filesW);
  const [agentW, setAgentW] = useState(initial.agentW);
  const [termH, setTermH] = useState(initial.termH);
  const [status, setStatus] = useState("就绪 · Wanwu Lattice");
  const [perm, setPerm] = useState<{
    id: number;
    toolName: string;
    summary: string;
    risk?: string;
  } | null>(null);
  const [edit, setEdit] = useState<{ path: string; before: string; after: string } | null>(null);

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
    const offP = window.wanwu.acp.onPermission((req) => setPerm(req));
    const offE = window.wanwu.acp.onEdit((e) => setEdit(e));
    return () => {
      offP();
      offE();
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

  useEffect(() => {
    return window.wanwu.workspace.onChanged((dir) => {
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
      setStatus(`工作区 · ${dir}`);
    });
  }, []);

  const openFolder = useCallback(async () => {
    const dir = await window.wanwu.workspace.openDialog();
    if (dir) {
      // Main process disposes ACP/term on root change; renderer state via onChanged + local sync.
      setRoot(dir);
      setTabs([]);
      setActivePath(null);
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
  }, []);

  const onChange = useCallback((path: string, value: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, content: value, dirty: true } : t)),
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
        workspaceLabel={root ? root.split(/[\\/]/).filter(Boolean).slice(-2).join("/") : "未打开工作区"}
      />
      <div className="workspace">
        <aside className="panel files-panel">
          <div className="panel-title">Files</div>
          {root ? (
            <FileTree rootLabel={root} onOpenFile={(p) => void openFile(p)} activePath={activePath} />
          ) : (
            <div className="empty">
              打开一个文件夹开始。
              <br />
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
            workspaceRoot={root}
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
            <TerminalPane key={root ?? "no-ws"} active={termOpen} />
          </div>
        </>
      ) : null}
      <footer className="status">
        <span className="status-dot" />
        <span>{status}</span>
        <span style={{ marginLeft: "auto" }}>Ctrl/Cmd+I Agent · Ctrl/Cmd+` Terminal · 拖拽分栏可调</span>
      </footer>

      {perm ? (
        <ConfirmModal
          title={`权限 · ${perm.toolName}`}
          body={`${perm.summary}\nrisk=${perm.risk ?? "?"}`}
          acceptLabel="允许一次"
          rejectLabel="拒绝"
          onAccept={() => {
            void window.wanwu.acp.respondPermission(perm.id, "allow_once");
            setPerm(null);
          }}
          onReject={() => {
            void window.wanwu.acp.respondPermission(perm.id, "deny");
            setPerm(null);
          }}
        />
      ) : null}

      {edit ? (
        <ConfirmModal
          title={`Edit · ${edit.path}`}
          body={edit.after.slice(0, 4000)}
          acceptLabel="接受并写入"
          rejectLabel="拒绝"
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
      ) : null}
    </div>
  );
}
