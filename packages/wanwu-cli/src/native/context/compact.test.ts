import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@wanwu/providers";
import { compactMessages, estimateMessagesTokens, estimateTokens } from "./compact.js";

function msg(role: ChatMessage["role"], text: string): ChatMessage {
  return { role, content: text };
}

describe("estimateTokens", () => {
  it("estimates english at ~4 chars/token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("counts CJK chars as ~1 token", () => {
    expect(estimateTokens("汉".repeat(100))).toBe(100);
  });

  it("handles mixed text", () => {
    const t = estimateTokens("hello 世界");
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(12);
  });
});

describe("compactMessages", () => {
  it("is a no-op under budget", async () => {
    const messages = [msg("system", "sys"), msg("user", "hi"), msg("assistant", "hello")];
    const r = await compactMessages(messages, { budgetTokens: 1000 });
    expect(r.compacted).toBe(false);
    expect(r.messages).toEqual(messages);
  });

  it("compacts over budget: keeps system + recent, inserts summary", async () => {
    const big = "x".repeat(2000);
    const messages: ChatMessage[] = [msg("system", "sys")];
    for (let i = 0; i < 20; i += 1) {
      messages.push(msg("user", `q${i} ${big}`));
      messages.push(msg("assistant", `a${i} ${big}`));
    }
    const r = await compactMessages(messages, {
      budgetTokens: 5000,
      keepRecent: 6,
      summarize: async () => "SUMMARY",
    });
    expect(r.compacted).toBe(true);
    expect(r.messages[0]).toEqual(msg("system", "sys"));
    expect(String(r.messages[1]!.content)).toContain("SUMMARY");
    // recent tail preserved verbatim
    expect(String(r.messages.at(-1)!.content)).toContain("a19");
    expect(r.messages.length).toBeLessThan(messages.length);
  });

  it("cut point aligns to a user message (tool groups intact)", async () => {
    const big = "y".repeat(1500);
    const messages: ChatMessage[] = [msg("system", "sys")];
    for (let i = 0; i < 12; i += 1) {
      messages.push(msg("user", `q${i} ${big}`));
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: [{ id: `t${i}`, name: "Read", arguments: "{}" }],
      });
      messages.push({ role: "tool", toolCallId: `t${i}`, name: "Read", content: big });
    }
    const r = await compactMessages(messages, { budgetTokens: 4000, keepRecent: 6 });
    expect(r.compacted).toBe(true);
    // First kept message after the summary note must be a user message.
    expect(r.messages[2]!.role).toBe("user");
    // No orphan tool messages: every tool message follows an assistant with toolCalls.
    for (let i = 1; i < r.messages.length; i += 1) {
      if (r.messages[i]!.role === "tool") {
        expect(r.messages[i - 1]!.toolCalls?.length).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to a marker when no summarizer is given", async () => {
    const big = "z".repeat(2000);
    const messages: ChatMessage[] = [msg("system", "sys")];
    for (let i = 0; i < 16; i += 1) {
      messages.push(msg("user", `q${i} ${big}`));
      messages.push(msg("assistant", `a${i}`));
    }
    const r = await compactMessages(messages, { budgetTokens: 4000, keepRecent: 4 });
    expect(r.compacted).toBe(true);
    expect(String(r.messages[1]!.content)).toMatch(/Context compacted/);
    expect(String(r.messages[1]!.content)).not.toMatch(/summary of/i);
  });

  it("falls back to a marker when summarizer throws", async () => {
    const big = "w".repeat(2000);
    const messages: ChatMessage[] = [msg("system", "sys")];
    for (let i = 0; i < 16; i += 1) {
      messages.push(msg("user", `q${i} ${big}`));
      messages.push(msg("assistant", `a${i}`));
    }
    const r = await compactMessages(messages, {
      budgetTokens: 4000,
      keepRecent: 4,
      summarize: async () => {
        throw new Error("llm down");
      },
    });
    expect(r.compacted).toBe(true);
    expect(String(r.messages[1]!.content)).toMatch(/summary unavailable/);
  });

  it("does not compact when only the recent tail exists", async () => {
    const big = "v".repeat(3000);
    const messages = [msg("system", "sys"), msg("user", big), msg("assistant", big)];
    const r = await compactMessages(messages, { budgetTokens: 100, keepRecent: 12 });
    expect(r.compacted).toBe(false);
  });

  it("estimateMessagesTokens adds per-message overhead", () => {
    const a = estimateMessagesTokens([msg("user", "abcd")]);
    expect(a).toBe(1 + 4);
  });
});
