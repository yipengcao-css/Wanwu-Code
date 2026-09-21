import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readOAuthTokens, runOAuthLogin, writeOAuthTokens } from "./oauth.js";

describe("mcp oauth store", () => {
  const prev = process.env.WANWU_MCP_OAUTH_DIR;
  afterEach(() => {
    if (prev === undefined) delete process.env.WANWU_MCP_OAUTH_DIR;
    else process.env.WANWU_MCP_OAUTH_DIR = prev;
  });

  it("round-trips tokens under WANWU_MCP_OAUTH_DIR", () => {
    process.env.WANWU_MCP_OAUTH_DIR = mkdtempSync(join(tmpdir(), "wanwu-oauth-"));
    writeOAuthTokens("slack", { access_token: "tok", token_type: "Bearer" });
    expect(readOAuthTokens("slack")?.access_token).toBe("tok");
  });
});

describe("runOAuthLogin", () => {
  const prev = process.env.WANWU_MCP_OAUTH_DIR;
  afterEach(() => {
    if (prev === undefined) delete process.env.WANWU_MCP_OAUTH_DIR;
    else process.env.WANWU_MCP_OAUTH_DIR = prev;
  });

  it("exchanges the callback code on localhost", async () => {
    process.env.WANWU_MCP_OAUTH_DIR = mkdtempSync(join(tmpdir(), "wanwu-oauth-login-"));
    const tokenServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        expect(body).toContain("grant_type=authorization_code");
        expect(body).toContain("code=abc");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ access_token: "access-1", token_type: "Bearer", expires_in: 3600 }));
      });
    });
    await new Promise<void>((resolve) => tokenServer.listen(0, "127.0.0.1", () => resolve()));
    const tokenAddr = tokenServer.address();
    const tokenPort = typeof tokenAddr === "object" && tokenAddr ? tokenAddr.port : 0;

    let printed = "";
    const login = runOAuthLogin(
      "demo",
      {
        authorizationUrl: "https://example.test/authorize",
        tokenUrl: `http://127.0.0.1:${tokenPort}/token`,
        clientId: "cid",
      },
      { timeoutMs: 8000, print: (line) => { printed += `${line}\n`; } },
    );

    const started = Date.now();
    while (!printed.includes("state=") && Date.now() - started < 2000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const authLine = printed.split("\n").find((l) => l.includes("client_id="));
    expect(authLine).toBeTruthy();
    const auth = new URL(authLine!);
    const redirect = auth.searchParams.get("redirect_uri");
    const state = auth.searchParams.get("state");
    expect(redirect).toBeTruthy();
    const hit = await fetch(`${redirect}?code=abc&state=${state}`);
    expect(hit.ok).toBe(true);
    const tokens = await login;
    expect(tokens.access_token).toBe("access-1");
    expect(readOAuthTokens("demo")?.access_token).toBe("access-1");
    tokenServer.close();
  });
});
