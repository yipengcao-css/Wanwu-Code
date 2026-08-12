import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTask, saveTask, updateTaskStatus } from "./store.js";

export interface ContainerRunOptions {
  repoRoot: string;
  taskId: string;
  image?: string;
  /** Run agent loop inside container (default: plan artifact only) */
  agent?: boolean;
}

/**
 * Run a cloud task inside a Docker container with the workspace mounted.
 * Produces review.diff + runner.log; never merges to main.
 */
export function runCloudTaskInContainer(opts: ContainerRunOptions): ReturnType<typeof updateTaskStatus> {
  const { repoRoot, taskId } = opts;
  const task = loadTask(repoRoot, taskId);
  if (!task) {
    throw new Error(`unknown task ${taskId}`);
  }

  const taskDir = join(repoRoot, ".wanwu", "cloud-tasks", taskId);
  mkdirSync(taskDir, { recursive: true });
  const logPath = join(taskDir, "runner.log");
  writeFileSync(logPath, `wanwu cloud container runner start ${new Date().toISOString()}\n`, "utf8");

  updateTaskStatus(repoRoot, taskId, "running", { logPath });

  const image = opts.image ?? "node:22-alpine";
  const workdir = "/workspace";

  const script = opts.agent
    ? `set -e
cd ${workdir}
if [ -f package.json ]; then
  npm install -g pnpm >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile || npm install || true
fi
mkdir -p .wanwu/plans
cat > .wanwu/plans/${taskId}.plan.md <<'EOF'
# Wanwu Plan

- task: ${taskId}
- prompt: ${task.prompt.replace(/'/g, "'\\''")}

## Steps

1. Explore
2. Act
3. Verify
EOF
git add .wanwu || true
git -c user.email=wanwu@example.com -c user.name="Wanwu Cloud" commit -m "wanwu cloud task ${taskId}" || true
git diff HEAD~1..HEAD > /tmp/review.diff || true
`
    : `set -e
cd ${workdir}
mkdir -p .wanwu/plans
cat > .wanwu/plans/${taskId}.plan.md <<'EOF'
# Wanwu Plan

- task: ${taskId}
- prompt: ${task.prompt.replace(/'/g, "'\\''")}
EOF
git add .wanwu || true
git -c user.email=wanwu@example.com -c user.name="Wanwu Cloud" commit -m "wanwu cloud task ${taskId}" || true
git diff HEAD~1..HEAD > /tmp/review.diff || true
`;

  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${repoRoot}:${workdir}`,
      "-w",
      workdir,
      image,
      "sh",
      "-c",
      script,
    ],
    { cwd: repoRoot, encoding: "utf8", timeout: 300_000 },
  );

  if (result.stdout) writeFileSync(logPath, result.stdout, { flag: "a" });
  if (result.stderr) writeFileSync(logPath, result.stderr, { flag: "a" });

  const diffPath = join(taskDir, "review.diff");
  const diff = spawnSync("git", ["diff", "HEAD~1..HEAD"], { cwd: repoRoot, encoding: "utf8" });
  writeFileSync(diffPath, diff.stdout ?? "", "utf8");

  const ok = (result.status ?? 1) === 0;
  const next = updateTaskStatus(repoRoot, taskId, ok ? "succeeded" : "failed", {
    logPath,
    diffPath,
    exitCode: result.status ?? 1,
  });
  saveTask(repoRoot, next);
  return next;
}
