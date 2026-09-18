import { createServer } from "node:http";
import { waitForHttp } from "./waitForHttp.mjs";

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

console.log("waitForHttp OK");
