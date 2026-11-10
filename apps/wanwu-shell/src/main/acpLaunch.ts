import { existsSync } from "node:fs";
import path from "node:path";
import { resolveBundledAcpLaunch, type BundledAcpLaunchPlan } from "@wanwu/acp-client";

export type AcpLaunchPlan = BundledAcpLaunchPlan;

export type AcpLaunchOptions = {
  workspaceRoot: string;
  isPackaged: boolean;
  resourcesPath?: string;
  execPath: string;
  repoRoot?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (p: string) => boolean;
};

/**
 * Resolve how to spawn wanwu-native ACP for the Electron shell.
 * Packaged / default path never depends on pnpm, tsx, or monorepo layout.
 */
export function resolveShellAcpLaunch(opts: AcpLaunchOptions): AcpLaunchPlan {
  const searchRoots: string[] = [];
  if (opts.isPackaged && opts.resourcesPath) {
    searchRoots.push(path.join(opts.resourcesPath, "wanwu-cli"));
  }
  if (opts.repoRoot) {
    searchRoots.push(path.join(opts.repoRoot, "dist-bin"));
  }

  try {
    return resolveBundledAcpLaunch({
      workspaceRoot: opts.workspaceRoot,
      execPath: opts.execPath,
      searchRoots,
      repoRoot: opts.isPackaged ? undefined : opts.repoRoot,
      env: opts.env,
      platform: opts.platform,
      arch: opts.arch,
      existsSync: opts.existsSync ?? existsSync,
      electronAsNode: true,
    });
  } catch (err) {
    if (opts.isPackaged) {
      throw new Error(
        "未找到随包 ACP 后端（resources/wanwu-cli 或 dist-bin/wanwu.mjs）。" +
          "请先运行 pnpm build:cli（开发）或重新构建安装包。",
      );
    }
    throw err;
  }
}
