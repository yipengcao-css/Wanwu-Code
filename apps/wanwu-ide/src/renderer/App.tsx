import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentBackendInfo,
  AgentEditEvent,
  AgentMode,
  AgentPermissionEvent,
  WorkspaceInfo,
} from "@shared/ipc.js";
import type { BackendChoice } from "@shared/api.js";
import { FileTree } from "./components/FileTree.js";
import { SearchPanel } from "./components/SearchPanel.js";
import { GitPanel } from "./components/GitPanel.js";
import { EditorPane, type EditorTab } from "./components/EditorPane.js";
import { TerminalPane } from "./components/TerminalPane.js";
import { AgentPanel, type TranscriptItem } from "./components/AgentPanel.js";
import { PermissionModal } from "./components/PermissionModal.js";
import { DiffModal } from "./components/DiffModal.js";

type LeftView = "files" | "search" | "git";

function joinPath(root: string, rel: string): string {
  if (rel.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rel)) return rel;
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}${rel.replace(/\//g, sep)}`;
}

export function App(): React.ReactElement {
  const [workspace, setWorkspace] = useState<WorkspaceInfo>({ root: null, name: null });
  const [leftView, setLeftView] = useState<LeftView>("files");
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  const [agentStatus, setAgentStatus] = useState("idle");
  const [backend, setBackend] = useState<AgentBackendInfo | null>(null);
  const [backendChoice, setBackendChoice] = useState<BackendChoice>("mock");
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [mode, setMode] = useState<AgentMode>("ask");
  const [permission, setPermission] = useState<AgentPermissionEvent | null>(null);
  const [edit, setEdit] = useState<AgentEditEvent | null>(null);
  const itemId = useRef(1);

  const addItem = useCallback((item: Omit<TranscriptItem, "id">) => {
    setItems((prev) => [...prev, { ...item, id: itemId.current++ }]);
  }, []);

  useEffect(() => {
    void window.wanwu.workspace.current().then(setWorkspace);
    void window.wanwu.agent.start(backendChoice);

    const offEvent = window.wanwu.agent.onEvent((event) => {
      switch (event.kind) {
        case "message":
          addItem({ type: "message", text: event.text });
          break;
        case "tool":
          addItem({ type: "tool", text: event.detail ?? event.title, status: event.status });
          break;
        case "edit":
          setEdit(event);
          break;
        case "permission":
          setPermission(event);
          break;
        case "status":
          setAgentStatus(event.status);
          if (event.backend) setBackend(event.backend);
          if (event.status === "error" || event.status === "exited") {
            addItem({ type: "status", text: `${event.status}: ${event.detail ?? ""}` });
          }
          break;
      }
    });

    const offFs = window.wanwu.fs.onChanged(() => setRefreshToken((n) => n + 1));

    return () => {
      offEvent();
      offFs();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFile = useCallback(async (path: string) => {
    const result = await window.wanwu.fs.read(path);
    setTabs((prev) => {
      const existing = prev.find((t) => t.path === path);
      if (existing) return prev.map((t) => (t.path === path ? { ...t, content: result.content, binary: result.binary, dirty: false } : t));
      return [...prev, { path, content: result.content, binary: result.binary, dirty: false }];
    });
    setActivePath(path);
  }, []);

  const openRelative = useCallback(
    (rel: string) => {
      if (!workspace.root) return;
      void openFile(joinPath(workspace.root, rel));
    },
    [workspace.root, openFile],
  );

  const changeTab = useCallback((path: string, content: string) => {
    setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, content, dirty: true } : t)));
  }, []);

  const saveTab = useCallback(
    async (path: string) => {
      const tab = tabs.find((t) => t.path === path);
      if (!tab) return;
      await window.wanwu.fs.write(path, tab.content);
      setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, dirty: false } : t)));
    },
    [tabs],
  );

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => prev.filter((t) => t.path !== path));
      setActivePath((cur) => {
        if (cur !== path) return cur;
        const remaining = tabs.filter((t) => t.path !== path);
        return remaining.length ? remaining[remaining.length - 1]!.path : null;
      });
    },
    [tabs],
  );

  const openFolder = useCallback(async () => {
    const info = await window.wanwu.workspace.openDialog();
    setWorkspace(info);
    setRefreshToken((n) => n + 1);
    if (info.root) addItem({ type: "status", text: `已切换工作区并重建 ACP: ${info.root}` });
  }, [addItem]);

  const send = useCallback(
    (text: string) => {
      addItem({ type: "user", text: `[${mode}] ${text}` });
      void window.wanwu.agent.prompt(mode, text);
    },
    [mode, addItem],
  );

  const changeBackend = useCallback((choice: BackendChoice) => {
    setBackendChoice(choice);
    setItems([]);
    void window.wanwu.agent.start(choice);
  }, []);

  const respondPermission = useCallback((optionId: string) => {
    setPermission((cur) => {
      if (cur) void window.wanwu.agent.respondPermission(cur.id, optionId);
      return null;
    });
  }, []);

  const acceptEdit = useCallback(async () => {
    if (!edit || !workspace.root) {
      setEdit(null);
      return;
    }
    const abs = joinPath(workspace.root, edit.path);
    await window.wanwu.fs.write(abs, edit.after);
    addItem({ type: "status", text: `已应用编辑: ${edit.path}` });
    setEdit(null);
    setRefreshToken((n) => n + 1);
    void openFile(abs);
  }, [edit, workspace.root, addItem, openFile]);

  return (
    <div className="app">
      <div className="titlebar">
        <span className="brand">Wanwu Code</span>
        <span className="workspace-name">{workspace.name ?? "未打开文件夹"}</span>
        <div className="titlebar-actions">
          <button onClick={() => void openFolder()}>打开文件夹…</button>
          <button onClick={() => setShowTerminal((v) => !v)}>
            {showTerminal ? "隐藏终端" : "显示终端"}
          </button>
        </div>
      </div>

      <div className="body">
        <div className="activity-bar">
          <button className={leftView === "files" ? "active" : ""} title="资源管理器" onClick={() => setLeftView("files")}>
            🗂
          </button>
          <button className={leftView === "search" ? "active" : ""} title="搜索" onClick={() => setLeftView("search")}>
            🔍
          </button>
          <button className={leftView === "git" ? "active" : ""} title="源代码管理" onClick={() => setLeftView("git")}>
            ⑂
          </button>
        </div>

        <div className="side-panel">
          {leftView === "files" && (
            <FileTree workspace={workspace} onOpenFile={openFile} refreshToken={refreshToken} />
          )}
          {leftView === "search" && <SearchPanel workspace={workspace} onOpenFile={openRelative} />}
          {leftView === "git" && (
            <GitPanel workspace={workspace} refreshToken={refreshToken} onOpenFile={openRelative} />
          )}
        </div>

        <div className="center">
          <EditorPane
            tabs={tabs}
            activePath={activePath}
            onSelect={setActivePath}
            onClose={closeTab}
            onChange={changeTab}
            onSave={(p) => void saveTab(p)}
          />
          {showTerminal && <TerminalPane />}
        </div>

        <div className="right-panel">
          <AgentPanel
            status={agentStatus}
            backend={backend}
            backendChoice={backendChoice}
            items={items}
            mode={mode}
            onModeChange={setMode}
            onBackendChange={changeBackend}
            onSend={send}
          />
        </div>
      </div>

      {permission && <PermissionModal request={permission} onRespond={respondPermission} />}
      {edit && <DiffModal proposal={edit} onAccept={() => void acceptEdit()} onReject={() => setEdit(null)} />}
    </div>
  );
}
