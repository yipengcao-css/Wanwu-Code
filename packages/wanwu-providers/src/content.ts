export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type ImageSource =
  | { kind: "base64"; data: string; mediaType: ImageMediaType }
  | { kind: "url"; url: string };

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource };

export type MessageContent = string | ContentPart[];

export function isMultimodal(content: MessageContent): content is ContentPart[] {
  return Array.isArray(content);
}

export function flattenText(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("\n");
}

export function hasImages(content: MessageContent): boolean {
  return Array.isArray(content) && content.some((p) => p.type === "image");
}

export function textPart(text: string): ContentPart {
  return { type: "text", text };
}

export function imagePart(source: ImageSource): ContentPart {
  return { type: "image", source };
}
