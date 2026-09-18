import { readdirSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

/** Directories we never place recursive watches on (huge / irrelevant). */
const SKIP = new Set(["node_modules", ".git", "dist", "out", "code-oss", ".turbo", "coverage"]);
const IGNORE_RE = /(^|[\\/])(node_modules|\.git|dist|out|coverage|\.turbo)([\\/]|$)/;

/**
 * Watch a workspace and invoke `onChange` (debounced) on disk changes so the
 * renderer can refresh the tree / git view.
 *
 * Instead of one recursive watch on the root (which would place inotify watches
 * across node_modules/.git and can exhaust `fs.inotify.max_user_watches` or add
 * heavy overhead), we watch each top-level entry recursively — skipping heavy
 * dirs — plus the root shallowly for top-level add/remove. Native fs.watch
 * (recursive supported on Linux since Node 20, and macOS/Windows).
 */
export class WorkspaceWatcher {
  private watchers: FSWatcher[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly onChange: () => void) {}

  start(root: string): void {
    this.stop();
    const cb = (_event: string, filename: string | Buffer | null): void => {
      const name = filename?.toString() ?? "";
      if (name && IGNORE_RE.test(name)) return;
      this.schedule();
    };

    // Root, shallow: catches top-level file edits and add/remove of entries.
    this.addWatch(root, false, cb);

    // Each top-level directory (except heavy ones), recursively.
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !SKIP.has(entry.name)) {
        this.addWatch(join(root, entry.name), true, cb);
      }
    }
  }

  private addWatch(
    target: string,
    recursive: boolean,
    cb: (event: string, filename: string | Buffer | null) => void,
  ): void {
    try {
      this.watchers.push(watch(target, { recursive }, cb));
    } catch {
      // Some platforms/filesystems reject recursive watches — skip this target.
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onChange(), 200);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* already closed */
      }
    }
    this.watchers = [];
  }
}
