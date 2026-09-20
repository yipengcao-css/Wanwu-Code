import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * On-disk format matches packages/wanwu-cli/src/native/checkpoints.ts
 * (.wanwu/checkpoints/<id>/meta.json + files/).
 */
export interface CheckpointMeta {
  id: string;
  sessionId: string;
  createdAt: string;
  files: Array<{ path: string; existed: boolean; size: number }>;
}

function dir(root: string): string {
  return join(root, ".wanwu", "checkpoints");
}

function readMeta(root: string, id: string): CheckpointMeta | undefined {
  const path = join(dir(root), id, "meta.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CheckpointMeta;
  } catch {
    return undefined;
  }
}

export function listCheckpoints(root: string): CheckpointMeta[] {
  const base = dir(root);
  if (!existsSync(base)) return [];
  const out: CheckpointMeta[] = [];
  for (const name of readdirSync(base)) {
    const meta = readMeta(root, name);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestCheckpoint(root: string): CheckpointMeta | undefined {
  return listCheckpoints(root)[0];
}

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
    const abs = join(root, f.path);
    try {
      if (f.existed) {
        const backup = join(dir(root), turnId, "files", f.path);
        if (!existsSync(backup)) {
          missing.push(f.path);
          continue;
        }
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, readFileSync(backup));
        restored.push(f.path);
      } else if (existsSync(abs)) {
        rmSync(abs);
        deleted.push(f.path);
      }
    } catch {
      missing.push(f.path);
    }
  }
  return { restored, deleted, missing };
}
