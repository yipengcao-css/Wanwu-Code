import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AgentBackendInfo } from "../../shared/ipc.js";

export type BackendChoice = "mock" | "cli";

export interface ResolvedBackend {
  info: AgentBackendInfo;
  /** Executable to spawn (always the Electron binary run as plain Node). */
  command: string;
  args: string[];
  /** Extra env to merge so the backend script runs under Node semantics. */
  env: NodeJS.ProcessEnv;
}

/**
 * Directory that holds the bundled single-file backends. In a packaged app the
 * bundles live next to the app under `resources/backend`; in dev they are
 * produced by `scripts/bundle-backend.mjs` into `apps/wanwu-ide/resources`.
 */
function backendDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "backend");
  }
  return join(app.getAppPath(), "resources");
}

/**
 * Resolve which process backs the Agent panel.
 *
 * P0-1: the IDE never shells out to `pnpm`/`tsx` and never assumes a monorepo
 * checkout. It ships its own single-file Node backend and executes it with the
 * bundled Electron binary running as Node (`ELECTRON_RUN_AS_NODE`), so it works
 * identically in dev and inside a packaged installer.
 *
 * Override order:
 *   1. `WANWU_ACP_COMMAND` env — run an arbitrary command line verbatim.
 *   2. `choice === "cli"` — run the bundled `wanwu` CLI in `acp` mode
 *      (bridges to Grok Build / a configured provider).
 *   3. `choice === "mock"` (default) — run the bundled mock ACP server so the
 *      product is demonstrable with zero external model credentials.
 */
export function resolveBackend(choice: BackendChoice): ResolvedBackend {
  const override = process.env.WANWU_ACP_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    return {
      info: {
        backend: "env:WANWU_ACP_COMMAND",
        command: parts[0]!,
        args: parts.slice(1),
        packaged: app.isPackaged,
      },
      command: parts[0]!,
      args: parts.slice(1),
      env: {},
    };
  }

  const dir = backendDir();
  const script = choice === "cli" ? join(dir, "wanwu-cli.mjs") : join(dir, "wanwu-mock-acp.mjs");
  const scriptArgs = choice === "cli" ? [script, "acp"] : [script];
  const backend = choice === "cli" ? "wanwu-cli-acp" : "wanwu-mock-acp";

  if (!existsSync(script)) {
    throw new Error(
      `Bundled ACP backend not found: ${script}. Run "pnpm --filter @wanwu/ide bundle:backend".`,
    );
  }

  return {
    info: {
      backend,
      command: process.execPath,
      args: scriptArgs,
      packaged: app.isPackaged,
    },
    command: process.execPath,
    args: scriptArgs,
    env: { ELECTRON_RUN_AS_NODE: "1" },
  };
}
