import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(shellRoot, "../..");
const mjs = path.join(repoRoot, "dist-bin", "wanwu.mjs");

if (!existsSync(mjs)) {
  console.log("==> ensure dist-bin/wanwu.mjs (ACP backend for shell)");
  const r = spawnSync("pnpm", ["build:cli"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error("failed to build CLI bundle — shell ACP will not start");
    if (process.platform === "win32") {
      console.error("Windows 请在仓库根目录执行: pnpm build:cli");
      console.error("该命令已改为 node scripts/build-cli.mjs，不再需要 Git Bash。");
    }
    process.exit(r.status ?? 1);
  }
}
