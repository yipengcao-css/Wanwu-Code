import { execFileSync } from "node:child_process";
import { completeChat, hasProviderCredentials } from "@wanwu/providers";
import { loadWanwuConfig } from "@wanwu/config";

function git(root: string, args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: root, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

/** Heuristic fallback when no LLM credentials are configured. */
function heuristicMessage(root: string): string {
  const stat = git(root, ["diff", "--staged", "--stat"]);
  const files = git(root, ["diff", "--staged", "--name-only"]).split("\n").filter(Boolean);
  if (!files.length) return "chore: update";
  const dirs = [...new Set(files.map((f) => f.split("/")[0]))];
  const scope = dirs.length === 1 ? dirs[0]!.replace(/[^\w-]/g, "") : "";
  const added = (stat.match(/(\d+) insertion/) ?? [])[1];
  const deleted = (stat.match(/(\d+) deletion/) ?? [])[1];
  const verb = deleted && !added ? "remove" : added && !deleted ? "add" : "update";
  return `${verb}${scope ? `(${scope})` : ""}: ${files.length} file(s)`;
}

export async function runCommitMsg(root: string): Promise<number> {
  const staged = git(root, ["diff", "--staged"]);
  const diff = staged || git(root, ["diff"]);
  if (!diff) {
    console.error("没有可提交的变更（git diff 为空）");
    return 1;
  }
  const { config } = loadWanwuConfig(root);
  if (!hasProviderCredentials(config)) {
    console.log(heuristicMessage(root));
    return 0;
  }
  try {
    const r = await completeChat({
      config,
      request: {
        temperature: 0.2,
        maxTokens: 256,
        messages: [
          {
            role: "system",
            content:
              "Write a concise conventional-commit message (type(scope): subject, <= 72 chars, optional short body) for the given diff. Output ONLY the message.",
          },
          { role: "user", content: diff.slice(0, 24_000) },
        ],
      },
    });
    console.log(r.text.trim() || heuristicMessage(root));
    return 0;
  } catch (err) {
    console.error(`LLM 生成失败，使用启发式：${err instanceof Error ? err.message : String(err)}`);
    console.log(heuristicMessage(root));
    return 0;
  }
}
