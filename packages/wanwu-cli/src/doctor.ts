import { spawnSync } from "node:child_process";
import { loadWanwuConfig, listConfiguredProviders, userConfigPath } from "@wanwu/config";
import { discoverMemory } from "./memory.js";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export interface DoctorFinding {
  level: "ok" | "warn" | "error";
  code: string;
  message: string;
}

function commandExists(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(probe, [cmd], { encoding: "utf8" });
  return result.status === 0;
}

export function runDoctor(cwd: string = findWorkspaceRoot()): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const { config, sources } = loadWanwuConfig(cwd);
  findings.push({
    level: "ok",
    code: "workspace.root",
    message: `workspace root: ${cwd}`,
  });

  findings.push({
    level: "ok",
    code: "config.sources",
    message: `config sources: ${sources.join(" → ")}`,
  });

  findings.push({
    level: "ok",
    code: "config.active",
    message: `activeProvider=${config.activeProvider} model=${config.model} acpBackend=${config.acpBackend}`,
  });

  findings.push({
    level: "ok",
    code: "config.providers",
    message: `providers (parity): ${listConfiguredProviders(config).join(", ")}`,
  });

  const provider = config.providers[config.activeProvider];
  if (provider?.apiKeyEnv) {
    if (process.env[provider.apiKeyEnv]) {
      findings.push({
        level: "ok",
        code: "provider.key",
        message: `${provider.apiKeyEnv} is set`,
      });
    } else {
      findings.push({
        level: "warn",
        code: "provider.key",
        message: `${provider.apiKeyEnv} is not set (BYOK). Export it or edit ${userConfigPath()}`,
      });
    }
  }

  if (config.acpBackend === "wanwu-native") {
    findings.push({
      level: "ok",
      code: "acp.native",
      message: "acp_backend=wanwu-native (no grok binary required)",
    });
  } else if (config.acpBackend === "grok") {
    if (commandExists("grok")) {
      findings.push({
        level: "ok",
        code: "acp.grok",
        message: "grok binary found on PATH (ACP bridge available)",
      });
    } else {
      findings.push({
        level: "warn",
        code: "acp.grok",
        message:
          "grok not found on PATH. Install Grok Build (https://x.ai/cli), set WANWU_ACP_COMMAND, or switch acp_backend=wanwu-native",
      });
    }
  }

  const memory = discoverMemory(cwd);
  if (memory.length === 0) {
    findings.push({
      level: "warn",
      code: "memory.none",
      message: "No WANWU.md / AGENTS.md / CLAUDE.md in workspace",
    });
  } else {
    findings.push({
      level: "ok",
      code: "memory.found",
      message: `memory files: ${memory.map((m) => m.kind).join(", ")}`,
    });
  }

  findings.push({
    level: "ok",
    code: "safety",
    message: `permissionMode=${config.permissionMode} sandbox=${config.sandbox}`,
  });

  return findings;
}

export function printDoctor(findings: DoctorFinding[]): number {
  let errors = 0;
  for (const f of findings) {
    const tag = f.level.toUpperCase().padEnd(5);
    console.log(`[${tag}] ${f.code}: ${f.message}`);
    if (f.level === "error") errors += 1;
  }
  return errors > 0 ? 1 : 0;
}