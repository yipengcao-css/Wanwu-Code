import { existsSync } from "node:fs";
import path from "node:path";

export type ShellLaunch = {
  file: string;
  args: string[];
  label: string;
};

export type ShellResolveOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** Injected for tests; defaults to PATH lookup + existsSync. */
  which?: (cmd: string) => string | undefined;
  existsSync?: (p: string) => boolean;
};

function defaultWhich(cmd: string, env: NodeJS.ProcessEnv): string | undefined {
  if (path.isAbsolute(cmd) || cmd.includes("/") || cmd.includes("\\")) {
    return existsSync(cmd) ? cmd : undefined;
  }
  const pathEnv = env.PATH ?? env.Path ?? "";
  const sep = env.Path !== undefined && env.PATH === undefined ? ";" : path.delimiter;
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""];
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + (ext && !cmd.toLowerCase().endsWith(ext.toLowerCase()) ? ext : ""));
      if (existsSync(candidate)) return candidate;
    }
    // also try bare name (unix / already-extensioned)
    const bare = path.join(dir, cmd);
    if (existsSync(bare)) return bare;
  }
  return undefined;
}

/**
 * Resolve an interactive login shell for the integrated terminal.
 * Windows: pwsh → powershell → COMSPEC/cmd（绝不使用 /bin/bash）.
 * POSIX: $SHELL → zsh → bash → sh.
 */
export function resolveShell(opts: ShellResolveOptions = {}): ShellLaunch {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const exists = opts.existsSync ?? existsSync;
  const which = opts.which ?? ((cmd: string) => defaultWhich(cmd, env));

  if (platform === "win32") {
    const pwsh = which("pwsh") ?? which("pwsh.exe");
    if (pwsh) {
      return { file: pwsh, args: ["-NoLogo"], label: "pwsh" };
    }
    const powershell = which("powershell") ?? which("powershell.exe");
    if (powershell) {
      return { file: powershell, args: ["-NoLogo"], label: "powershell" };
    }
    const comspec = env.ComSpec?.trim() || env.COMSPEC?.trim();
    if (comspec && exists(comspec)) {
      return { file: comspec, args: [], label: "cmd" };
    }
    const cmd = which("cmd.exe") ?? which("cmd");
    if (cmd) {
      return { file: cmd, args: [], label: "cmd" };
    }
    // Last resort: bare names (CreateProcess / PATH at spawn time)
    return { file: "cmd.exe", args: [], label: "cmd" };
  }

  const fromEnv = env.SHELL?.trim();
  if (fromEnv && exists(fromEnv)) {
    return { file: fromEnv, args: ["-l"], label: path.basename(fromEnv) };
  }
  for (const candidate of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
    if (exists(candidate)) {
      return { file: candidate, args: ["-l"], label: path.basename(candidate) };
    }
  }
  return { file: fromEnv || "/bin/sh", args: ["-l"], label: "sh" };
}
