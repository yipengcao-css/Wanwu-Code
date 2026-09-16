import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import type { FileNode, OpenFileResult, WorkspaceInfo } from "../shared/ipc.js";

export class WorkspaceManager {
  private root: string | null = null;
  private watcher: FSWatcher | undefined;

  constructor(private readonly onFsChanged: (path: string) => void) {}

  info(): WorkspaceInfo {
    return { root: this.root, name: this.root ? basename(this.root) : null };
  }

  async setRoot(root: string): Promise<WorkspaceInfo> {
    this.root = root;
    await this.restartWatcher();
    return this.info();
  }

  private async restartWatcher(): Promise<void> {
    await this.watcher?.close();
    this.watcher = undefined;
    if (!this.root) return;
    this.watcher = chokidar.watch(this.root, {
      ignoreInitial: true,
      depth: 6,
      ignored: (path: string) => /[\\/](node_modules|\.git)[\\/]/.test(path),
    });
    const notify = (p: string): void => this.onFsChanged(p);
    this.watcher.on("add", notify);
    this.watcher.on("unlink", notify);
    this.watcher.on("addDir", notify);
    this.watcher.on("unlinkDir", notify);
    this.watcher.on("change", notify);
  }

  /**
   * List one directory level. Hidden files and config dirs (e.g. `.wanwu`,
   * `.git`) are intentionally included so they are discoverable and editable.
   */
  async list(dirPath?: string): Promise<FileNode[]> {
    const dir = dirPath ?? this.root;
    if (!dir) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes: FileNode[] = entries.map((entry) => {
      const path = join(dir, entry.name);
      return {
        name: entry.name,
        path,
        type: entry.isDirectory() ? "directory" : "file",
      };
    });
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  async read(path: string): Promise<OpenFileResult> {
    const buf = await fs.readFile(path);
    const binary = isBinary(buf);
    return { path, content: binary ? "" : buf.toString("utf8"), binary };
  }

  async write(path: string, content: string): Promise<void> {
    await fs.writeFile(path, content, "utf8");
  }

  async create(path: string, type: "file" | "directory"): Promise<void> {
    if (type === "directory") {
      await fs.mkdir(path, { recursive: true });
    } else {
      await fs.mkdir(join(path, ".."), { recursive: true });
      await fs.writeFile(path, "", { flag: "wx" });
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath);
  }

  async remove(path: string): Promise<void> {
    await fs.rm(path, { recursive: true, force: true });
  }

  async dispose(): Promise<void> {
    await this.watcher?.close();
    this.watcher = undefined;
  }
}

/** Heuristic UTF-8/binary detection: NUL byte in the first 8KB ⇒ binary. */
function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}
