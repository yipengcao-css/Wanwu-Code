import { describe, expect, it } from "vitest";
import { InMemoryCloudClient } from "./index.js";

describe("wanwu-cloud stub", () => {
  it("queues tasks in memory", async () => {
    const client = new InMemoryCloudClient();
    const task = await client.submit("fix failing tests");
    expect(task.status).toBe("queued");
    expect((await client.get(task.id))?.prompt).toBe("fix failing tests");
  });
});