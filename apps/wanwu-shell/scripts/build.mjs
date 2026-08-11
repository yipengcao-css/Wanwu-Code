import * as esbuild from "esbuild";
import { build as viteBuild } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./ensure-cli.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  external: ["electron"],
  sourcemap: true,
});

console.log("wanwu-shell build complete → dist/");
