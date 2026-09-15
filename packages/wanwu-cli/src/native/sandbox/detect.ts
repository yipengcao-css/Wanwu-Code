import { existsSync } from "node:fs";
import { delimiter } from "node:path";

export type SandboxBackend = "bwrap" | "sandbox-exec" | "docker" | "none";

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
  // Windows path is Docker (WSL was detected-but-never-executed; removed to
  // keep doctor honest).
  if (commandExists("docker")) return "docker";
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
    case "none":
      return "none";
  }
}
