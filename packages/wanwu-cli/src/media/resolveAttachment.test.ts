import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAttachment } from "./resolveAttachment.js";

describe("resolveAttachment", () => {
  it("resolves png to base64 image", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-media-"));
    const path = join(dir, "test.png");
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const part = resolveAttachment(path);
    expect(part.type).toBe("image");
    if (part.type === "image" && part.source.kind === "base64") {
      expect(part.source.mediaType).toBe("image/png");
    }
  });

  it("returns text placeholder for unsupported type", () => {
    const dir = mkdtempSync(join(tmpdir(), "wanwu-media-"));
    const path = join(dir, "test.xyz");
    writeFileSync(path, "x");
    const part = resolveAttachment(path);
    expect(part.type).toBe("text");
  });
});
