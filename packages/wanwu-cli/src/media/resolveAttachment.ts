import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { ContentPart, ImageMediaType } from "@wanwu/providers";
import { imagePart, textPart } from "@wanwu/providers";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT: Record<string, ImageMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Resolve a file path to a ContentPart.
 * Images become base64; other files become text placeholders.
 */
export function resolveAttachment(path: string): ContentPart {
  const ext = extname(path).toLowerCase();
  const mediaType = MIME_BY_EXT[ext];
  if (!mediaType) {
    return textPart(`[attachment: ${path} (unsupported type)]`);
  }
  const data = readFileSync(path);
  if (data.length > MAX_IMAGE_BYTES) {
    return textPart(`[attachment: ${path} (too large)]`);
  }
  return imagePart({
    kind: "base64",
    data: data.toString("base64"),
    mediaType,
  });
}

export function resolveAttachments(paths: string[]): ContentPart[] {
  return paths.map(resolveAttachment);
}
