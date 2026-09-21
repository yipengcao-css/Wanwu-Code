import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ToolResult } from "./tools.js";

export type DebugPhase = "hypotheses" | "wait_for_repro" | "analyze" | "fixed" | "cleanup";

export interface DebugState {
  sessionId: string;
  phase: DebugPhase;
  hypotheses: string[];
  notes: string;
  waiting: boolean;
  updatedAt: string;
}

const PHASES = new Set<DebugPhase>([
  "hypotheses",
  "wait_for_repro",
  "analyze",
  "fixed",
  "cleanup",
]);

export function isDebugPhase(value: string): value is DebugPhase {
  return PHASES.has(value as DebugPhase);
}

function debugDir(root: string): string {
  return join(root, ".wanwu", "debug");
}

export function debugStatePath(root: string, sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "session";
  return join(debugDir(root), `${safe}.json`);
}

export function readDebugState(root: string, sessionId: string): DebugState | undefined {
  const path = debugStatePath(root, sessionId);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DebugState;
  } catch {
    return undefined;
  }
}

export function writeDebugState(root: string, state: DebugState): void {
  mkdirSync(debugDir(root), { recursive: true });
  writeFileSync(debugStatePath(root, state.sessionId), JSON.stringify(state, null, 2), "utf8");
}

export function formatDebugState(state: DebugState): string {
  const lines = [
    `phase=${state.phase}`,
    state.waiting ? "WAIT_FOR_REPRO" : "",
    state.hypotheses.length
      ? `hypotheses:\n${state.hypotheses.map((h, i) => `  ${i + 1}. ${h}`).join("\n")}`
      : "",
    state.notes ? `notes:\n${state.notes}` : "",
  ].filter(Boolean);
  if (state.waiting) {
    lines.push("请复现问题，把日志或现象发回后再继续。不要在用户复现前改业务逻辑。");
  }
  if (state.phase === "cleanup") {
    lines.push("清理阶段：删除所有带 WANWU_DEBUG 标记的插桩后再收工。");
  }
  return lines.join("\n");
}

export function toolDebug(
  root: string,
  sessionId: string,
  args: { phase?: string; hypotheses?: unknown; notes?: string; waiting?: boolean },
): ToolResult {
  const phase = typeof args.phase === "string" && isDebugPhase(args.phase) ? args.phase : undefined;
  if (!phase) {
    return {
      ok: false,
      title: "Debug",
      text: "Debug requires phase: hypotheses | wait_for_repro | analyze | fixed | cleanup",
    };
  }
  const prev = readDebugState(root, sessionId);
  const hypotheses = Array.isArray(args.hypotheses)
    ? args.hypotheses.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    : (prev?.hypotheses ?? []);
  const waiting = args.waiting === true || phase === "wait_for_repro";
  const state: DebugState = {
    sessionId,
    phase,
    hypotheses,
    notes: typeof args.notes === "string" ? args.notes : (prev?.notes ?? ""),
    waiting,
    updatedAt: new Date().toISOString(),
  };
  writeDebugState(root, state);
  return { ok: true, title: "Debug", text: formatDebugState(state) };
}
