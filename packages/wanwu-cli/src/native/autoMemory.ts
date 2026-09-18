/**
 * Conservative auto-memory: only fire when the user explicitly asked to remember.
 */
import { writebackMemory } from "../memoryWriteback.js";

const REMEMBER_RE =
  /记住|记一下|以后都|从今以后|\bremember(?:\s+that)?\b|\balways (?:use|prefer|do)\b/i;

export function shouldAutoRemember(userPrompt: string): boolean {
  return REMEMBER_RE.test(userPrompt);
}

/** Strip host wrappers so we remember the user's words, not MODE/editor chrome. */
export function memorySourcePrompt(prompt: string): string {
  return prompt
    .replace(/\[MODE=\w+\]/gi, "")
    .replace(/\[EDITOR_CONTEXT\][\s\S]*?\[\/EDITOR_CONTEXT\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMemoryNote(userPrompt: string, assistantText: string): string | undefined {
  const source = memorySourcePrompt(userPrompt);
  if (!shouldAutoRemember(source) && !shouldAutoRemember(userPrompt)) return undefined;
  const fromUser = source.replace(REMEMBER_RE, "").replace(/\s+/g, " ").trim();
  const fromAssistant = assistantText
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 12 && !l.startsWith("```"));
  const note = (fromAssistant || fromUser || source || userPrompt).slice(0, 240);
  return note.trim() || undefined;
}

/**
 * Persist a lesson into WANWU.md when the user explicitly asked to remember.
 * Returns the written note, or undefined when skipped.
 */
export function maybeAutoRemember(
  workspaceRoot: string,
  userPrompt: string,
  assistantText: string,
): string | undefined {
  if (process.env.WANWU_AUTO_MEMORY === "0") return undefined;
  const note = extractMemoryNote(userPrompt, assistantText);
  if (!note) return undefined;
  writebackMemory({ note, yes: true, cwd: workspaceRoot, quiet: true });
  return note;
}
