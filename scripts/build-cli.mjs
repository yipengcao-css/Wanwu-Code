#!/usr/bin/env node
/**
 * Bundle a single-file Node CLI entry for local install / CI artifact.
 * Node-only so Windows `pnpm shell:dev` does not require Git Bash.
 */
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

export function stripLeadingShebang(source) {
  if (!source.startsWith("#!")) return source;
  const nl = source.indexOf("\n");
  return nl === -1 ? "" : source.slice(nl + 1);
}

export function withNodeShebang(source) {
  return `#!/usr/bin/env node\n${stripLeadingShebang(source)}`;
}

export async function buildCliBundle(repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const dist = path.join(repoRoot, "dist-bin");
  const body = path.join(dist, "wanwu.body.mjs");
  const out = path.join(dist, "wanwu.mjs");
  const entry = path.join(repoRoot, "packages/wanwu-cli/src/index.ts");

  await mkdir(dist, { recursive: true });
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: body,
    packages: "bundle",
  });

  const compiled = await readFile(body, "utf8");
  await writeFile(out, withNodeShebang(compiled), "utf8");
  await unlink(body);
  if (process.platform !== "win32") {
    await chmod(out, 0o755);
  }

  const check = spawnSync(process.execPath, [out, "help"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
  if (check.status !== 0) {
    throw new Error(
      `dist-bin/wanwu.mjs help failed (exit ${check.status}): ${check.stderr || check.stdout}`,
    );
  }

  const preview = (check.stdout || "").split(/\r?\n/).slice(0, 8).join("\n");
  console.log("built dist-bin/wanwu.mjs");
  if (preview) console.log(preview);
  return out;
}

const invokedDirectly =
  Boolean(process.argv[1]) &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  try {
    await buildCliBundle();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
