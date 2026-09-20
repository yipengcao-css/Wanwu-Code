import type { WanwuMode } from "@wanwu/config";
import type { ToolSpec } from "@wanwu/providers";

/** Write / spawn-write tools. Hidden from the model in Ask/Plan/Verify (Cursor-style). */
export const WRITE_TOOLS = new Set(["Edit", "Write", "Task"]);

/**
 * Tools the model must not see (and dispatch must reject) per mode.
 * Ask also hides Bash so Q&A cannot run a shell; Plan keeps read-only Bash.
 */
export function hiddenToolsForMode(mode: WanwuMode): ReadonlySet<string> {
  switch (mode) {
    case "ask":
      return new Set(["Edit", "Write", "Task", "Bash"]);
    case "plan":
    case "verify":
      return new Set(["Edit", "Write", "Task"]);
    default:
      return new Set();
  }
}

export function isToolAllowedInMode(mode: WanwuMode, name: string): boolean {
  return !hiddenToolsForMode(mode).has(name);
}

/** Filter OpenAI-compat tool specs so the model cannot even propose blocked tools. */
export function toolsForMode(mode: WanwuMode, specs: ToolSpec[]): ToolSpec[] {
  return specs.filter((s) => isToolAllowedInMode(mode, s.name));
}
