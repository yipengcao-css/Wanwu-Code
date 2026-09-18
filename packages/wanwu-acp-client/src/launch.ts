import { existsSync } from "node:fs";
import path from "node:path";

export type BundledAcpLaunchPlan = {
  command: string;
  args: string[];
  env: Record<string, string>;
  spawnCwd: string;
  backend: string;
};

export type BundledAcpLaunchOptions = {
  workspaceRoot: string;
  /** Node or Electron executable used to run wanwu.mjs / tsx. */
  execPath: string;
  /** Directories that may contain `wanwu`, `wanwu.exe`, or `wanwu.mjs`. */
  searchRoots?: string[];
  /** Monorepo root — enables dist-bin names + tsx fallback. */
  repoRoot?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  existsSync?: (p: string) => boolean;
  /** Set ELECTRON_RUN_AS_NODE when launching mjs via Electron. */
  electronAsNode?: boolean;
};

function nativeBinName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "wanwu.exe" : "wanwu";
}

function platformDistBinName(platform: NodeJS.Platform, arch: string, version: string): string {
  if (platform === "win32") return `wanwu-${version}-win-x64.exe`;
  if (platform === "darwin") {
    return arch === "arm64" ? `wanwu-${version}-macos-arm64` : `wanwu-${version}-macos-x64`;
  }
  return `wanwu-${version}-linux-x64`;
}

/**
 * Resolve wanwu-native ACP without pnpm/tsx when a bundled binary or mjs exists.
 * Override: WANWU_ACP_COMMAND.
 */
export function resolveBundledAcpLaunch(opts: BundledAcpLaunchOptions): BundledAcpLaunchPlan {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const env = opts.env ?? process.env;
  const exists = opts.existsSync ?? existsSync;
  const workspaceRoot = opts.workspaceRoot;
  const version = env.WANWU_CLI_VERSION?.trim() || "1.0.0-beta";

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

  const roots = [...(opts.searchRoots ?? [])];
  if (opts.repoRoot) {
    const dist = path.join(opts.repoRoot, "dist-bin");
    if (!roots.includes(dist)) roots.push(dist);
  }

  const names = [
    nativeBinName(platform),
    platformDistBinName(platform, arch, version),
    "wanwu.mjs",
  ];

  for (const dir of roots) {
    for (const name of names) {
      const file = path.join(dir, name);
      if (!exists(file)) continue;
      const backendPrefix = dir.replace(/\\/g, "/").includes("resources")
        ? "wanwu-native:bundled"
        : "wanwu-native:dist";
      if (name.endsWith(".mjs")) {
        return {
          command: opts.execPath,
          args: [file, "--wanwu-internal-acp"],
          env: {
            ...(opts.electronAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
            WANWU_WORKSPACE_ROOT: workspaceRoot,
            WANWU_INTERNAL_ACP: "1",
            WANWU_ACP_BACKEND: `${backendPrefix}-mjs`,
          },
          spawnCwd: workspaceRoot,
          backend: `${backendPrefix}-mjs`,
        };
      }
      return {
        command: file,
        args: ["--wanwu-internal-acp"],
        env: {
          WANWU_WORKSPACE_ROOT: workspaceRoot,
          WANWU_INTERNAL_ACP: "1",
          WANWU_ACP_BACKEND: `${backendPrefix}-bin`,
        },
        spawnCwd: workspaceRoot,
        backend: `${backendPrefix}-bin`,
      };
    }
  }

  if (opts.repoRoot) {
    const tsx = path.join(opts.repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
    const entry = path.join(opts.repoRoot, "packages", "wanwu-cli", "src", "index.ts");
    if (exists(tsx) && exists(entry)) {
      return {
        command: opts.execPath,
        args: [tsx, entry, "acp"],
        env: {
          WANWU_WORKSPACE_ROOT: workspaceRoot,
          WANWU_INTERNAL_ACP: "1",
          WANWU_ACP_BACKEND: "wanwu-native:tsx-dev",
        },
        spawnCwd: workspaceRoot,
        backend: "wanwu-native:tsx-dev",
      };
    }
  }

  throw new Error(
    "未找到 wanwu ACP 后端（bundled wanwu-cli / dist-bin / tsx 开发入口）。" +
      "请先运行 pnpm build:cli，或设置 WANWU_ACP_COMMAND。",
  );
}
