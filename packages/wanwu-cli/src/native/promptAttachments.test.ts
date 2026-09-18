import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectImagePaths,
  normalizeImageMediaType,
  normalizePromptText,
  resolvePromptAttachments,
} from "./promptAttachments.js";

describe("promptAttachments", () => {
  it("reads string prompt and image paths", () => {
    expect(normalizePromptText({ prompt: "hello" })).toBe("hello");
    expect(collectImagePaths({ images: ["a.png", "", 1] })).toEqual(["a.png"]);
  });

  it("flattens ACP content-block prompts", () => {
    expect(
      normalizePromptText({
        prompt: [
          { type: "text", text: "看这张图" },
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
      }),
    ).toBe("看这张图");
  });

  it("resolves file paths and inline base64", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-prompt-att-"));
    const png = join(dir, "shot.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const parts = resolvePromptAttachments(dir, {
      images: ["shot.png", "missing.png"],
      attachments: [{ data: "QQ==", mediaType: "image/jpeg" }],
    });
    expect(parts).toHaveLength(2);
    expect(parts[0]?.type).toBe("image");
    expect(parts[1]?.type).toBe("image");
  });

  it("normalizes jpg alias", () => {
    expect(normalizeImageMediaType("image/jpg")).toBe("image/jpeg");
    expect(normalizeImageMediaType("application/pdf")).toBeUndefined();
  });
});
