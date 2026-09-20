/** Tools that are safe to run concurrently in a single model turn. */
export const PARALLEL_SAFE_TOOLS = new Set([
  "Read",
  "ListDir",
  "Glob",
  "Grep",
  "Diagnose",
  "SearchCodebase",
  "McpReadResource",
]);

/** True when every tool in the batch is read-only / side-effect free. */
export function canRunToolsInParallel(names: string[]): boolean {
  return names.length > 1 && names.every((n) => PARALLEL_SAFE_TOOLS.has(n));
}
