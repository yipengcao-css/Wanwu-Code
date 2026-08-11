import { existsSync } from "node:fs";
import path from "node:path";

export type AcpLaunchPlan = {
  command: string;
  args: string[];
  /** Extra env merged onto process.env for the child. */
  env: Record<string, string>;
  spawnCwd: string;
  backend: string;
};

export type AcpLaunchOptions = {
  workspaceRoot: string;
  isPackaged: boolean;
  /** Electron process.resourcesPath (packaged). */
  resourcesPath?: string;
  /** Electron process.execPath. */
  execPath: string;
  /** Monorepo root when running from source / unpacked dist. */
  repoRoot?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (p: string) => boolean;
};

function nativeBinName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "wanwu.exe" : "wanwu";
}

function platformDistBinName(
  platform: NodeJS.Platform,
  arch: string,
  version: string,
): string {
  if (platform === "win32") return `wanwu-${version}-win-x64.exe`;
  if (platform === "darwin") {
    return arch === "arm64"
      ? `wanwu-${version}-macos-arm64`
      : `wanwu-${version}-macos-x64`;
  }
  return `wanwu-${version}-linux-x64`;
}

/**
 * Resolve how to spawn wanwu-native ACP for the Electron shell.
 * Packaged / default path never depends on pnpm, tsx, or monorepo layout.
 */
export function resolveShellAcpLaunch(opts: AcpLaunchOptions): AcpLaunchPlan {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const env = opts.env ?? process.env;
  const exists = opts.existsSync ?? existsSync;
  const workspaceRoot = opts.workspaceRoot;

  const override = env.WANWU_ACP_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    return {
      command: parts[0]!,
      args: parts.slice(1),
      env: { WANWU_WORKSPACE_ROOT: workspaceRoot },
      spawnCwd: workspaceRoot,
      backend: "env:WANWU_ACP_COMMAND",
    };
  }

  const candidates: Array<{
    kind: "native" | "mjs";
    file: string;
    backend: string;
  }> = [];

  if (opts.isPackaged && opts.resourcesPath) {
    const dir = path.join(opts.resourcesPath, "wanwu-cli");
    candidates.push({
      kind: "native",
      file: path.join(dir, nativeBinName(platform)),
      backend: "wanwu-native:bundled-bin",
    });
    candidates.push({
      kind: "mjs",
      file: path.join(dir, "wanwu.mjs"),
      backend: "wanwu-native:bundled-mjs",
    });
  }

  if (opts.repoRoot) {
    const distBin = path.join(opts.repoRoot, "dist-bin");
    const version = env.WANWU_CLI_VERSION?.trim() || "1.0.0-beta";
    candidates.push({
      kind: "native",
      file: path.join(distBin, nativeBinName(platform)),
      backend: "wanwu-native:dist-bin",
    });
    candidates.push({
      kind: "native",
      file: path.join(distBin, platformDistBinName(platform, arch, version)),
      backend: "wanwu-native:dist-bin",
    });
    candidates.push({
      kind: "mjs",
      file: path.join(distBin, "wanwu.mjs"),
      backend: "wanwu-native:dist-mjs",
    });
  }

  for (const c of candidates) {
    if (!exists(c.file)) continue;
    if (c.kind === "native") {
      return {
        command: c.file,
        args: ["--wanwu-internal-acp"],
        env: {
          WANWU_WORKSPACE_ROOT: workspaceRoot,
          WANWU_INTERNAL_ACP: "1",
          WANWU_ACP_BACKEND: c.backend,
        },
        spawnCwd: workspaceRoot,
        backend: c.backend,
      };
    }
    // ESM bundle via Electron-as-Node (no system node / pnpm / tsx).
    return {
      command: opts.execPath,
      args: [c.file, "--wanwu-internal-acp"],
      env: {
        ELECTRON_RUN_AS_NODE: "1",
        WANWU_WORKSPACE_ROOT: workspaceRoot,
        WANWU_INTERNAL_ACP: "1",
        WANWU_ACP_BACKEND: c.backend,
      },
      spawnCwd: workspaceRoot,
      backend: c.backend,
    };
  }

  throw new Error(
    "未找到随包 ACP 后端（resources/wanwu-cli 或 dist-bin/wanwu.mjs）。" +
      "请先运行 pnpm build:cli（开发）或重新构建安装包。",
  );
}
