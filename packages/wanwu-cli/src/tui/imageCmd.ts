export type ImageSlash =
  | { action: "list" }
  | { action: "clear" }
  | { action: "add"; path: string };

/** Parse `/image`, `/image clear`, `/image <path>`. */
export function parseSlashImage(input: string): ImageSlash | undefined {
  if (input !== "/image" && !input.startsWith("/image ")) return undefined;
  const arg = input.slice("/image".length).trim();
  if (!arg || arg === "list") return { action: "list" };
  if (arg === "clear") return { action: "clear" };
  return { action: "add", path: arg };
}
