import type { ChatMessage } from "@wanwu/providers";

/**
 * Heuristic token estimate: CJK chars ≈ 1 token, others ≈ 1/4 token.
 * Good enough for context budgeting (exact counts need provider tokenizers).
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3000 && cp <= 0x303f) ||
      (cp >= 0xff00 && cp <= 0xffef) ||
      (cp >= 0x3040 && cp <= 0x30ff) ||
      (cp >= 0xac00 && cp <= 0xd7af)
    ) {
      cjk += 1;
    } else {
      other += 1;
    }
  }
  return Math.ceil(cjk + other / 4);
}

export function messageText(m: ChatMessage): string {
  let text = "";
  if (typeof m.content === "string") {
    text = m.content;
  } else if (Array.isArray(m.content)) {
    text = m.content
      .map((p) => (p.type === "text" ? p.text : `[${p.type}]`))
      .join("\n");
  }
  if (m.toolCalls?.length) {
    text += m.toolCalls.map((t) => `${t.name}(${t.arguments})`).join("\n");
  }
  return text;
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(messageText(m)) + 4; // per-message overhead
  }
  return total;
}

export interface CompactOptions {
  budgetTokens: number;
  /** Recent messages to preserve verbatim (default 12). */
  keepRecent?: number;
  /** LLM summarizer; when absent/failing, falls back to a truncation marker. */
  summarize?: (text: string) => Promise<string>;
}

export interface CompactResult {
  messages: ChatMessage[];
  compacted: boolean;
  droppedCount: number;
  droppedTokens: number;
}

/**
 * Compress history when over budget: keep system + recent turns, replace the
 * middle with an LLM summary (or a truncation marker without a summarizer).
 * The cut point aligns to a user message so tool-call groups stay intact.
 */
export async function compactMessages(
  messages: ChatMessage[],
  opts: CompactOptions,
): Promise<CompactResult> {
  const total = estimateMessagesTokens(messages);
  if (total <= opts.budgetTokens) {
    return { messages, compacted: false, droppedCount: 0, droppedTokens: 0 };
  }
  const keepRecent = opts.keepRecent ?? 12;
  const system = messages[0]?.role === "system" ? messages[0] : undefined;
  const body = system ? messages.slice(1) : messages.slice();
  if (body.length <= keepRecent) {
    return { messages, compacted: false, droppedCount: 0, droppedTokens: 0 };
  }

  let cut = body.length - keepRecent;
  // Walk to the nearest user message so assistant/tool groups are not split.
  while (cut > 0 && body[cut]!.role !== "user") cut -= 1;
  if (cut === 0) {
    return { messages, compacted: false, droppedCount: 0, droppedTokens: 0 };
  }

  const dropped = body.slice(0, cut);
  const kept = body.slice(cut);
  const droppedTokens = estimateMessagesTokens(dropped);

  const rendered = dropped
    .map((m) => `[${m.role}] ${messageText(m).slice(0, 2000)}`)
    .join("\n\n")
    .slice(0, 24_000);

  let note: string;
  if (opts.summarize) {
    try {
      const summary = await opts.summarize(rendered);
      note = `[Context compacted — summary of ${dropped.length} earlier messages (~${droppedTokens} tokens)]\n${summary.trim()}`;
    } catch {
      note = `[Context compacted — dropped ${dropped.length} earlier messages (~${droppedTokens} tokens); summary unavailable]`;
    }
  } else {
    note = `[Context compacted — dropped ${dropped.length} earlier messages (~${droppedTokens} tokens)]`;
  }

  const out: ChatMessage[] = [
    ...(system ? [system] : []),
    { role: "user", content: note },
    ...kept,
  ];
  return { messages: out, compacted: true, droppedCount: dropped.length, droppedTokens };
}
