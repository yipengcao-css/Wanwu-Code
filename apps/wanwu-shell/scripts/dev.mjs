import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import electronPath from "electron";
import "./ensure-cli.mjs";
import { candidateDevUrls, waitForFirstHttp } from "./waitForHttp.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(root, "../..");
const preferredUrl = process.env.WANWU_SHELL_DEV_URL || "http://127.0.0.1:5173/";
const viteConfig = path.join(root, "vite.config.ts");

let viteExit = null;
const viteCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const vite = spawn(
  viteCmd,
  [
    "exec",
    "vite",
    "--config",
    viteConfig,
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32", windowsHide: true },
);
vite.on("exit", (code) => {
  viteExit = code;
});

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

const probeUrls = candidateDevUrls(preferredUrl);
console.log(`==> waiting for Vite ${probeUrls.join(" 或 ")}`);
const devUrl = await waitForFirstHttp(probeUrls, {
  shouldAbort: () =>
    viteExit !== null ? `Vite 已退出（exit ${viteExit}），无法启动 Electron` : null,
});
console.log(`==> Vite ready · ${devUrl}`);

const workspace =
  process.env.WANWU_SHELL_WORKSPACE ||
  path.join(repoRoot, "examples/failing-test-demo");

const elec = spawn(electronPath, [path.join(root, "dist/electron/main.js")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    WANWU_SHELL_DEV_URL: devUrl,
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
