import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteMemory, deleteRule, listMemories, listRules, writeRule } from "./library.ts";

const root = mkdtempSync(join(tmpdir(), "wanwu-lib-"));
writeRule(root, "react", "use hooks\n", "workspace");
writeRule(root, "react", "prefer existing spacing\n", "workspace");
const rules = listRules(root).filter((r) => r.scope === "workspace");
assert.equal(rules[0]?.body, "prefer existing spacing\n");
assert.equal(rules[0]?.name, "react");
assert.equal(rules.length, 1);
assert.equal(deleteRule(root, "react", "workspace"), true);
assert.equal(listRules(root).some((r) => r.scope === "workspace"), false);
assert.throws(() => writeRule(root, "../x", "no", "workspace"));

writeFileSync(join(root, "WANWU.md"), "# WANWU.md\n\n## Learned\n- (2026-10-09) keep tests\n- (2026-10-09) drop me\n\n## Notes\nkeep\n");
assert.equal(listMemories(root).length, 2);
assert.equal(deleteMemory(root, 1), true);
const left = listMemories(root);
assert.equal(left.length, 1);
assert.match(left[0]?.text ?? "", /keep tests/);
assert.match(readFileSync(join(root, "WANWU.md"), "utf8"), /## Notes/);

console.log("library tests passed");
