#!/usr/bin/env tsx
/**
 * Live provider E2E — only runs when WANWU_LIVE_PROVIDERS=1.
 * Never prints secret values.
 *
 * Supports multiple OpenAI-compatible endpoints:
 * - Primary: OPENAI_API_KEY + OPENAI_BASE_URL (+ WANWU_MODEL)
 * - Secondary: WANWU_LIVE_OPENAI_2_KEY + WANWU_LIVE_OPENAI_2_BASE_URL (+ WANWU_LIVE_OPENAI_2_MODEL)
 * - custom: WANWU_API_KEY + WANWU_CUSTOM_BASE_URL
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
    const base = process.env.OPENAI_BASE_URL || process.env.WANWU_PROVIDER_BASE_URL || "";
    const id = /deepseek/i.test(base)
      ? "openai-deepseek"
      : /moonshot/i.test(base)
        ? "openai-moonshot"
        : "openai";
    out.push({
      id,
      ready: true,
      env: {
        WANWU_PROVIDER: "openai",
        WANWU_MODEL: process.env.WANWU_MODEL || "deepseek-chat",
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL: base,
      },
    });
  }

  if (process.env.WANWU_LIVE_OPENAI_2_KEY && process.env.WANWU_LIVE_OPENAI_2_BASE_URL) {
    const base = process.env.WANWU_LIVE_OPENAI_2_BASE_URL;
    const id = /moonshot/i.test(base)
      ? "openai-moonshot"
      : /deepseek/i.test(base)
        ? "openai-deepseek-2"
        : "openai-compat-2";
    out.push({
      id,
      ready: true,
      env: {
        WANWU_PROVIDER: "openai",
        WANWU_MODEL: process.env.WANWU_LIVE_OPENAI_2_MODEL || "moonshot-v1-8k",
        OPENAI_API_KEY: process.env.WANWU_LIVE_OPENAI_2_KEY,
        OPENAI_BASE_URL: base,
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
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      },
    });
  }
  if (process.env.XAI_API_KEY) {
    out.push({
      id: "xai",
      ready: true,
      env: {
        WANWU_PROVIDER: "xai",
        WANWU_MODEL: process.env.WANWU_MODEL_XAI || "grok-2-latest",
        XAI_API_KEY: process.env.XAI_API_KEY,
      },
    });
  }
  if (process.env.WANWU_API_KEY && (process.env.WANWU_CUSTOM_BASE_URL || process.env.WANWU_PROVIDER_BASE_URL)) {
    out.push({
      id: "custom",
      ready: true,
      env: {
        WANWU_PROVIDER: "custom",
        WANWU_MODEL: process.env.WANWU_MODEL_CUSTOM || process.env.WANWU_MODEL || "deepseek-chat",
        WANWU_API_KEY: process.env.WANWU_API_KEY,
        WANWU_CUSTOM_BASE_URL:
          process.env.WANWU_CUSTOM_BASE_URL || process.env.WANWU_PROVIDER_BASE_URL || "",
      },
    });
  }
  return out.filter((c) => c.ready);
}

function extractJson(stdout: string): { status?: string; llm?: boolean; output?: string } | null {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start)) as { status?: string; llm?: boolean; output?: string };
  } catch {
    return null;
  }
}

function runExec(extraEnv: Record<string, string>): { ok: boolean; body: string } {
  const env = { ...process.env, ...extraEnv };
  for (const [k, v] of Object.entries(env)) {
    if (v === "") delete env[k];
  }
  // Avoid leaking primary key into secondary run
  if (extraEnv.OPENAI_API_KEY) {
    env.OPENAI_API_KEY = extraEnv.OPENAI_API_KEY;
  }
  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "packages/wanwu-cli/src/index.ts", "exec", "-p", "只回复一个词：pong"],
    { cwd: root, encoding: "utf8", env, timeout: 90_000 },
  );
  const body = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const json = extractJson(result.stdout ?? "");
  const ok =
    result.status === 0 &&
    json?.status === "ok" &&
    json.llm === true &&
    /pong/i.test(json.output ?? "");
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
      console.log(body.replace(/sk-[A-Za-z0-9_-]+/g, "sk-***").slice(0, 900));
    }
    results.push({ id: c.id, ok });
  }

  const passed = results.filter((r) => r.ok).map((r) => r.id);
  const requireTwo = process.env.WANWU_LIVE_REQUIRE_TWO === "1";
  const status = requireTwo
    ? passed.length >= 2
      ? "ok"
      : "error"
    : passed.length >= 1
      ? "ok"
      : "error";
  console.log(
    JSON.stringify(
      {
        status,
        passed,
        note:
          passed.length >= 2
            ? "≥2 providers live OK"
            : "fewer than 2 live providers passed",
      },
      null,
      2,
    ),
  );
  return status === "ok" ? 0 : 1;
}

process.exit(main());
