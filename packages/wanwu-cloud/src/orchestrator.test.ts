import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { orchestrateCloudTasks } from "./orchestrator.js";
import { openTaskPullRequest } from "./openPr.js";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wanwu-orch-"));
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "init"], {
    cwd: dir,
  });
  writeFileSync(join(dir, "README.md"), "# tmp\n", "utf8");
  spawnSync("git", ["add", "README.md"], { cwd: dir });
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-m", "readme"], {
    cwd: dir,
  });
  return dir;
}

const repos: string[] = [];

afterEach(() => {
  for (const r of repos.splice(0)) {
    spawnSync("git", ["worktree", "prune"], { cwd: r });
    rmSync(r, { recursive: true, force: true });
  }
});

describe("orchestrateCloudTasks", () => {
  it("runs two tasks concurrently without colliding on main", async () => {
    const repo = initRepo();
    repos.push(repo);

    const result = await orchestrateCloudTasks({
      repoRoot: repo,
      prompts: ["fix alpha isolation", "fix beta isolation"],
      concurrency: 2,
      openPr: true,
      prDryRun: true,
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.every((t) => t.status === "succeeded")).toBe(true);

    for (const t of result.tasks) {
      expect(t.worktree).toBeTruthy();
      expect(t.diffPath && existsSync(t.diffPath)).toBe(true);
      const diff = readFileSync(t.diffPath!, "utf8");
      expect(diff.length).toBeGreaterThan(10);
      expect(diff).toContain(t.id);
      // marker only in worktree, not main
      expect(existsSync(join(repo, ".wanwu", "cloud-markers", `${t.id}.txt`))).toBe(false);
      expect(existsSync(join(t.worktree!, ".wanwu", "cloud-markers", `${t.id}.txt`))).toBe(true);
      expect(existsSync(join(t.worktree!, ".wanwu", "plans"))).toBe(true);
    }

    // Distinct branches / worktrees
    const branches = new Set(result.tasks.map((t) => t.branch));
    const wts = new Set(result.tasks.map((t) => t.worktree));
    expect(branches.size).toBe(2);
    expect(wts.size).toBe(2);

    expect(result.prResults?.every((p) => p.ok && p.dryRun && p.draftPath)).toBe(true);
  }, 60_000);
});

describe("openTaskPullRequest", () => {
  it("records draft and mocks successful gh create", async () => {
    const repo = initRepo();
    repos.push(repo);
    const orch = await orchestrateCloudTasks({
      repoRoot: repo,
      prompts: ["pr path"],
      concurrency: 1,
    });
    const task = orch.tasks[0]!;
    expect(task.status).toBe("succeeded");

    const calls: string[] = [];
    const result = openTaskPullRequest({
      repoRoot: repo,
      taskId: task.id,
      dryRun: false,
      runner: ((cmd: string, args: string[]) => {
        calls.push([cmd, ...args].join(" "));
        if (cmd === "git" && args[0] === "push") {
          return { status: 0, stdout: "ok", stderr: "" } as ReturnType<typeof spawnSync>;
        }
        if (cmd === "gh") {
          return {
            status: 0,
            stdout: "https://github.com/example/Wanwu-Code/pull/42\n",
            stderr: "",
          } as ReturnType<typeof spawnSync>;
        }
        if (cmd === "git" && args[0] === "rev-parse") {
          return { status: 0, stdout: "origin/main\n", stderr: "" } as ReturnType<typeof spawnSync>;
        }
        return spawnSync(cmd, args, { encoding: "utf8" });
      }) as typeof spawnSync,
    });

    expect(result.ok).toBe(true);
    expect(result.prUrl).toBe("https://github.com/example/Wanwu-Code/pull/42");
    expect(calls.some((c) => c.includes("gh pr create --draft"))).toBe(true);
    expect(calls.some((c) => c.includes("git push"))).toBe(true);
  }, 60_000);
});
