import React, { useCallback, useEffect, useState } from "react";
import type { GitStatus, WorkspaceInfo } from "@shared/ipc.js";

interface Props {
  workspace: WorkspaceInfo;
  refreshToken: number;
  onOpenFile: (relPath: string) => void;
}

export function GitPanel({ workspace, refreshToken, onOpenFile }: Props): React.ReactElement {
  const [status, setStatus] = useState<GitStatus | null>(null);

  const load = useCallback(async () => {
    setStatus(await window.wanwu.git.status());
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken, workspace.root]);

  if (!workspace.root) return <div className="panel-empty">未打开文件夹</div>;
  if (status && !status.available) return <div className="panel-empty">当前目录不是 Git 仓库</div>;

  return (
    <div className="git-panel">
      <div className="panel-header">
        <span className="panel-title">源代码管理</span>
        <span className="panel-actions">
          <button title="刷新" onClick={() => void load()}>
            ⟳
          </button>
        </span>
      </div>
      {status?.branch && <div className="git-branch">分支: {status.branch}</div>}
      <div className="git-list">
        {status?.entries.length === 0 && <div className="panel-empty">工作区干净</div>}
        {status?.entries.map((e) => (
          <div key={e.path} className="git-row" onClick={() => onOpenFile(e.path)}>
            <span className={`git-code git-${e.workingTree.trim() || e.index.trim() || "M"}`}>
              {(e.index + e.workingTree).trim() || "M"}
            </span>
            <span className="git-path">{e.path}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
