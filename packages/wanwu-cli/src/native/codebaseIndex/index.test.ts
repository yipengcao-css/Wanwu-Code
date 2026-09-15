import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkFile, looksBinary } from "./chunker.js";
import { ensureCodebaseIndex, tokenize } from "./indexer.js";
import { formatSearchHits, searchCodebase } from "./search.js";
import type { WanwuConfig } from "@wanwu/config";

function seedWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), "wanwu-idx-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "src", "auth.ts"),
    "export function verifyToken(token: string) {\n  // validate jwt signature and expiry\n  return token.length > 10;\n}\n",
    "utf8",
  );
  writeFileSync(
    join(root, "src", "math.ts"),
    "export function fibonacci(n: number): number {\n  return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);\n}\n",
    "utf8",
  );
  writeFileSync(join(root, "README.md"), "# Demo\n\nauthentication and math utils\n", "utf8");
  return root;
}

describe("chunkFile", () => {
  it("splits line-aligned with overlap", () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i} ${"x".repeat(20)}`).join("\n");
    const chunks = chunkFile(text, 500, 2);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.startLine).toBe(1);
    // overlap: next chunk starts before previous ended
    expect(chunks[1]!.startLine).toBeLessThanOrEqual(chunks[0]!.endLine);
    // full coverage
    expect(chunks.at(-1)!.endLine).toBe(100);
  });

  it("handles single huge line", () => {
    const chunks = chunkFile("x".repeat(5000), 500);
    expect(chunks).toHaveLength(1);
  });
});

describe("keyword index", () => {
  it("tokenizes identifiers and CJK runs", () => {
    expect(tokenize("verifyToken 验证逻辑")).toContain("verifytoken");
    expect(tokenize("verifyToken 验证逻辑")).toContain("验证逻辑");
  });

  it("builds keyword index and ranks relevant chunks first", async () => {
    const root = seedWorkspace();
    const r = await searchCodebase(root, "jwt token validation", { forceKeyword: true });
    expect(r.mode).toBe("keyword");
    expect(r.hits[0]!.path).toBe("src/auth.ts");
    expect(formatSearchHits(r.hits)).toContain("src/auth.ts:1-");
  });

  it("incremental: unchanged files are not re-chunked", async () => {
    const root = seedWorkspace();
    const first = await ensureCodebaseIndex(root, { forceKeyword: true });
    expect(first.updatedFiles).toBe(3);
    const second = await ensureCodebaseIndex(root, { forceKeyword: true });
    expect(second.updatedFiles).toBe(0);
    writeFileSync(join(root, "src", "new.ts"), "export const fresh = true;\n", "utf8");
    const third = await ensureCodebaseIndex(root, { forceKeyword: true });
    expect(third.updatedFiles).toBe(1);
  });
});

describe("embeddings index", () => {
  const config = {
    activeProvider: "openai",
    model: "fixture",
    permissionMode: "ask",
    sandbox: "off",
    acpBackend: "wanwu-native",
    defaultMode: "ask",
    providers: {
      openai: { apiKeyEnv: "OPENAI_API_KEY", baseUrl: "https://fixture.local/v1", defaultModel: "m" },
    },
  } as WanwuConfig;

  function fakeEmbedFetch(vectorFor: (text: string) => number[]): typeof fetch {
    return (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { input?: string[] };
      const vectors = (body.input ?? []).map((t, i) => ({ embedding: vectorFor(t), index: i }));
      return new Response(JSON.stringify({ data: vectors }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  }

  const env = { OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv;

  it("builds embeddings index and searches semantically", async () => {
    const root = seedWorkspace();
    // orthogonal toy dimensions: auth → [1,0,0], math → [0,1,0], else → [0,0,1]
    const vectorFor = (t: string): number[] =>
      /token|jwt/i.test(t) ? [1, 0, 0] : /fibonacci|math/i.test(t) ? [0, 1, 0] : [0, 0, 1];
    const fetchImpl = fakeEmbedFetch(vectorFor);
    const r = await searchCodebase(root, "where is jwt token verified", {
      config,
      fetchImpl,
      env,
    });
    expect(r.mode).toBe("embeddings");
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits[0]!.path).toBe("src/auth.ts");
  });

  it("degrades to keyword when embeddings fail", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-idx-degrade-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src", "math.ts"),
      "export function fibonacci(n: number): number {\n  return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);\n}\n",
      "utf8",
    );
    // retries off so the 500 fails fast
    process.env.WANWU_HTTP_RETRIES = "0";
    const fetchImpl = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const r = await searchCodebase(root, "fibonacci", { config, fetchImpl, env });
    delete process.env.WANWU_HTTP_RETRIES;
    expect(r.hits[0]!.path).toBe("src/math.ts");
  });

  it("looksBinary detects NUL bytes", () => {
    expect(looksBinary("a\0b")).toBe(true);
    expect(looksBinary("plain text")).toBe(false);
  });
});
