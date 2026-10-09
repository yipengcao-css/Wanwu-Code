import assert from "node:assert/strict";
import { findFileRefs } from "./fileRefs.ts";

const hits = findFileRefs("see src/app/App.tsx:12 and also `packages/wanwu-cli/src/index.ts`.");
assert.equal(hits[0]?.path, "src/app/App.tsx");
assert.equal(hits[0]?.line, 12);
assert.equal(hits[1]?.path, "packages/wanwu-cli/src/index.ts");
assert.equal(hits[1]?.line, undefined);

const bare = findFileRefs("open README.md:3 next");
assert.equal(bare[0]?.path, "README.md");
assert.equal(bare[0]?.line, 3);

const url = findFileRefs("docs at https://example.com/a/b.ts:4");
assert.equal(url.length, 0);

console.log("fileRefs tests passed");
