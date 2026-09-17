import { watch, type FSWatcher } from "node:fs";

/**
 * Watch a workspace directory recursively and invoke `onChange` (debounced) when
 * files change on disk, so the renderer can refresh the tree / git view.
 *
 * Uses Node's native recursive fs.watch (supported on Linux since Node 20, and
 * on macOS/Windows) — no extra native dependency.
 */
export class WorkspaceWatcher {
  private watcher: FSWatcher | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly onChange: () => void) {}

  start(root: string): void {
    this.stop();
    try {
      this.watcher = watch(root, { recursive: true }, (_event, filename) => {
        const name = filename?.toString() ?? "";
        if (name.includes("node_modules") || name.includes(`.git${"/"}`)) return;
        this.schedule();
      });
    } catch {
      // Recursive watch unsupported on this platform/FS — degrade gracefully.
      this.watcher = undefined;
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
    this.watcher?.close();
    this.watcher = undefined;
  }
}
