import { spawnSync } from "node:child_process";
import { findExtensionWorkspaceRoot } from "../workspaceRoot";

/** Load merged Wanwu config via the shared CLI (`wanwu inspect`). */
export function loadExtensionConfig(): unknown {
  const root = findExtensionWorkspaceRoot();
  const result = spawnSync("pnpm", ["wanwu", "inspect"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || "wanwu inspect failed");
  }
  // pnpm may wrap logs; find JSON object in stdout
  const stdout = result.stdout ?? "";
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error("wanwu inspect did not return JSON");
  }
  return JSON.parse(stdout.slice(start, end + 1)) as unknown;
}