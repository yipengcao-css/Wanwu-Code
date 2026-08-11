import { cleanupParallel, runParallelMarkers } from "@wanwu/cloud";
import { findWorkspaceRoot } from "./workspaceRoot.js";

export function runParallelCommand(args: string[]): number {
  const cwd = findWorkspaceRoot();
  const [sub] = args;
  if (sub === "demo" || sub === undefined) {
    const result = runParallelMarkers(cwd, [
      {
        name: "agent-a",
        markerRelativePath: ".wanwu/markers/agent-a.txt",
        markerContents: `A-${Date.now()}`,
      },
      {
        name: "agent-b",
        markerRelativePath: ".wanwu/markers/agent-b.txt",
        markerContents: `B-${Date.now()}`,
      },
    ]);
    console.log(JSON.stringify(result, null, 2));
    if (result.collidedOnMain) {
      console.error("FAIL: markers leaked into main checkout");
      cleanupParallel(cwd, result.agents.map((a) => a.name));
      return 1;
    }
    console.log("OK: two worktree agents isolated; main untouched");
    // keep worktrees for inspection unless --cleanup
    if (args.includes("--cleanup")) {
      cleanupParallel(
        cwd,
        result.agents.map((a) => a.name),
      );
      console.log("cleaned up worktrees");
    }
    return 0;
  }
  if (sub === "cleanup") {
    cleanupParallel(cwd, ["agent-a", "agent-b"]);
    console.log("cleaned parallel agent-a/agent-b worktrees");
    return 0;
  }
  console.error("wanwu parallel [demo|cleanup] [--cleanup]");
  return 2;
}