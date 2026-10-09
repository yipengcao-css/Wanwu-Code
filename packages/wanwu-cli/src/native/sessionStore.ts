import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { flattenText, type ChatMessage } from "@wanwu/providers";

export interface StoredSession {
  id: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  history: ChatMessage[];
  /** User-facing name. Survives later saves that only refresh history. */
  title?: string;
}

function sessionsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".wanwu", "sessions");
}

export function saveSession(session: StoredSession): void {
  const dir = sessionsRoot(session.workspaceRoot);
  mkdirSync(dir, { recursive: true });
  const prev = loadSession(session.workspaceRoot, session.id);
  const next: StoredSession = { ...session, title: session.title ?? prev?.title };
  writeFileSync(join(dir, `${session.id}.json`), JSON.stringify(next, null, 2), "utf8");
}

const SESSION_ID = /^[\w.-]+$/;

/** Remove a saved session. Missing files are fine. Rejects path tricks. */
export function deleteSession(workspaceRoot: string, id: string): boolean {
  if (!SESSION_ID.test(id)) return false;
  const file = join(sessionsRoot(workspaceRoot), `${id}.json`);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}

export function renameSession(workspaceRoot: string, id: string, title: string): boolean {
  if (!SESSION_ID.test(id)) return false;
  const clean = title.trim().slice(0, 80);
  if (!clean) return false;
  const existing = loadSession(workspaceRoot, id);
  const now = new Date().toISOString();
  saveSession({
    id,
    workspaceRoot,
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
    history: existing?.history ?? [],
    title: clean,
  });
  return true;
}

export function loadSession(
  workspaceRoot: string,
  id: string,
): StoredSession | undefined {
  const path = join(sessionsRoot(workspaceRoot), `${id}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredSession;
  } catch {
    return undefined;
  }
}

export function listSessions(workspaceRoot: string): StoredSession[] {
  const dir = sessionsRoot(workspaceRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => loadSession(workspaceRoot, n.slice(0, -5)))
    .filter((s): s is StoredSession => Boolean(s))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** First user-visible line of a session, for history rails. */
export function sessionPreview(history: ChatMessage[]): string {
  for (const m of history) {
    if (m.role !== "user") continue;
    const t = flattenText(m.content)
      .replace(/\[MODE=\w+\][^\n]*\n?/g, "")
      .replace(/\[EDITOR_CONTEXT\][\s\S]*?\[\/EDITOR_CONTEXT\]\n?/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (t) return t.slice(0, 48);
  }
  return "空会话";
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: number;
  preview: string;
  title?: string;
}

export function listSessionSummaries(workspaceRoot: string): SessionSummary[] {
  return listSessions(workspaceRoot).map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
      messages: s.history.length,
      preview: sessionPreview(s.history),
      title: s.title,
    }));
}
