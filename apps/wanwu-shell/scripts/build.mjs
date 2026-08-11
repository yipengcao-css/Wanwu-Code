import { spawnSync } from "node:child_process";
import * as esbuild from "esbuild";
import { build as viteBuild } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./ensure-cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Rebuild native addons (node-pty) against the Electron ABI used at runtime.
const rebuild = spawnSync(
  "pnpm",
  ["exec", "electron-builder", "install-app-deps"],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
if (rebuild.status !== 0) {
  console.warn("warn: electron-builder install-app-deps failed; node-pty may need manual rebuild");
}

await viteBuild({
  configFile: path.join(root, "vite.config.ts"),
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

console.log("wanwu-shell build complete → dist/");
