import assert from "node:assert/strict";
import { resolveShell } from "./shellResolve.ts";

{
  const plan = resolveShell({
    platform: "win32",
    env: { Path: "C:\\fake", PATHEXT: ".EXE" },
    which: (cmd) => (cmd === "pwsh" || cmd === "pwsh.exe" ? "C:\\Program Files\\PowerShell\\7\\pwsh.exe" : undefined),
    existsSync: () => false,
  });
  assert.equal(plan.label, "pwsh");
  assert.match(plan.file, /pwsh\.exe$/i);
  assert.deepEqual(plan.args, ["-NoLogo"]);
}

{
  const plan = resolveShell({
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe", Path: "" },
    which: () => undefined,
    existsSync: (p) => p.toLowerCase().includes("cmd.exe"),
  });
  assert.equal(plan.label, "cmd");
  assert.equal(plan.file, "C:\\Windows\\System32\\cmd.exe");
}

{
  const plan = resolveShell({
    platform: "linux",
    env: { SHELL: "/usr/bin/zsh" },
    existsSync: (p) => p === "/usr/bin/zsh",
  });
  assert.equal(plan.file, "/usr/bin/zsh");
  assert.deepEqual(plan.args, ["-l"]);
}

{
  const plan = resolveShell({
    platform: "linux",
    env: {},
    existsSync: (p) => p === "/bin/bash",
  });
  assert.equal(plan.file, "/bin/bash");
  assert.deepEqual(plan.args, ["-l"]);
}

{
  // Must never hardcode bash on Windows even if SHELL is set oddly
  const plan = resolveShell({
    platform: "win32",
    env: { SHELL: "/bin/bash", ComSpec: "C:\\Windows\\System32\\cmd.exe" },
    which: () => undefined,
    existsSync: (p) => p.includes("cmd.exe"),
  });
  assert.notEqual(plan.file, "/bin/bash");
  assert.equal(plan.label, "cmd");
}

console.log("shellResolve tests passed");
