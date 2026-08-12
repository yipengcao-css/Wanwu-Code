import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { FileCloudClient } from "./client.js";
import { runCloudTaskLocally } from "./runner.js";
import { loadTask } from "./store.js";
import { unpackSnapshot, verifySnapshotSha256 } from "./snapshotUnpack.js";

export interface CloudServerOptions {
  port?: number;
  token: string;
  dataDir: string;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function text(res: ServerResponse, code: number, body: string): void {
  res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function auth(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const got = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Minimal remote runner: accepts tasks over HTTP and runs them in isolated
 * server-side workspaces using the existing local worktree runner.
 */
export function startCloudServer(opts: CloudServerOptions): ReturnType<typeof createServer> {
  const port = opts.port ?? Number(process.env.WANWU_CLOUD_PORT ?? 8787);
  const token = opts.token;
  const dataDir = opts.dataDir;

  if (!token) {
    throw new Error("WANWU_CLOUD_TOKEN is required to start cloud server");
  }

  const server = createServer(async (req, res) => {
    if (!auth(req, token)) {
      return json(res, 401, { error: "unauthorized" });
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

    if (req.method === "POST" && url.pathname === "/v1/tasks") {
      const bodyText = await readBody(req);
      let body: { prompt?: string; snapshotBase64?: string; snapshotSha256?: string };
      try {
        body = JSON.parse(bodyText || "{}") as typeof body;
      } catch {
        return json(res, 400, { error: "invalid json" });
      }
      if (!body.prompt) {
        return json(res, 400, { error: "prompt required" });
      }

      const workspaceId = `ws_${randomBytes(4).toString("hex")}`;
      const repoRoot = join(dataDir, "workspaces", workspaceId);
      mkdirSync(repoRoot, { recursive: true });

      if (body.snapshotBase64) {
        const snapshotPath = join(dataDir, "uploads", `${workspaceId}.tar.gz`);
        mkdirSync(join(dataDir, "uploads"), { recursive: true });
        writeFileSync(snapshotPath, Buffer.from(body.snapshotBase64, "base64"));
        if (body.snapshotSha256 && !verifySnapshotSha256(snapshotPath, body.snapshotSha256)) {
          return json(res, 400, { error: "snapshot sha256 mismatch" });
        }
        try {
          unpackSnapshot(snapshotPath, repoRoot);
        } catch (err) {
          return json(res, 400, {
            error: err instanceof Error ? err.message : "unpack failed",
          });
        }
      }

      const client = new FileCloudClient(repoRoot);
      const task = await client.submit(body.prompt);

      setImmediate(() => {
        try {
          runCloudTaskLocally({ repoRoot, taskId: task.id });
        } catch {
          /* runner updates task status */
        }
      });

      const stored = loadTask(repoRoot, task.id);
      return json(res, 202, {
        id: task.id,
        status: "queued",
        createdAt: stored?.createdAt,
        links: {
          status: `/v1/tasks/${task.id}?ws=${workspaceId}`,
          logs: `/v1/tasks/${task.id}/logs?ws=${workspaceId}`,
          diff: `/v1/tasks/${task.id}/diff?ws=${workspaceId}`,
        },
      });
    }

    const match = url.pathname.match(/^\/v1\/tasks\/([^/]+)(?:\/(logs|diff))?$/);
    if (req.method === "GET" && match) {
      const id = match[1]!;
      const kind = match[2];
      const ws = url.searchParams.get("ws");
      if (!ws) {
        return json(res, 400, { error: "ws query param required" });
      }
      const repoRoot = join(dataDir, "workspaces", ws);
      const task = loadTask(repoRoot, id);
      if (!task) {
        return json(res, 404, { error: "not found" });
      }
      if (!kind) {
        return json(res, 200, {
          id: task.id,
          status: task.status,
          prompt: task.prompt,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          exitCode: task.exitCode ?? null,
        });
      }
      const path = kind === "logs" ? task.logPath : task.diffPath;
      if (!path || !existsSync(path)) {
        return json(res, 404, { error: `${kind} not ready` });
      }
      return text(res, 200, readFileSync(path, "utf8"));
    }

    return json(res, 404, { error: "not found" });
  });

  server.listen(port);
  return server;
}
