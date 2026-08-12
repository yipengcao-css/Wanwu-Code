import { sessionUpdate } from "../jsonRpcStdio.js";
import type { SubagentKind } from "./types.js";

export function emitSubagentStart(
  parentSessionId: string,
  id: string,
  kind: SubagentKind,
  name: string,
  prompt: string,
): void {
  sessionUpdate(parentSessionId, {
    sessionUpdate: "tool_call",
    toolCallId: `sub-${id}-start`,
    title: `Subagent:${kind}:${name}`,
    status: "pending",
    content: { type: "text", text: prompt.slice(0, 500), subagentId: id, kind },
  });
}

export function emitSubagentComplete(
  parentSessionId: string,
  id: string,
  kind: SubagentKind,
  name: string,
  summary: string,
  ok: boolean,
): void {
  sessionUpdate(parentSessionId, {
    sessionUpdate: "tool_call",
    toolCallId: `sub-${id}-done`,
    title: `Subagent:${kind}:${name}`,
    status: ok ? "completed" : "failed",
    content: { type: "text", text: summary.slice(0, 2000), subagentId: id, kind },
  });
}

export function emitSubagentTool(
  parentSessionId: string,
  id: string,
  toolTitle: string,
  status: string,
  detail?: string,
): void {
  sessionUpdate(parentSessionId, {
    sessionUpdate: "tool_call",
    toolCallId: `sub-${id}-tool-${toolTitle}`,
    title: toolTitle,
    status,
    content: { type: "text", text: detail ?? "", subagentId: id },
  });
}
