import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearBrowserPages, htmlToSnapshot, toolBrowser } from "./browser.js";

afterEach(() => {
  clearBrowserPages();
});

describe("htmlToSnapshot", () => {
  it("extracts title, headings, and links", () => {
    const snap = htmlToSnapshot(
      `<html><head><title>Demo</title></head><body><h1>Hello</h1><a href="/x">Go</a><button name="ok">OK</button></body></html>`,
      "http://example.test/",
    );
    expect(snap).toContain("title: Demo");
    expect(snap).toContain("# Hello");
    expect(snap).toContain("Go → /x");
    expect(snap).toContain("<button");
  });
});

describe("toolBrowser", () => {
  it("navigates then snapshots via fetchImpl", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-browser-"));
    const html =
      "<html><head><title>Page</title></head><body><h2>Sec</h2><a href='/a'>A</a></body></html>";
    const fetchImpl = async () =>
      new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    const nav = await toolBrowser(root, { action: "navigate", url: "https://example.test/app" }, { fetchImpl });
    expect(nav.ok).toBe(true);
    expect(nav.text).toContain("title: Page");

    const snap = await toolBrowser(root, { action: "snapshot" }, { fetchImpl });
    expect(snap.ok).toBe(true);
    expect(snap.text).toContain("## Sec");
  });

  it("writes a markdown snapshot when chrome is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-browser-shot-"));
    const fetchImpl = async () =>
      new Response("<html><head><title>S</title></head><body><h1>Hi</h1></body></html>", {
        status: 200,
      });
    await toolBrowser(root, { action: "navigate", url: "https://example.test/" }, { fetchImpl });
    const shot = await toolBrowser(
      root,
      { action: "screenshot", path: ".wanwu/browser/x.png" },
      { fetchImpl, chromeBin: null },
    );
    expect(shot.ok).toBe(true);
    expect(shot.text).toMatch(/screenshot|text snapshot|wrote/);
    if (shot.text.includes("text snapshot")) {
      const md = readFileSync(join(root, ".wanwu/browser/x.md"), "utf8");
      expect(md).toContain("# Hi");
    }
  });

  it("refuses non-http navigate", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-browser-bad-"));
    const r = await toolBrowser(root, { action: "navigate", url: "file:///etc/passwd" });
    expect(r.ok).toBe(false);
  });
});
