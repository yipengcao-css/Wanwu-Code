import { existsSync } from "node:fs";
import { platform } from "node:os";
import process from "node:process";
import * as pty from "node-pty";
import type { IPty } from "node-pty";

export interface SpawnedTerminal {
  id: string;
  shell: string;
  cwd: string;
}

/**
 * Pick a sensible interactive shell for the host OS.
 *
 * P0-2 fix: never hard-code `process.env.SHELL || "/bin/bash"`. On Windows
 * `SHELL` is normally empty and `/bin/bash` does not exist, so we resolve a real
 * Windows shell (PowerShell 7 → Windows PowerShell → cmd). On POSIX we honor
 * `$SHELL` and fall back through common shells.
 */
export function resolveShell(): { shell: string; args: string[] } {
  if (platform() === "win32") {
    const pwsh = process.env["ProgramFiles"]
      ? `${process.env["ProgramFiles"]}\\PowerShell\\7\\pwsh.exe`
      : "pwsh.exe";
    const systemRoot = process.env["SystemRoot"] ?? "C:\\Windows";
    const winPowerShell = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    const comspec = process.env["ComSpec"] ?? `${systemRoot}\\System32\\cmd.exe`;
    // Prefer pwsh if the caller provided an explicit override, else PowerShell, else cmd.
    const override = process.env["WANWU_TERMINAL_SHELL"];
    if (override) return { shell: override, args: [] };
    if (process.env["ProgramFiles"]) return { shell: pwsh, args: ["-NoLogo"] };
    if (systemRoot) return { shell: winPowerShell, args: ["-NoLogo"] };
    return { shell: comspec, args: [] };
  }

  const override = process.env["WANWU_TERMINAL_SHELL"];
  if (override) return { shell: override, args: [] };
  const shell = process.env["SHELL"];
  if (shell && shell.trim().length > 0) return { shell, args: [] };
  // Common POSIX fallbacks — pick the first that actually exists.
  for (const candidate of ["/bin/bash", "/bin/zsh", "/bin/sh"]) {
    if (existsSync(candidate)) return { shell: candidate, args: [] };
  }
  return { shell: "/bin/sh", args: [] };
}

export class TerminalManager {
  private readonly terminals = new Map<string, IPty>();

  constructor(
    private readonly onData: (id: string, data: string) => void,
    private readonly onExit: (id: string, exitCode: number) => void,
  ) {}

  create(id: string, cols: number, rows: number, cwd: string): SpawnedTerminal {
    this.dispose(id);
    const { shell, args } = resolveShell();
    const term = pty.spawn(shell, args, {
      name: "xterm-color",
      cols: Math.max(cols, 2),
      rows: Math.max(rows, 1),
      cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });
    this.terminals.set(id, term);
    term.onData((data) => this.onData(id, data));
    term.onExit(({ exitCode }) => {
      this.terminals.delete(id);
      this.onExit(id, exitCode);
    });
    return { id, shell, cwd };
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.terminals.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 1));
    } catch {
      /* terminal may have exited */
    }
  }

  dispose(id: string): void {
    const term = this.terminals.get(id);
    if (!term) return;
    this.terminals.delete(id);
    try {
      term.kill();
    } catch {
      /* already gone */
    }
  }

  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) {
      this.dispose(id);
    }
  }
}
