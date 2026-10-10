import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existingDirectories } from "./existingDirs.ts";

const live = mkdtempSync(join(tmpdir(), "wanwu-recent-"));
const gone = join(tmpdir(), "wanwu-recent-missing-nope");
rmSync(gone, { recursive: true, force: true });
assert.deepEqual(existingDirectories([live, gone, ""]), [live]);
rmSync(live, { recursive: true, force: true });

console.log("existingDirs tests passed");
