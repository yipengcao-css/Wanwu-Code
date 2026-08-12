import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage } from "@wanwu/providers";

export interface StoredSession {
  id: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  history: ChatMessage[];
}

function sessionsRoot(workspaceRoot: string): string {
  return join(workspaceRoot, ".wanwu", "sessions");
}

export function saveSession(session: StoredSession): void {
  const dir = sessionsRoot(session.workspaceRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf8",
  );
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
