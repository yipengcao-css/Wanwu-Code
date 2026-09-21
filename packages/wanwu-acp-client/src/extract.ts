function updateOf(params: unknown): Record<string, unknown> | undefined {
  if (!params || typeof params !== "object") return undefined;
  const update = (params as { update?: unknown }).update;
  return update && typeof update === "object" ? (update as Record<string, unknown>) : undefined;
}

function contentText(update: Record<string, unknown>): string | undefined {
  const content = update.content as Record<string, unknown> | undefined;
  return typeof content?.text === "string" ? content.text : undefined;
}

/** Only assistant answer tokens — never tool dumps or thoughts. */
export function extractText(params: unknown): string | undefined {
  const update = updateOf(params);
  if (update?.sessionUpdate !== "agent_message_chunk") return undefined;
  return contentText(update);
}

export function extractThought(params: unknown): string | undefined {
  const update = updateOf(params);
  if (update?.sessionUpdate !== "agent_thought_chunk") return undefined;
  return contentText(update);
}

export function extractTool(
  params: unknown,
): { id?: string; title: string; status: string; detail?: string } | undefined {
  const update = updateOf(params);
  if (update?.sessionUpdate !== "tool_call") return undefined;
  const title = update.title;
  const status = update.status;
  const detail = contentText(update);
  if (typeof title !== "string" || typeof status !== "string") return undefined;
  return {
    id: typeof update.toolCallId === "string" ? update.toolCallId : undefined,
    title,
    status,
    detail: typeof detail === "string" ? detail.slice(0, 200) : undefined,
  };
}
