import { createServer } from "node:http";
import { candidateDevUrls, waitForFirstHttp, waitForHttp } from "./waitForHttp.mjs";

{
  const both = candidateDevUrls("http://127.0.0.1:5173/");
  if (!both.includes("http://127.0.0.1:5173/") || !both.includes("http://localhost:5173/")) {
    throw new Error(`expected ipv4+localhost candidates, got ${both}`);
  }
}

function listen(host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
    server.listen(0, host, () => {
      const addr = server.address();
      resolve({ server, url: `http://${host}:${addr.port}/` });
    });
  });
}

const { server, url } = await listen();
try {
  await waitForHttp(url, { timeoutMs: 3000, intervalMs: 50 });
} finally {
  server.close();
}

let failed = false;
try {
  await waitForHttp("http://127.0.0.1:1/", { timeoutMs: 400, intervalMs: 50 });
} catch (err) {
  failed = String(err).includes("Timed out");
}
if (!failed) {
  throw new Error("expected timeout against a closed port");
}

{
  const { server, url } = await listen();
  try {
    const ready = await waitForFirstHttp(["http://127.0.0.1:1/", url], {
      timeoutMs: 3000,
      intervalMs: 50,
    });
    if (ready !== url) {
      throw new Error(`expected first live url ${url}, got ${ready}`);
    }
  } finally {
    server.close();
  }
}

console.log("waitForHttp OK");
