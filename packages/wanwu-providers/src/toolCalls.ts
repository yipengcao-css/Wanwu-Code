import type { ToolCall } from "./types.js";

/** Give every tool call a non-empty id that does not collide in the same message. */
export function uniquifyToolCalls(calls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return calls.map((call, i) => {
    const name = call.name.trim() || "tool";
    let id = call.id.trim();
    if (!id || seen.has(id)) id = `call_${i}_${name}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const args = call.arguments.trim();
    return { id, name, arguments: args ? args : "{}" };
  });
}
