import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import electronPath from "electron";
import "./ensure-cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");

const vite = spawn(
  "pnpm",
  ["exec", "vite", "--config", path.join(root, "vite.config.ts")],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);

await esbuild.build({
  entryPoints: {
    main: path.join(root, "src/main/main.ts"),
    preload: path.join(root, "src/main/preload.ts"),
  },
  outdir: path.join(root, "dist/electron"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["electron", "node-pty"],
  sourcemap: true,
});

// wait briefly for vite
await new Promise((r) => setTimeout(r, 1200));

const workspace =
  process.env.WANWU_SHELL_WORKSPACE ||
  path.join(repoRoot, "examples/failing-test-demo");

const elec = spawn(electronPath, [path.join(root, "dist/electron/main.js")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    WANWU_SHELL_DEV_URL: "http://127.0.0.1:5173/",
    WANWU_SHELL_WORKSPACE: workspace,
  },
});

function shutdown() {
  vite.kill();
  elec.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

elec.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
