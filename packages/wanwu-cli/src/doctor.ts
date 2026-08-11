import { spawnSync } from "node:child_process";
import {
  loadWanwuConfig,
  listConfiguredProviders,
  userConfigPath,
  type ProviderId,
  type WanwuConfig,
} from "@wanwu/config";
import { hasProviderCredentials, resolveProvider } from "@wanwu/providers";
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

function providerStatus(config: WanwuConfig, id: ProviderId): DoctorFinding {
  const pc = config.providers[id];
  if (!pc) {
    return { level: "warn", code: `provider.${id}`, message: `${id}: not in config` };
  }
  if (id === "ollama") {
    const base = process.env.OLLAMA_BASE_URL || pc.baseUrl || "http://127.0.0.1:11434";
    return {
      level: "ok",
      code: `provider.${id}`,
      message: `${id}: no API key required · base=${base} (ensure ollama serve)`,
    };
  }
  const envName = pc.apiKeyEnv ?? "?";
  const set = Boolean(process.env[envName]);
  const baseHint =
    id === "openai" && process.env.OPENAI_BASE_URL
      ? ` · OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL}`
      : pc.baseUrl
        ? ` · base_url=${pc.baseUrl}`
        : "";
  if (set) {
    return {
      level: "ok",
      code: `provider.${id}`,
      message: `${id}: ${envName} set${baseHint}`,
    };
  }
  return {
    level: "warn",
    code: `provider.${id}`,
    message: `${id}: ${envName} missing — export ${envName}=... or edit ${userConfigPath()}${baseHint}`,
  };
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
    message: `activeProvider=${config.activeProvider} model=${process.env.WANWU_MODEL ?? config.model} acpBackend=${config.acpBackend}`,
  });

  findings.push({
    level: "ok",
    code: "config.providers",
    message: `providers (parity): ${listConfiguredProviders(config).join(", ")}`,
  });

  for (const id of listConfiguredProviders(config)) {
    findings.push(providerStatus(config, id));
  }

  const override = process.env.WANWU_PROVIDER?.trim() as ProviderId | undefined;
  const activeId = override || config.activeProvider;
  if (hasProviderCredentials(config, { providerId: override })) {
    try {
      const resolved = resolveProvider(config, { providerId: override });
      findings.push({
        level: "ok",
        code: "provider.active.ready",
        message: `LLM ready: ${resolved.id} model=${resolved.model} base=${resolved.baseUrl}`,
      });
    } catch {
      /* unreachable when hasProviderCredentials true */
    }
  } else {
    findings.push({
      level: "warn",
      code: "provider.active.ready",
      message: `LLM not ready for ${activeId} — wanwu exec will use deterministic native loop. Fix: export key / OPENAI_BASE_URL for proxies (e.g. DeepSeek) / WANWU_FORCE_DETERMINISTIC=1 to silence`,
    });
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
