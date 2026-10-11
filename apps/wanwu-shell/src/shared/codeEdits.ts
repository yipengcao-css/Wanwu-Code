import type { LspTextEdit } from "./lspEdits";
import { relFromFileUri } from "./lspUri";

export type LspWorkspaceEdit = {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{
    textDocument?: { uri?: string };
    edits?: LspTextEdit[];
  }>;
};

/** Workspace edit → relative paths that stay inside the root. */
export function collectWorkspaceEdits(
  edit: LspWorkspaceEdit | null | undefined,
  workspaceRoot: string,
): Array<{ rel: string; edits: LspTextEdit[] }> {
  if (!edit) return [];
  const byRel = new Map<string, LspTextEdit[]>();
  const add = (uri: string | undefined, edits: LspTextEdit[] | undefined): void => {
    if (!uri || !edits?.length) return;
    const rel = relFromFileUri(uri, workspaceRoot);
    if (!rel) return;
    const prev = byRel.get(rel) ?? [];
    prev.push(...edits);
    byRel.set(rel, prev);
  };
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) add(uri, edits);
  for (const change of edit.documentChanges ?? []) add(change.textDocument?.uri, change.edits);
  return [...byRel.entries()].map(([rel, edits]) => ({ rel, edits }));
}
