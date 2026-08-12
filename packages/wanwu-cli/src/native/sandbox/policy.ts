import type { SandboxMode } from "@wanwu/config";
import type { SandboxBackend } from "./detect.js";

export interface SandboxPolicy {
  mode: SandboxMode;
  backend: SandboxBackend;
  /** Whether to enforce or fail closed */
  enforce: boolean;
  /** Human-readable reason when not enforced */
  reason?: string;
}

export function resolveSandboxPolicy(
  mode: SandboxMode,
  backend: SandboxBackend,
): SandboxPolicy {
  if (mode === "off") {
    return { mode, backend, enforce: false, reason: "sandbox disabled by config" };
  }
  if (backend === "none") {
    if (mode === "strict") {
      return {
        mode,
        backend,
        enforce: false,
        reason: "sandbox=strict but no backend (bwrap/sandbox-exec/docker) available",
      };
    }
    return {
      mode,
      backend,
      enforce: false,
      reason: "sandbox=workspace but no backend available; falling back to path+env jail",
    };
  }
  return { mode, backend, enforce: true };
}
