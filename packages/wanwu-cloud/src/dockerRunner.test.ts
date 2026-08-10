import { describe, expect, it } from "vitest";
import { buildDockerRunArgs, dockerAvailable } from "./dockerRunner.js";

describe("docker runner", () => {
  it("reports docker availability without throwing", () => {
    expect(typeof dockerAvailable()).toBe("boolean");
  });

  it("builds a deterministic docker run argv", () => {
    const args = buildDockerRunArgs({
      repoRoot: "/repo",
      taskId: "task_1",
      prompt: "hello",
      image: "node:20.18.0-bookworm-slim",
    });
    expect(args).toContain("run");
    expect(args).toContain("/repo:/workspace");
    expect(args).toContain("WANWU_CLOUD_TASK_ID=task_1");
    expect(args).toContain("WANWU_CLOUD_PROMPT=hello");
    expect(args[args.length - 2]).toBe("bash");
    expect(args.at(-1)).toBe("/entrypoint.sh");
  });
});