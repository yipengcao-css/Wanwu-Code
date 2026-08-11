import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import electronPath from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const mainJs = path.join(root, "dist/electron/main.js");

if (!existsSync(mainJs)) {
  console.error("dist missing — run: pnpm --filter wanwu-shell build");
  process.exit(1);
}

const workspace =
  process.env.WANWU_SHELL_WORKSPACE ||
  path.join(repoRoot, "examples/failing-test-demo");

const child = spawn(electronPath, [mainJs, `--workspace=${workspace}`], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    WANWU_SHELL_WORKSPACE: workspace,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
