/**
 * Resolve whether the LLM loop should stream assistant tokens.
 *
 * Default is ON (Cursor-like incremental output). Opt out with
 * `WANWU_STREAM=0` / `false` / `off`, or pass `{ stream: false }`.
 */
export function shouldStream(
  opts?: { stream?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (typeof opts?.stream === "boolean") return opts.stream;
  const raw = env.WANWU_STREAM?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return true;
  return true;
}
