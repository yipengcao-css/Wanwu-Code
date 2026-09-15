import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { assertInsideWorkspace } from "./workspacePaths.js";

/**
 * Turn-scoped checkpoints: before the agent applies an Edit/Write, the
 * file's previous bytes are backed up under .wanwu/checkpoints/<turnId>/.
 * Restore copies them back and deletes files the turn created.
 * Git-independent and precise — covers agent-caused damage, which is what
 * users actually want to undo.
 */

export interface CheckpointFile {
  path: string;
  existed: boolean;
  size: number;
}

export interface CheckpointMeta {
  id: string;
  sessionId: string;
  createdAt: string;
  files: CheckpointFile[];
}

const KEEP = 20;

function checkpointsDir(root: string): string {
  return join(root, ".wanwu", "checkpoints");
}

function metaPath(root: string, id: string): string {
  return join(checkpointsDir(root), id, "meta.json");
}

export function newTurnId(sessionId: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  const safeSession = sessionId.replace(/[^\w.-]/g, "_").slice(-16);
  return `${stamp}-${safeSession}-${rand}`;
}

function readMeta(root: string, id: string): CheckpointMeta | undefined {
  const path = metaPath(root, id);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CheckpointMeta;
  } catch {
    return undefined;
  }
}

function writeMeta(root: string, meta: CheckpointMeta): void {
  const dir = join(checkpointsDir(root), meta.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(metaPath(root, meta.id), JSON.stringify(meta, null, 2), "utf8");
}

/**
 * Back up the current content of `relPath` into the turn checkpoint.
 * Idempotent per file per turn (first backup wins — that's the pre-turn state).
 */
export function recordFileBackup(root: string, turnId: string, sessionId: string, relPath: string): void {
  const meta = readMeta(root, turnId) ?? {
    id: turnId,
    sessionId,
    createdAt: new Date().toISOString(),
    files: [],
  };
  if (meta.files.some((f) => f.path === relPath)) return;

  const abs = assertInsideWorkspace(root, relPath);
  const existed = existsSync(abs);
  const backupPath = join(checkpointsDir(root), turnId, "files", relPath);
  mkdirSync(dirname(backupPath), { recursive: true });
  let size = 0;
  if (existed) {
    const content = readFileSync(abs);
    writeFileSync(backupPath, content);
    size = content.byteLength;
  } else {
    // marker for "created by this turn" → delete on restore
    writeFileSync(join(checkpointsDir(root), turnId, "files", `${relPath}.created`), "");
  }
  meta.files.push({ path: relPath, existed, size });
  writeMeta(root, meta);
}

export function listCheckpoints(root: string): CheckpointMeta[] {
  const dir = checkpointsDir(root);
  if (!existsSync(dir)) return [];
  const out: CheckpointMeta[] = [];
  for (const name of readdirSync(dir)) {
    const meta = readMeta(root, name);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestCheckpoint(root: string): CheckpointMeta | undefined {
  return listCheckpoints(root)[0];
}

/** Restore a checkpoint: copy backups back; delete files the turn created. */
export function restoreCheckpoint(
  root: string,
  turnId: string,
): { restored: string[]; deleted: string[]; missing: string[] } {
  const meta = readMeta(root, turnId);
  if (!meta) return { restored: [], deleted: [], missing: [] };
  const restored: string[] = [];
  const deleted: string[] = [];
  const missing: string[] = [];
  for (const f of meta.files) {
    try {
      const abs = assertInsideWorkspace(root, f.path);
      if (f.existed) {
        const backup = join(checkpointsDir(root), turnId, "files", f.path);
        if (!existsSync(backup)) {
          missing.push(f.path);
          continue;
        }
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, readFileSync(backup));
        restored.push(f.path);
      } else {
        if (existsSync(abs)) {
          rmSync(abs);
          deleted.push(f.path);
        }
      }
    } catch {
      missing.push(f.path);
    }
  }
  return { restored, deleted, missing };
}

/** Keep the newest N checkpoints. */
export function pruneCheckpoints(root: string, keep = KEEP): number {
  const all = listCheckpoints(root);
  let pruned = 0;
  for (const meta of all.slice(keep)) {
    try {
      rmSync(join(checkpointsDir(root), meta.id), { recursive: true, force: true });
      pruned += 1;
    } catch {
      /* ignore */
    }
  }
  return pruned;
}

/** Total on-disk size (for doctor/inspect). */
export function checkpointsSize(root: string): number {
  const dir = checkpointsDir(root);
  if (!existsSync(dir)) return 0;
  let total = 0;
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else total += st.size;
      } catch {
        /* skip */
      }
    }
  };
  walk(dir);
  return total;
}
