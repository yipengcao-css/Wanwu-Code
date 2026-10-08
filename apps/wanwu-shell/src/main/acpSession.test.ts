import assert from "node:assert/strict";
import { isUnknownSessionError, planSessionBind, shouldResetAcpSession } from "./acpSession.ts";

assert.equal(planSessionBind(undefined, new Set()), "create");
assert.equal(planSessionBind("  ", new Set(["a"])), "create");
assert.equal(planSessionBind("sess-b", new Set(["sess-a"])), "load");
assert.equal(planSessionBind("sess-a", new Set(["sess-a"])), "use");
assert.equal(isUnknownSessionError("unknown session"), true);
assert.equal(isUnknownSessionError("ACP not ready"), false);

assert.equal(shouldResetAcpSession(undefined, "/a"), false);
assert.equal(shouldResetAcpSession("/a", null), false);
assert.equal(shouldResetAcpSession("/a", "/a"), false);
assert.equal(shouldResetAcpSession("/a", "/a/"), false);
assert.equal(shouldResetAcpSession("/old", "/new"), true);
assert.equal(shouldResetAcpSession("C:\\Work\\A", "C:\\Work\\A\\"), false);
assert.equal(shouldResetAcpSession("C:\\Work\\A", "C:\\Work\\B"), true);

console.log("acpSession tests passed");
