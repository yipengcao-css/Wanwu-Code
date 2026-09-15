import * as monaco from "monaco-editor";

/**
 * Tab ghost-text completion: Monaco inlineCompletions provider backed by
 * the main-process ai:complete IPC (active provider; FIM or chat fallback).
 * Debounced 300ms; stale responses dropped via a request sequence guard.
 */

let registered = false;
let seq = 0;

const DEBOUNCE_MS = 300;
const PREFIX_CHARS = 3000;
const SUFFIX_CHARS = 800;

export function registerInlineCompletion(): void {
  if (registered) return;
  registered = true;

  monaco.languages.registerInlineCompletionsProvider("*", {
    groupId: "wanwu-inline",
    provideInlineCompletions: async (model, position) => {
      const mySeq = ++seq;
      await new Promise((r) => setTimeout(r, DEBOUNCE_MS));
      if (mySeq !== seq) return { items: [] };

      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const prefix = text.slice(Math.max(0, offset - PREFIX_CHARS), offset);
      const suffix = text.slice(offset, offset + SUFFIX_CHARS);
      // Don't fire on nearly-empty files or right after whitespace-only prefix.
      if (prefix.trim().length < 8) return { items: [] };

      try {
        const res = await window.wanwu.ai.complete({
          prefix,
          suffix,
          language: model.getLanguageId(),
          path: model.uri.path,
        });
        if (mySeq !== seq || !res.text) return { items: [] };
        return {
          items: [
            {
              insertText: res.text,
              range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column,
              ),
            },
          ],
        };
      } catch {
        return { items: [] };
      }
    },
    freeInlineCompletions: () => {
      /* nothing to free */
    },
  });
}
