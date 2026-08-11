import assert from "node:assert/strict";
import { shouldResetAcpSession } from "./acpSession.ts";

assert.equal(shouldResetAcpSession(undefined, "/a"), false);
assert.equal(shouldResetAcpSession("/a", null), false);
assert.equal(shouldResetAcpSession("/a", "/a"), false);
assert.equal(shouldResetAcpSession("/a", "/a/"), false);
assert.equal(shouldResetAcpSession("/old", "/new"), true);
assert.equal(shouldResetAcpSession("C:\\Work\\A", "C:\\Work\\A\\"), false);
assert.equal(shouldResetAcpSession("C:\\Work\\A", "C:\\Work\\B"), true);

console.log("acpSession tests passed");
