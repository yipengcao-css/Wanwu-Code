import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { McpOAuthConfig } from "./types.js";

export type McpOAuthTokens = {
  access_token: string;
  token_type?: string;
  expires_at?: number;
  refresh_token?: string;
  scope?: string;
};

export function oauthStoreDir(): string {
  return process.env.WANWU_MCP_OAUTH_DIR?.trim() || join(homedir(), ".wanwu", "mcp-oauth");
}

export function oauthTokenPath(server: string): string {
  const safe = server.replace(/[^a-zA-Z0-9._-]/g, "_") || "server";
  return join(oauthStoreDir(), `${safe}.json`);
}

export function readOAuthTokens(server: string): McpOAuthTokens | undefined {
  const path = oauthTokenPath(server);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as McpOAuthTokens;
  } catch {
    return undefined;
  }
}

export function writeOAuthTokens(server: string, tokens: McpOAuthTokens): void {
  mkdirSync(oauthStoreDir(), { recursive: true, mode: 0o700 });
  const path = oauthTokenPath(server);
  writeFileSync(path, JSON.stringify(tokens, null, 2), { encoding: "utf8", mode: 0o600 });
}

function expiresAt(expiresIn: unknown): number | undefined {
  const n = Number(expiresIn);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Date.now() + n * 1000;
}

async function tokenRequest(
  tokenUrl: string,
  body: Record<string, string>,
): Promise<McpOAuthTokens> {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`oauth token exchange failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const json = JSON.parse(text) as Record<string, unknown>;
  if (typeof json.access_token !== "string") {
    throw new Error("oauth token response missing access_token");
  }
  return {
    access_token: json.access_token,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
    expires_at: expiresAt(json.expires_in),
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    scope: typeof json.scope === "string" ? json.scope : undefined,
  };
}

export async function refreshOAuthTokens(
  server: string,
  oauth: McpOAuthConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<McpOAuthTokens | undefined> {
  const prev = readOAuthTokens(server);
  if (!prev?.refresh_token) return prev;
  if (prev.expires_at && prev.expires_at - 30_000 > Date.now()) return prev;
  const secret = oauth.clientSecretEnv ? env[oauth.clientSecretEnv] : undefined;
  const next = await tokenRequest(oauth.tokenUrl, {
    grant_type: "refresh_token",
    refresh_token: prev.refresh_token,
    client_id: oauth.clientId,
    ...(secret ? { client_secret: secret } : {}),
  });
  const merged: McpOAuthTokens = {
    ...next,
    refresh_token: next.refresh_token ?? prev.refresh_token,
  };
  writeOAuthTokens(server, merged);
  return merged;
}

export async function authorizationHeader(
  server: string,
  oauth: McpOAuthConfig | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  if (!oauth) {
    const stored = readOAuthTokens(server);
    return stored?.access_token ? `${stored.token_type ?? "Bearer"} ${stored.access_token}` : undefined;
  }
  const tokens = await refreshOAuthTokens(server, oauth, env).catch(() => readOAuthTokens(server));
  if (!tokens?.access_token) return undefined;
  return `${tokens.token_type ?? "Bearer"} ${tokens.access_token}`;
}

/**
 * Authorization-code login on 127.0.0.1 (random port).
 * Prints the authorize URL; does not open a browser.
 */
export async function runOAuthLogin(
  server: string,
  oauth: McpOAuthConfig,
  opts?: { env?: NodeJS.ProcessEnv; timeoutMs?: number; print?: (line: string) => void },
): Promise<McpOAuthTokens> {
  const env = opts?.env ?? process.env;
  const print = opts?.print ?? ((line: string) => process.stdout.write(`${line}\n`));
  const state = randomBytes(16).toString("hex");
  const secret = oauth.clientSecretEnv ? env[oauth.clientSecretEnv] : undefined;

  return new Promise<McpOAuthTokens>((resolve, reject) => {
    const serverHttp = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? "/", `http://127.0.0.1`);
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        if (url.searchParams.get("state") !== state) {
          res.writeHead(400);
          res.end("state mismatch");
          return;
        }
        const err = url.searchParams.get("error");
        if (err) {
          res.writeHead(400);
          res.end(`oauth error: ${err}`);
          reject(new Error(err));
          serverHttp.close();
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400);
          res.end("missing code");
          return;
        }
        const addr = serverHttp.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        const tokens = await tokenRequest(oauth.tokenUrl, {
          grant_type: "authorization_code",
          code,
          redirect_uri: `http://127.0.0.1:${port}/callback`,
          client_id: oauth.clientId,
          ...(secret ? { client_secret: secret } : {}),
        });
        writeOAuthTokens(server, tokens);
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end("Wanwu MCP 登录成功，可以关闭此页。");
        resolve(tokens);
        serverHttp.close();
      } catch (e) {
        res.writeHead(500);
        res.end("token exchange failed");
        reject(e instanceof Error ? e : new Error(String(e)));
        serverHttp.close();
      }
    });

    const timer = setTimeout(() => {
      serverHttp.close();
      reject(new Error("oauth login timed out"));
    }, opts?.timeoutMs ?? 180_000);

    serverHttp.listen(0, "127.0.0.1", () => {
      const addr = serverHttp.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const redirect = `http://127.0.0.1:${port}/callback`;
      const authorize = new URL(oauth.authorizationUrl);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", oauth.clientId);
      authorize.searchParams.set("redirect_uri", redirect);
      authorize.searchParams.set("state", state);
      if (oauth.scope) authorize.searchParams.set("scope", oauth.scope);
      print(`在浏览器打开并授权：\n${authorize.toString()}`);
      print(`回调监听 ${redirect}（密钥只写 ~/.wanwu/mcp-oauth，不进仓库）`);
    });

    serverHttp.on("close", () => clearTimeout(timer));
  });
}
