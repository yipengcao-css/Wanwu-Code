import React, { useCallback, useEffect, useState } from "react";
import type { FileNode, WorkspaceInfo } from "@shared/ipc.js";

interface Props {
  workspace: WorkspaceInfo;
  onOpenFile: (path: string) => void;
  refreshToken: number;
}

interface CreatorState {
  parent: string;
  type: "file" | "directory";
}

export function FileTree({ workspace, onOpenFile, refreshToken }: Props): React.ReactElement {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [creator, setCreator] = useState<CreatorState | null>(null);
  const [creatorName, setCreatorName] = useState("");

  const loadRoot = useCallback(async () => {
    if (!workspace.root) {
      setRootNodes([]);
      return;
    }
    setRootNodes(await window.wanwu.fs.tree());
  }, [workspace.root]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot, refreshToken]);

  const startCreate = (type: "file" | "directory"): void => {
    setCreator({ parent: selectedDir ?? workspace.root ?? "", type });
    setCreatorName("");
  };

  const commitCreate = async (): Promise<void> => {
    if (!creator || !creatorName.trim()) {
      setCreator(null);
      return;
    }
    const sep = creator.parent.includes("\\") ? "\\" : "/";
    const path = `${creator.parent}${sep}${creatorName.trim()}`;
    await window.wanwu.fs.create(path, creator.type);
    setCreator(null);
    await loadRoot();
    if (creator.type === "file") onOpenFile(path);
  };

  if (!workspace.root) {
    return <div className="panel-empty">未打开文件夹</div>;
  }

  return (
    <div className="filetree">
      <div className="panel-header">
        <span className="panel-title">{workspace.name}</span>
        <span className="panel-actions">
          <button title="新建文件" onClick={() => startCreate("file")}>
            +文件
          </button>
          <button title="新建文件夹" onClick={() => startCreate("directory")}>
            +目录
          </button>
          <button title="刷新" onClick={() => void loadRoot()}>
            ⟳
          </button>
        </span>
      </div>
      {creator && (
        <div className="creator-row">
          <input
            autoFocus
            placeholder={creator.type === "file" ? "新文件名" : "新目录名"}
            value={creatorName}
            onChange={(e) => setCreatorName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate();
              if (e.key === "Escape") setCreator(null);
            }}
            onBlur={() => void commitCreate()}
          />
        </div>
      )}
      <div className="tree-scroll">
        {rootNodes.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            onOpenFile={onOpenFile}
            onSelectDir={setSelectedDir}
            selectedDir={selectedDir}
            onChanged={loadRoot}
          />
        ))}
      </div>
    </div>
  );
}

interface ItemProps {
  node: FileNode;
  depth: number;
  onOpenFile: (path: string) => void;
  onSelectDir: (path: string) => void;
  selectedDir: string | null;
  onChanged: () => Promise<void>;
}

function TreeItem({
  node,
  depth,
  onOpenFile,
  onSelectDir,
  selectedDir,
  onChanged,
}: ItemProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);

  const loadChildren = useCallback(async () => {
    setChildren(await window.wanwu.fs.tree(node.path));
  }, [node.path]);

  const toggle = async (): Promise<void> => {
    if (node.type === "file") {
      onOpenFile(node.path);
      return;
    }
    onSelectDir(node.path);
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) await loadChildren();
  };

  const remove = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (!window.confirm(`删除 ${node.name}?`)) return;
    await window.wanwu.fs.remove(node.path);
    await onChanged();
  };

  const commitRename = async (): Promise<void> => {
    setRenaming(false);
    if (!renameValue.trim() || renameValue === node.name) return;
    const sep = node.path.includes("\\") ? "\\" : "/";
    const parent = node.path.slice(0, node.path.lastIndexOf(sep));
    await window.wanwu.fs.rename(node.path, `${parent}${sep}${renameValue.trim()}`);
    await onChanged();
  };

  return (
    <div>
      <div
        className={`tree-row${selectedDir === node.path ? " selected" : ""}`}
        style={{ paddingLeft: depth * 14 + 8 }}
        onClick={() => void toggle()}
      >
        <span className="tree-caret">
          {node.type === "directory" ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="tree-icon">{node.type === "directory" ? "📁" : "📄"}</span>
        {renaming ? (
          <input
            autoFocus
            className="rename-input"
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={() => void commitRename()}
          />
        ) : (
          <span className="tree-label">{node.name}</span>
        )}
        <span className="tree-row-actions">
          <button
            title="重命名"
            onClick={(e) => {
              e.stopPropagation();
              setRenameValue(node.name);
              setRenaming(true);
            }}
          >
            ✎
          </button>
          <button title="删除" onClick={(e) => void remove(e)}>
            🗑
          </button>
        </span>
      </div>
      {expanded &&
        children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            onOpenFile={onOpenFile}
            onSelectDir={onSelectDir}
            selectedDir={selectedDir}
            onChanged={loadChildren}
          />
        ))}
    </div>
  );
}
