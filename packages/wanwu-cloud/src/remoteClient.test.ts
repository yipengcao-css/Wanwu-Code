import { describe, expect, it } from "vitest";
import { HttpCloudClient, isTerminalStatus } from "./remoteClient.js";

describe("HttpCloudClient", () => {
  it("submits and gets task", async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/v1/tasks") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "task_1", status: "queued", prompt: "x" }),
          { status: 202, headers: { "content-type": "application/json" } },
        );
      }
      if (String(url).endsWith("/v1/tasks/task_1")) {
        return new Response(
          JSON.stringify({ id: "task_1", status: "succeeded", prompt: "x" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const client = new HttpCloudClient({
      baseUrl: "http://localhost:8787",
      token: "secret",
      fetchImpl,
    });
    const submitted = await client.submit("x");
    expect(submitted.id).toBe("task_1");
    const got = await client.get("task_1");
    expect(got?.status).toBe("succeeded");
  });

  it("returns undefined on 404", async () => {
    const fetchImpl: typeof fetch = async () => new Response("no", { status: 404 });
    const client = new HttpCloudClient({
      baseUrl: "http://localhost:8787",
      token: "secret",
      fetchImpl,
    });
    expect(await client.get("missing")).toBeUndefined();
  });

  it("detects terminal status", () => {
    expect(isTerminalStatus("succeeded")).toBe(true);
    expect(isTerminalStatus("failed")).toBe(true);
    expect(isTerminalStatus("running")).toBe(false);
  });
});
