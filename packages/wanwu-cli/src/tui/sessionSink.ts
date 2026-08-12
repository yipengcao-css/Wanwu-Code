export interface ToolCallUpdate {
  toolCallId?: string;
  title?: string;
  status?: string;
  content?: {
    type?: string;
    text?: string;
    path?: string;
    before?: string;
    after?: string;
  };
}

export interface SessionUpdate {
  sessionUpdate?: string;
  content?: {
    type?: string;
    text?: string;
  };
  toolCallId?: string;
  title?: string;
  status?: string;
}

export type SessionEvent =
  | { type: "text"; text: string }
  | { type: "tool"; toolCallId: string; title: string; status: string; content?: ToolCallUpdate["content"] }
  | { type: "diff"; path: string; before: string; after: string; status: string }
  | { type: "unknown" };

export function parseSessionUpdate(raw: string): SessionEvent | undefined {
  let msg: {
    method?: string;
    params?: { update?: SessionUpdate & { content?: ToolCallUpdate["content"] } };
  };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return undefined;
  }
  if (msg.method !== "session/update") return undefined;
  const u = msg.params?.update;
  if (!u) return { type: "unknown" };

  if (u.sessionUpdate === "tool_call") {
    const content = u.content;
    if (content?.type === "diff" && content.path) {
      return {
        type: "diff",
        path: content.path,
        before: content.before ?? "",
        after: content.after ?? "",
        status: u.status ?? "pending",
      };
    }
    return {
      type: "tool",
      toolCallId: u.toolCallId ?? "unknown",
      title: u.title ?? "Tool",
      status: u.status ?? "pending",
      content,
    };
  }

  if (u.sessionUpdate === "agent_message_chunk" && u.content?.text) {
    return { type: "text", text: u.content.text };
  }

  return { type: "unknown" };
}
