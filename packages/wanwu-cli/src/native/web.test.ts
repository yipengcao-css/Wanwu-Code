import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToText, parseDuckDuckGoHtml, toolWebFetch, toolWebSearch } from "./web.js";
import { dispatchTool } from "./toolDispatch.js";

const DDG_FIXTURE = `
<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example Docs</a>
  <a class="result__snippet" href="#">The <b>example</b> documentation.</a>
</div>
<div class="result">
  <a class="result__a" href="https://direct.link/page">Direct Link</a>
</div>
</body></html>
`;

describe("htmlToText", () => {
  it("strips scripts, styles and tags", () => {
    const html = `<html><head><style>body{color:red}</style></head>
      <body><script>alert(1)</script><h1>Title</h1><p>Hello &amp; bye</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("Title");
    expect(text).toContain("Hello & bye");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });
});

describe("parseDuckDuckGoHtml", () => {
  it("parses results and decodes uddg redirect URLs", () => {
    const hits = parseDuckDuckGoHtml(DDG_FIXTURE);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toEqual({
      title: "Example Docs",
      url: "https://example.com/docs",
      snippet: "The example documentation.",
    });
    expect(hits[1]!.url).toBe("https://direct.link/page");
  });
});

describe("toolWebFetch", () => {
  it("rejects non-http URLs", async () => {
    const r = await toolWebFetch("file:///etc/passwd");
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/http/);
  });

  it("fetches and strips HTML", async () => {
    const fetchImpl = (async () =>
      new Response("<html><body><h1>Hi</h1><p>body text</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const r = await toolWebFetch("https://example.com", { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.text).toContain("Hi");
    expect(r.text).toContain("body text");
    expect(r.text).not.toContain("<h1>");
  });

  it("reports HTTP errors", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const r = await toolWebFetch("https://example.com/missing", { fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.text).toMatch(/404/);
  });
});

describe("toolWebSearch", () => {
  it("parses results from the default endpoint shape", async () => {
    const fetchImpl = (async () =>
      new Response(DDG_FIXTURE, {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;
    const r = await toolWebSearch("example docs", { fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.text).toContain("Example Docs");
    expect(r.text).toContain("https://example.com/docs");
  });

  it("rejects empty query", async () => {
    const r = await toolWebSearch("   ");
    expect(r.ok).toBe(false);
  });
});

describe("web tools gating", () => {
  it("WebFetch allowed by workspace rule in ask mode", async () => {
    // No real network: port 9 refuses instantly; retries off for speed.
    process.env.WANWU_HTTP_RETRIES = "0";
    const root = mkdtempSync(join(tmpdir(), "wanwu-web-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "permissions.toml"),
      `[[rules]]\naction = "allow"\npattern = "WebFetch *"\n`,
      "utf8",
    );
    const result = await dispatchTool(
      { workspaceRoot: root, sessionId: "s1", permissionMode: "ask", mode: "agent" },
      "agent",
      "WebFetch",
      JSON.stringify({ url: "http://127.0.0.1:9/x" }),
    );
    // Rule allows → tool runs; connection refused proves gating passed.
    expect(result.text).not.toMatch(/denied|Blocked/i);
    expect(result.text).toMatch(/fetch failed/);
    delete process.env.WANWU_HTTP_RETRIES;
  });

  it("WebSearch denied by workspace rule", async () => {
    const root = mkdtempSync(join(tmpdir(), "wanwu-web-"));
    mkdirSync(join(root, ".wanwu"), { recursive: true });
    writeFileSync(
      join(root, ".wanwu", "permissions.toml"),
      `[[rules]]\naction = "deny"\npattern = "WebSearch *"\nreason = "no web"\n`,
      "utf8",
    );
    const result = await dispatchTool(
      { workspaceRoot: root, sessionId: "s1", permissionMode: "accept-all", mode: "agent" },
      "agent",
      "WebSearch",
      JSON.stringify({ query: "test" }),
    );
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/no web/);
  });
});
