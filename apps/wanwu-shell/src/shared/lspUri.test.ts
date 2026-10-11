import assert from "node:assert/strict";
import { relFromFileUri } from "./lspUri.ts";

assert.equal(relFromFileUri("file:///tmp/demo/src/a.ts", "/tmp/demo"), "src/a.ts");
assert.equal(relFromFileUri("file:///tmp/demo/src/a%20b.ts", "/tmp/demo"), "src/a b.ts");
assert.equal(relFromFileUri("file:///C:/repo/src/a.ts", "C:/repo"), "src/a.ts");
assert.equal(relFromFileUri("file:///tmp/other/a.ts", "/tmp/demo"), null);
assert.equal(relFromFileUri("file:///tmp/demo/../secret", "/tmp/demo"), null);
assert.equal(relFromFileUri("", "/tmp/demo"), null);

console.log("lspUri tests passed");
