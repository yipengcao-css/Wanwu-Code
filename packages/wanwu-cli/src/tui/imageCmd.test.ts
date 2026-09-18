import { describe, expect, it } from "vitest";
import { parseSlashImage } from "./imageCmd.js";

describe("parseSlashImage", () => {
  it("lists, clears, and adds", () => {
    expect(parseSlashImage("/image")).toEqual({ action: "list" });
    expect(parseSlashImage("/image clear")).toEqual({ action: "clear" });
    expect(parseSlashImage("/image shots/a.png")).toEqual({ action: "add", path: "shots/a.png" });
    expect(parseSlashImage("/help")).toBeUndefined();
  });
});
