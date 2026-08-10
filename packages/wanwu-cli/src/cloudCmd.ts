import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  FileCloudClient,
  buildDockerRunnerImage,
  dockerAvailable,
  listTasks,
  loadTask,
  runCloudTaskInDocker,
  runCloudTaskLocally,
} from "@wanwu/cloud";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export async function runCloudCommand(args: string[]): Promise<number> {
  const cwd = findWorkspaceRoot();
  const client = new FileCloudClient(cwd);
  const [sub, ...rest] = args;

  switch (sub) {
    case "submit": {
      let prompt = "";
      let runNow = false;
      let useDocker = false;
      let rebuild = false;
      for (let i = 0; i < rest.length; i += 1) {
        const a = rest[i];
        if (a === "-p" || a === "--prompt") {
          prompt = rest[++i] ?? "";
        } else if (a === "--run") {
          runNow = true;
        } else if (a === "--docker") {
          useDocker = true;
          runNow = true;
        } else if (a === "--rebuild") {
          rebuild = true;
        } else if (!prompt && a && !a.startsWith("-")) {
          prompt = a;
        }
      }
      if (!prompt) {
        console.error("wanwu cloud submit requires -p/--prompt");
        return 2;
      }
      if (useDocker) {
        const task = await client.submit(prompt);
        const done = runCloudTaskInDocker({ repoRoot: cwd, taskId: task.id, rebuild });
        console.log(JSON.stringify(done, null, 2));
        return done.status === "succeeded" ? 0 : 1;
      }
      if (runNow) {
        const done = await client.submitAndRun(prompt);
        console.log(JSON.stringify(done, null, 2));
        return done.status === "succeeded" ? 0 : 1;
      }
      const task = await client.submit(prompt);
      console.log(JSON.stringify(task, null, 2));
      return 0;
    }
    case "run": {
      const id = rest[0];
      if (!id) {
        console.error("wanwu cloud run <taskId> [--docker]");
        return 2;
      }
      const useDocker = rest.includes("--docker");
      const rebuild = rest.includes("--rebuild");
      const done = useDocker
        ? runCloudTaskInDocker({ repoRoot: cwd, taskId: id, rebuild })
        : runCloudTaskLocally({ repoRoot: cwd, taskId: id });
      console.log(JSON.stringify(done, null, 2));
      return done.status === "succeeded" ? 0 : 1;
    }
    case "docker-build": {
      if (!dockerAvailable()) {
        console.error("Docker is not available");
        return 1;
      }
      return buildDockerRunnerImage(cwd);
    }
    case "status": {
      const id = rest[0];
      if (!id) {
        console.error("wanwu cloud status <taskId>");
        return 2;
      }
      const task = loadTask(cwd, id);
      if (!task) {
        console.error(`task not found: ${id}`);
        return 1;
      }
      console.log(JSON.stringify(task, null, 2));
      return 0;
    }
    case "list": {
      console.log(JSON.stringify(await client.list(), null, 2));
      return 0;
    }
    case "logs": {
      const id = rest[0];
      const task = id ? loadTask(cwd, id) : undefined;
      if (!task?.logPath || !existsSync(task.logPath)) {
        console.error("log not found");
        return 1;
      }
      process.stdout.write(readFileSync(task.logPath, "utf8"));
      return 0;
    }
    case "diff": {
      const id = rest[0];
      const task = id ? loadTask(cwd, id) : undefined;
      if (!task?.diffPath || !existsSync(task.diffPath)) {
        console.error("review diff not found");
        return 1;
      }
      process.stdout.write(readFileSync(task.diffPath, "utf8"));
      return 0;
    }
    case "cleanup": {
      for (const task of listTasks(cwd)) {
        if (task.worktree && existsSync(task.worktree)) {
          spawnSync("git", ["worktree", "remove", "--force", task.worktree], { cwd });
        }
        if (task.branch) {
          spawnSync("git", ["branch", "-D", task.branch], { cwd });
        }
      }
      const wtRoot = join(cwd, ".wanwu", "worktrees");
      if (existsSync(wtRoot)) {
        for (const name of readdirSync(wtRoot)) {
          spawnSync("git", ["worktree", "remove", "--force", join(wtRoot, name)], { cwd });
        }
      }
      const tasksRoot = join(cwd, ".wanwu", "cloud-tasks");
      if (existsSync(tasksRoot) && rest.includes("--purge")) {
        rmSync(tasksRoot, { recursive: true, force: true });
      }
      console.log("cloud worktrees cleaned (add --purge to delete task records)");
      return 0;
    }
    default:
      console.log(`wanwu cloud — headless runner (review-first, no auto-merge)

Usage:
  wanwu cloud submit -p "..." [--run] [--docker] [--rebuild]
  wanwu cloud run <taskId> [--docker]
  wanwu cloud docker-build
  wanwu cloud status <taskId>
  wanwu cloud list
  wanwu cloud logs <taskId>
  wanwu cloud diff <taskId>
  wanwu cloud cleanup [--purge]
`);
      return sub ? 2 : 0;
  }
}