import { spawn } from "node:child_process";
import type { AgentEvent, AgentMode } from "../../shared/ipc.js";
import { AcpClient } from "./client.js";
import { resolveBackend, type BackendChoice } from "./resolveBackend.js";

/**
 * Owns the ACP backend process and session lifecycle.
 *
 * P0-3: the session is NOT a global singleton pinned to the first workspace.
 * `restartForWorkspace()` tears down the backend and starts a fresh one whose
 * cwd (and therefore memory/config discovery + `session/new` cwd) points at the
 * newly opened folder.
 */
export class AgentManager {
  private client: AcpClient | undefined;
  private sessionId: string | undefined;
  private cwd: string;
  private choice: BackendChoice;
  private starting: Promise<void> | undefined;

  constructor(
    private readonly emit: (event: AgentEvent) => void,
    initialCwd: string,
    choice: BackendChoice = "mock",
  ) {
    this.cwd = initialCwd;
    this.choice = choice;
  }

  get currentCwd(): string {
    return this.cwd;
  }

  async ensureStarted(): Promise<void> {
    if (this.client && this.sessionId) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async start(): Promise<void> {
    const resolved = resolveBackend(this.choice);
    this.emit({ kind: "status", status: "starting", backend: resolved.info, detail: this.cwd });

    const child = spawn(resolved.command, resolved.args, {
      cwd: this.cwd,
      env: { ...process.env, ...resolved.env, WANWU_ACP_BACKEND: resolved.info.backend },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const client = new AcpClient(child);
    this.client = client;

    client.on("message", (text: string) => this.emit({ kind: "message", text }));
    client.on("tool", (t: { title: string; status: string; detail?: string }) =>
      this.emit({ kind: "tool", title: t.title, status: t.status, detail: t.detail }),
    );
    client.on("edit", (e: { path: string; before: string; after: string }) =>
      this.emit({ kind: "edit", path: e.path, before: e.before, after: e.after }),
    );
    client.on("permission", (req: { id: number; toolName: string; summary: string; risk?: string }) =>
      this.emit({
        kind: "permission",
        id: req.id,
        toolName: req.toolName,
        summary: req.summary,
        risk: req.risk,
      }),
    );
    client.on("exit", (code: number) =>
      this.emit({ kind: "status", status: "exited", detail: `backend exited (${code})` }),
    );
    client.on("error", (err: Error) =>
      this.emit({ kind: "status", status: "error", detail: err.message }),
    );

    await client.initialize();
    const sessionId = await client.newSession(this.cwd);
    this.sessionId = sessionId;
    this.emit({
      kind: "status",
      status: "ready",
      sessionId,
      backend: resolved.info,
      detail: this.cwd,
    });
  }

  /** P0-3: rebuild the backend + session against a newly opened workspace. */
  async restartForWorkspace(cwd: string): Promise<void> {
    this.cwd = cwd;
    this.dispose();
    await this.ensureStarted();
  }

  setBackend(choice: BackendChoice): void {
    if (choice === this.choice) return;
    this.choice = choice;
    this.dispose();
  }

  async prompt(mode: AgentMode, text: string): Promise<void> {
    await this.ensureStarted();
    if (!this.client || !this.sessionId) {
      this.emit({ kind: "status", status: "error", detail: "no active ACP session" });
      return;
    }
    const decorated = `[MODE=${mode}] ${text}`;
    this.emit({ kind: "status", status: "thinking" });
    try {
      await this.client.prompt(this.sessionId, decorated);
    } catch (err) {
      this.emit({
        kind: "status",
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    this.emit({ kind: "status", status: "idle" });
  }

  respondPermission(id: number, optionId: string): void {
    this.client?.respond(id, { optionId });
  }

  dispose(): void {
    this.client?.dispose();
    this.client = undefined;
    this.sessionId = undefined;
  }
}
