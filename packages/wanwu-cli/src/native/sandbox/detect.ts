import { existsSync } from "node:fs";
import { delimiter } from "node:path";

export type SandboxBackend = "bwrap" | "sandbox-exec" | "docker" | "wsl" | "none";

function commandExists(cmd: string): boolean {
  const paths = (process.env.PATH ?? "").split(delimiter);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of paths) {
    for (const ext of exts) {
      if (existsSync(`${dir}/${cmd}${ext}`)) return true;
    }
  }
  return false;
}

export function detectSandboxBackend(): SandboxBackend {
  if (process.platform === "linux" && commandExists("bwrap")) return "bwrap";
  if (process.platform === "darwin" && commandExists("sandbox-exec")) return "sandbox-exec";
  if (commandExists("docker")) return "docker";
  if (process.platform === "win32" && commandExists("wsl")) return "wsl";
  return "none";
}

export function sandboxBackendLabel(backend: SandboxBackend): string {
  switch (backend) {
    case "bwrap":
      return "bubblewrap";
    case "sandbox-exec":
      return "sandbox-exec (Seatbelt)";
    case "docker":
      return "docker";
    case "wsl":
      return "wsl";
    case "none":
      return "none";
  }
}
