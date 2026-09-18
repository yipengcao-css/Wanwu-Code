import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { imagePart, type ContentPart, type ImageMediaType } from "@wanwu/providers";
import { resolveAttachment } from "../media/resolveAttachment.js";

export type PromptImageInput = {
  path?: string;
  data?: string;
  mediaType?: string;
};

const IMAGE_MIME: Record<string, ImageMediaType> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

export function normalizeImageMediaType(raw?: string): ImageMediaType | undefined {
  if (!raw) return undefined;
  return IMAGE_MIME[raw.trim().toLowerCase()];
}

export function normalizePromptText(params: { prompt?: unknown; text?: unknown }): string {
  if (typeof params.prompt === "string") return params.prompt;
  if (typeof params.text === "string") return params.text;
  if (Array.isArray(params.prompt)) {
    return params.prompt
      .map((block) => {
        if (typeof block === "string") return block;
        if (!block || typeof block !== "object") return "";
        const rec = block as { type?: string; text?: string };
        return typeof rec.text === "string" ? rec.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function collectImagePaths(params: { images?: unknown }): string[] {
  if (!Array.isArray(params.images)) return [];
  return params.images.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}

function asImageInput(value: unknown): PromptImageInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const path = typeof rec.path === "string" ? rec.path : undefined;
  const data = typeof rec.data === "string" ? rec.data : undefined;
  const mediaType =
    typeof rec.mediaType === "string"
      ? rec.mediaType
      : typeof rec.mimeType === "string"
        ? rec.mimeType
        : undefined;
  if (!path && !data) return undefined;
  return { path, data, mediaType };
}

export function collectInlineAttachments(params: {
  attachments?: unknown;
  prompt?: unknown;
}): PromptImageInput[] {
  const out: PromptImageInput[] = [];
  if (Array.isArray(params.attachments)) {
    for (const item of params.attachments) {
      const parsed = asImageInput(item);
      if (parsed) out.push(parsed);
    }
  }
  if (Array.isArray(params.prompt)) {
    for (const block of params.prompt) {
      if (!block || typeof block !== "object") continue;
      const rec = block as Record<string, unknown>;
      if (rec.type !== "image" && rec.type !== "image_url") continue;
      const parsed = asImageInput(rec);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

function resolveExistingPath(workspaceRoot: string, raw: string): string | undefined {
  const abs = isAbsolute(raw) ? raw : join(workspaceRoot, raw);
  return existsSync(abs) ? abs : undefined;
}

export function resolvePromptAttachments(
  workspaceRoot: string,
  params: { images?: unknown; attachments?: unknown; prompt?: unknown },
): ContentPart[] {
  const parts: ContentPart[] = [];
  const seen = new Set<string>();

  const pushPath = (raw: string): void => {
    const abs = resolveExistingPath(workspaceRoot, raw);
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    parts.push(resolveAttachment(abs));
  };

  for (const raw of collectImagePaths(params)) pushPath(raw);

  for (const att of collectInlineAttachments(params)) {
    const mediaType = normalizeImageMediaType(att.mediaType);
    if (att.data && mediaType) {
      const key = `b64:${mediaType}:${att.data.slice(0, 24)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(imagePart({ kind: "base64", data: att.data, mediaType }));
      continue;
    }
    if (att.path) pushPath(att.path);
  }

  return parts;
}
