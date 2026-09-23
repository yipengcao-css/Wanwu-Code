import { uniquifyToolCalls, type ChatMessage, type ToolCall } from "@wanwu/providers";

/**
 * Make a chat transcript acceptable to OpenAI-compatible APIs.
 * A `tool` message must sit directly after the assistant `tool_calls` it answers.
 * Duplicate tool-call ids (two WebSearch calls both named call_WebSearch) are split.
 */
export function repairToolTranscript(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message) continue;
    if (message.role === "tool") continue;
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      out.push(message);
      continue;
    }
    const original = message.toolCalls;
    const calls = uniquifyToolCalls(original);
    const following: ChatMessage[] = [];
    let j = i + 1;
    while (j < messages.length && messages[j]?.role === "tool") {
      const tool = messages[j];
      if (tool) following.push(tool);
      j += 1;
    }
    const used = new Set<number>();
    const paired = calls.map((call, idx) => pairTool(call, original[idx]?.id ?? "", following, used, idx));
    out.push({ ...message, toolCalls: calls });
    out.push(...paired);
    i = j - 1;
  }
  return out;
}

function pairTool(
  call: ToolCall,
  oldId: string,
  following: ChatMessage[],
  used: Set<number>,
  index: number,
): ChatMessage {
  let hit = following.findIndex((tool, i) => !used.has(i) && tool.toolCallId === oldId && oldId);
  if (hit < 0) {
    hit = following.findIndex((tool, i) => !used.has(i) && tool.toolCallId === call.id);
  }
  if (hit < 0 && following[index] && !used.has(index)) hit = index;
  if (hit >= 0) {
    used.add(hit);
    const tool = following[hit]!;
    return { ...tool, role: "tool", toolCallId: call.id, name: tool.name || call.name };
  }
  return {
    role: "tool",
    toolCallId: call.id,
    name: call.name,
    content: "(无工具结果)",
  };
}

/** Keep the newest messages, but never start in the middle of a tool group. */
export function tailHistory(history: ChatMessage[], max: number): ChatMessage[] {
  const body = history.filter((m) => m.role !== "system");
  if (body.length <= max) return repairToolTranscript(body);
  let start = Math.max(0, body.length - max);
  while (start > 0 && body[start]?.role !== "user") start -= 1;
  return repairToolTranscript(body.slice(start));
}
