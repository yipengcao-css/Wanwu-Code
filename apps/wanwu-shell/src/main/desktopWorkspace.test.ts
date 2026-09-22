import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktopProject, slugTaskName, uniqueProjectDir } from "./desktopWorkspace.ts";

assert.equal(slugTaskName("[MODE=agent] 修登录页 bug"), "修登录页-bug");
assert.equal(slugTaskName("fix: a/b:c"), "fix-abc");
assert.equal(slugTaskName("   "), "task");

const taken = new Set(["/desk/Wanwu-login", "/desk/Wanwu-login-2"]);
assert.equal(
  uniqueProjectDir("/desk", "login", (p) => taken.has(p)),
  join("/desk", "Wanwu-login-3"),
);

const desktop = mkdtempSync(join(tmpdir(), "wanwu-desk-"));
const first = createDesktopProject(desktop, "做个待办应用");
assert.ok(existsSync(join(first, "README.md")));
assert.match(readFileSync(join(first, "README.md"), "utf8"), /桌面自动创建/);
const second = createDesktopProject(desktop, "做个待办应用");
assert.notEqual(first, second);
assert.equal(readdirSync(desktop).length, 2);

const collide = join(desktop, "already");
mkdirSync(collide);
assert.ok(existsSync(collide));

console.log("desktopWorkspace tests passed");
