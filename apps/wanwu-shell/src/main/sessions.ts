import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export interface StoredSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  log: unknown[];
}

type Store = Record<string, StoredSession[]>;

function storePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "sessions.json");
}

function readStore(): Store {
  try {
    return JSON.parse(readFileSync(storePath(), "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  writeFileSync(storePath(), JSON.stringify(store, null, 2), "utf8");
}

/** Agent sessions are persisted per workspace root. */
export function loadSessions(root: string | null): StoredSession[] {
  if (!root) return [];
  return readStore()[root] ?? [];
}

export function saveSessions(root: string | null, sessions: StoredSession[]): void {
  if (!root) return;
  const store = readStore();
  store[root] = sessions.slice(0, 100); // cap history
  writeStore(store);
}
