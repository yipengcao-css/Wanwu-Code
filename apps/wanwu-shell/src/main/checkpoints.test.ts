import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listCheckpoints, restoreCheckpoint } from "./checkpoints.ts";

const root = mkdtempSync(join(tmpdir(), "wanwu-ckpt-"));
const id = "test-turn";
const fileDir = join(root, ".wanwu", "checkpoints", id, "files");
mkdirSync(dirname(join(fileDir, "a.ts")), { recursive: true });
writeFileSync(join(fileDir, "a.ts"), "old\n");
writeFileSync(
  join(root, ".wanwu", "checkpoints", id, "meta.json"),
  JSON.stringify({
    id,
    sessionId: "s1",
    createdAt: new Date().toISOString(),
    files: [{ path: "a.ts", existed: true, size: 4 }],
  }),
);
writeFileSync(join(root, "a.ts"), "new\n");

const listed = listCheckpoints(root);
assert.equal(listed[0]?.id, id);
const r = restoreCheckpoint(root, id);
assert.deepEqual(r.restored, ["a.ts"]);
assert.equal(readFileSync(join(root, "a.ts"), "utf8"), "old\n");
console.log("shell checkpoints tests passed");
