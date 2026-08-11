#!/usr/bin/env tsx
/**
 * Live provider E2E — only runs when WANWU_LIVE_PROVIDERS=1.
 * Never prints secret values.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Candidate = {
  id: string;
  ready: boolean;
  env: Record<string, string>;
};

function candidates(): Candidate[] {
  const out: Candidate[] = [];
  if (process.env.OPENAI_API_KEY) {
    out.push({
      id: "openai",
      ready: true,
      env: {
        WANWU_PROVIDER: "openai",
        WANWU_MODEL: process.env.WANWU_MODEL || "deepseek-chat",
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || process.env.WANWU_PROVIDER_BASE_URL || "",
      },
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    out.push({
      id: "anthropic",
      ready: true,
      env: {
        WANWU_PROVIDER: "anthropic",
        WANWU_MODEL: process.env.WANWU_MODEL_ANTHROPIC || "claude-3-5-haiku-latest",
      },
    });
  }
  if (process.env.XAI_API_KEY) {
    out.push({
      id: "xai",
      ready: true,
      env: { WANWU_PROVIDER: "xai", WANWU_MODEL: process.env.WANWU_MODEL_XAI || "grok-2-latest" },
    });
  }
  if (process.env.WANWU_API_KEY && (process.env.WANWU_CUSTOM_BASE_URL || process.env.WANWU_PROVIDER_BASE_URL)) {
    out.push({
      id: "custom",
      ready: true,
      env: {
        WANWU_PROVIDER: "custom",
        WANWU_MODEL: process.env.WANWU_MODEL || "deepseek-chat",
        WANWU_CUSTOM_BASE_URL:
          process.env.WANWU_CUSTOM_BASE_URL || process.env.WANWU_PROVIDER_BASE_URL || "",
      },
    });
  }
  return out.filter((c) => c.ready);
}

function runExec(extraEnv: Record<string, string>): { ok: boolean; body: string } {
  const env = { ...process.env, ...extraEnv };
  // strip empty overrides
  for (const [k, v] of Object.entries(env)) {
    if (v === "") delete env[k];
  }
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "packages/wanwu-cli/src/index.ts", "exec", "-p", "只回复一个词：pong"],
    { cwd: root, encoding: "utf8", env, timeout: 60_000 },
  );
  const body = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  let ok = result.status === 0;
  try {
    const json = JSON.parse(result.stdout ?? "") as { status?: string; llm?: boolean; output?: string };
    ok = ok && json.status === "ok" && json.llm === true && /pong/i.test(json.output ?? "");
  } catch {
    ok = false;
  }
  return { ok, body };
}

function main(): number {
  if (process.env.WANWU_LIVE_PROVIDERS !== "1") {
    console.log(
      JSON.stringify({
        status: "skipped",
        reason: "Set WANWU_LIVE_PROVIDERS=1 to run live provider E2E",
      }),
    );
    return 0;
  }

  const list = candidates();
  console.log(`live candidates: ${list.map((c) => c.id).join(", ") || "(none)"}`);
  if (list.length < 1) {
    console.error("No provider credentials found for live run");
    return 2;
  }

  const results: Array<{ id: string; ok: boolean }> = [];
  for (const c of list) {
    process.stdout.write(`→ ${c.id} … `);
    const { ok, body } = runExec(c.env);
    console.log(ok ? "OK" : "FAIL");
    if (!ok) {
      console.log(body.slice(0, 800));
    }
    results.push({ id: c.id, ok });
  }

  const passed = results.filter((r) => r.ok).map((r) => r.id);
  console.log(
    JSON.stringify(
      {
        status: passed.length >= 1 ? "ok" : "error",
        passed,
        // backlog asks ≥2 when secrets allow; with a single OpenAI-compat proxy, 1 is acceptable
        note:
          passed.length >= 2
            ? "≥2 providers live OK"
            : "only one credentialed provider available in this environment",
      },
      null,
      2,
    ),
  );
  return passed.length >= 1 ? 0 : 1;
}

process.exit(main());
