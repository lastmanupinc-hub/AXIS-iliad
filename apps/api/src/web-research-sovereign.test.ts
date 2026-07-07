// WO-12 acceptance suite: the owned (sovereign) web-research backend.
// Hermetic — every fetch targets a local node:http fixture on 127.0.0.1 with
// AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS=1; no third-party key, no live network.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createAccount, createApiKey, resetTestDb } from "@axis/snapshots";
import {
  assertPublicUrl,
  awaitHostSlot,
  isPathAllowed,
  isPrivateIp,
  parseRobots,
  sovereignUserAgent,
} from "./web-fetch-sovereign.js";
import { sovereignCrawl, sovereignScrape } from "./web-research-sovereign.js";
import { webResearchBackend } from "./web-research.js";
import { MCP_TOOLS } from "./mcp-tools.js";
import { runWebResearch } from "./mcp-tool-impls.js";

// Spy-wrap the metering pair without changing behavior: the mock delegates to the
// real implementations, so the handler-wiring test observes real authorize/capture
// calls (vi.spyOn can't intercept destructured ESM imports inside mcp-tool-impls).
const meterSpies = vi.hoisted(() => ({
  authorize: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("./mcp-runtime.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp-runtime.js")>();
  meterSpies.authorize.mockImplementation(actual.authorizeMcpToolCredits);
  meterSpies.capture.mockImplementation(actual.captureMcpToolCredits);
  return {
    ...actual,
    authorizeMcpToolCredits: meterSpies.authorize,
    captureMcpToolCredits: meterSpies.capture,
  };
});

const ENV_KEYS = [
  "FIRECRAWL_API_KEY",
  "AXIS_WEB_RESEARCH_BACKEND",
  "AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS",
  "AXIS_WEB_RESEARCH_POLITENESS_MS",
  "AXIS_WEB_RESEARCH_USER_AGENT",
  "AXIS_WEB_RESEARCH_MAX_BYTES",
  "AXIS_WEB_RESEARCH_TIMEOUT_MS",
] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

const ARTICLE_SENTENCE =
  "The sovereign extractor keeps this long-form article text and measures text density across containers to find the region a human reader actually cares about, with zero third-party keys involved.";
const NAV_BOILER = "NavBoilerplateMenu";
const FOOTER_BOILER = "FooterBoilerplateLegal";

const requestedPaths: string[] = [];
let server: Server;
let base = ""; // http://127.0.0.1:<port>

function page(body: string, title: string): string {
  return `<!DOCTYPE html><html lang="en"><head><title>${title}</title></head><body>${body}</body></html>`;
}

const FIXTURES: Record<string, { status: number; contentType: string; body: string }> = {
  "/robots.txt": {
    status: 200,
    contentType: "text/plain",
    body: "User-agent: *\nDisallow: /private\n",
  },
  "/article": {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: page(
      `<nav><a href="/">Home</a> <a href="/pricing">Pricing</a> ${NAV_BOILER}</nav>` +
        `<article><h1>Owned Crawl</h1><p>${ARTICLE_SENTENCE}</p></article>` +
        `<footer>${FOOTER_BOILER} <a href="/terms">Terms</a></footer>`,
      "Sovereign Fixture Article",
    ),
  },
  "/": {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: page(
      `<main><h1>Home</h1><p>The home page links the rest of the small fixture site together for the crawler.</p>` +
        `<p><a href="/a">page a</a> <a href="/b">page b</a> <a href="/private/secret">private</a> ` +
        `<a href="https://example.com/offsite">offsite</a></p></main>`,
      "Fixture Home",
    ),
  },
  "/a": {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: page(
      `<main><h1>Page A</h1><p>Page A carries its own paragraph of fixture prose and links back home and onward.</p>` +
        `<p><a href="/">home</a> <a href="/b">page b</a></p></main>`,
      "Fixture A",
    ),
  },
  "/b": {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: page(
      `<main><h1>Page B</h1><p>Page B is the third interlinked page of the fixture site used by the BFS test.</p>` +
        `<p><a href="/a">page a</a></p></main>`,
      "Fixture B",
    ),
  },
  "/private/secret": {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: page(`<main><p>RobotsDisallowedContent — a compliant crawler must never fetch this.</p></main>`, "Private"),
  },
};

beforeAll(async () => {
  for (const key of ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) originalEnv[key] = value;
  }
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    requestedPaths.push(path);
    const fixture = FIXTURES[path];
    if (!fixture) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(fixture.status, { "content-type": fixture.contentType }).end(fixture.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
});

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS = "1"; // the fixture lives on 127.0.0.1
  process.env.AXIS_WEB_RESEARCH_POLITENESS_MS = "0"; // keep the suite fast
  requestedPaths.length = 0;
});

// ─── Acceptance #1: owned scrape, zero third-party key ───────────

describe("sovereignScrape — hermetic owned scrape", () => {
  it("scrapes the fixture article to markdown with NO FIRECRAWL_API_KEY set", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const result = await sovereignScrape(`${base}/article`, true);
    expect(result.markdown).toContain(ARTICLE_SENTENCE);
    expect(result.markdown).toContain("# Owned Crawl");
    expect(result.markdown).not.toContain(NAV_BOILER);
    expect(result.markdown).not.toContain(FOOTER_BOILER);
    expect(result.metadata.title).toBe("Sovereign Fixture Article");
    expect(result.metadata.backend).toBe("sovereign");
    expect(result.url).toBe(`${base}/article`);
  });

  it("keeps chrome when only_main_content=false", async () => {
    const result = await sovereignScrape(`${base}/article`, false);
    expect(result.markdown).toContain(NAV_BOILER);
    expect(result.markdown).toContain(ARTICLE_SENTENCE);
  });
});

// ─── Acceptance #2: backend selector (all four combinations) ─────

describe("webResearchBackend — sovereign is the default", () => {
  it("BACKEND unset + KEY unset → sovereign", () => {
    delete process.env.AXIS_WEB_RESEARCH_BACKEND;
    delete process.env.FIRECRAWL_API_KEY;
    expect(webResearchBackend()).toBe("sovereign");
  });
  it("BACKEND unset + KEY set → sovereign (a key alone never re-routes to the proxy)", () => {
    delete process.env.AXIS_WEB_RESEARCH_BACKEND;
    process.env.FIRECRAWL_API_KEY = "fc-test";
    expect(webResearchBackend()).toBe("sovereign");
  });
  it("BACKEND=firecrawl + KEY unset → sovereign (selector never picks an unprovisioned proxy)", () => {
    process.env.AXIS_WEB_RESEARCH_BACKEND = "firecrawl";
    delete process.env.FIRECRAWL_API_KEY;
    expect(webResearchBackend()).toBe("sovereign");
  });
  it("BACKEND=firecrawl + KEY set → firecrawl (the ONLY firecrawl combination)", () => {
    process.env.AXIS_WEB_RESEARCH_BACKEND = "firecrawl";
    process.env.FIRECRAWL_API_KEY = "fc-test";
    expect(webResearchBackend()).toBe("firecrawl");
  });
});

// ─── Acceptance #3: SSRF guard ───────────────────────────────────

describe("assertPublicUrl / isPrivateIp — SSRF guard", () => {
  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "file:///etc/passwd",
    "ftp://host/",
  ])("rejects %s with ALLOW_PRIVATE off", async (url) => {
    delete process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS;
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });

  it("attaches a machine-readable .code to guard errors", async () => {
    delete process.env.AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS;
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toMatchObject({ code: "blocked_scheme" });
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toMatchObject({ code: "private_address" });
    await expect(assertPublicUrl("http://8.8.8.8:6379/")).rejects.toMatchObject({ code: "blocked_port" });
  });

  it.each(["127.0.0.1", "10.0.0.1", "192.168.0.1", "169.254.169.254", "::1", "fc00::1"])(
    "isPrivateIp(%s) === true",
    (ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    },
  );

  it("isPrivateIp('8.8.8.8') === false", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
});

// ─── Acceptance #4: robots.txt honored ───────────────────────────

describe("robots.txt — parse + crawl enforcement", () => {
  it("parseRobots yields crawlDelayMs and isPathAllowed does longest-match", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private\nCrawl-delay: 2", sovereignUserAgent());
    expect(rules.crawlDelayMs).toBe(2000);
    expect(isPathAllowed(rules, "/private/x")).toBe(false);
    expect(isPathAllowed(rules, "/public")).toBe(true);
  });

  it("prefers the most specific matching User-agent group and lets Allow beat Disallow on ties", () => {
    const text =
      "User-agent: *\nDisallow: /\n\nUser-agent: AxisIliadBot\nDisallow: /private\nAllow: /private/ok\n";
    const rules = parseRobots(text, sovereignUserAgent());
    expect(isPathAllowed(rules, "/anything")).toBe(true); // specific group, not the Disallow-all
    expect(isPathAllowed(rules, "/private/x")).toBe(false);
    expect(isPathAllowed(rules, "/private/ok/page")).toBe(true);
  });

  it("sovereignCrawl never returns (or even requests) a robots-disallowed page", async () => {
    const result = await sovereignCrawl(`${base}/`, 10, true);
    expect(result.pages_crawled).toBeGreaterThan(0);
    for (const p of result.pages) {
      expect(new URL(p.url).pathname.startsWith("/private")).toBe(false);
    }
    expect(requestedPaths.filter((p) => p.startsWith("/private"))).toEqual([]);
  });
});

// ─── Acceptance #5: same-origin BFS + dedupe + limit ─────────────

describe("sovereignCrawl — BFS frontier", () => {
  it("respects the limit, stays on-origin, and never repeats a URL", async () => {
    const result = await sovereignCrawl(`${base}/`, 2, true);
    expect(result.pages_crawled).toBe(2);
    expect(result.pages).toHaveLength(2);
    const urls = result.pages.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(new URL(u).origin).toBe(new URL(base).origin);
    // the off-origin absolute link must never be fetched
    expect(requestedPaths).not.toContain("/offsite");
  });

  it("crawls the whole interlinked fixture when the limit allows", async () => {
    const result = await sovereignCrawl(`${base}/`, 10, true);
    const paths = result.pages.map((p) => new URL(p.url).pathname).sort();
    expect(paths).toEqual(["/", "/a", "/b"]);
  });
});

// ─── Acceptance #7: per-host politeness ──────────────────────────

describe("awaitHostSlot — per-host politeness gate", () => {
  it("separates back-to-back slots for one host by >=300ms wall-clock", async () => {
    process.env.AXIS_WEB_RESEARCH_POLITENESS_MS = "300";
    const started = Date.now();
    await awaitHostSlot("politeness.example.com", null);
    await awaitHostSlot("politeness.example.com", null);
    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });

  it("honors a larger robots crawl-delay over the env politeness floor", async () => {
    process.env.AXIS_WEB_RESEARCH_POLITENESS_MS = "10";
    const started = Date.now();
    await awaitHostSlot("crawl-delay.example.com", 250);
    await awaitHostSlot("crawl-delay.example.com", 250);
    expect(Date.now() - started).toBeGreaterThanOrEqual(240);
  });
});

// ─── Acceptance #8: handler wiring (auth + metering unchanged) ───

describe("runWebResearch — sovereign default through the MCP handler", () => {
  beforeEach(async () => {
    await resetTestDb();
    meterSpies.authorize.mockClear();
    meterSpies.capture.mockClear();
  });

  function mockReq(key: string): IncomingMessage {
    return {
      headers: { authorization: `Bearer ${key}` },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
  }

  it("returns a real ScrapeResult (not _not_configured) with FIRECRAWL_API_KEY unset, metering once", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const account = await createAccount("Sovereign WR", "sovereign-wr@example.com", "paid");
    const { rawKey } = await createApiKey(account.account_id);

    const text = await runWebResearch({ url: `${base}/article` }, mockReq(rawKey));
    const parsed = JSON.parse(text) as { _not_configured?: boolean; url: string; markdown: string; metadata: Record<string, unknown> };
    expect(parsed._not_configured).toBeUndefined();
    expect(parsed.markdown).toContain(ARTICLE_SENTENCE);
    expect(parsed.metadata.title).toBe("Sovereign Fixture Article");

    expect(meterSpies.authorize).toHaveBeenCalledTimes(1);
    expect(meterSpies.authorize.mock.calls[0][2]).toBe("iliad_web_research");
    expect(meterSpies.capture).toHaveBeenCalledTimes(1);
    expect(meterSpies.capture.mock.calls[0][1]).toMatchObject({ tool: "iliad_web_research" });
  });

  it("returns the _not_configured envelope ONLY when firecrawl is explicitly selected without a key (and never charges)", async () => {
    process.env.AXIS_WEB_RESEARCH_BACKEND = "firecrawl";
    delete process.env.FIRECRAWL_API_KEY;
    const account = await createAccount("Sovereign WR2", "sovereign-wr2@example.com", "paid");
    const { rawKey } = await createApiKey(account.account_id);

    const text = await runWebResearch({ url: `${base}/article` }, mockReq(rawKey));
    const parsed = JSON.parse(text) as { _not_configured?: boolean; reason?: string };
    expect(parsed._not_configured).toBe(true);
    expect(parsed.reason).toBe("firecrawl_not_configured");
    expect(meterSpies.authorize).not.toHaveBeenCalled();
    expect(meterSpies.capture).not.toHaveBeenCalled();
  });
});

// ─── Acceptance #9: docs honesty — advertised copy ───────────────

describe("docs honesty — tool descriptions advertise the owned crawler", () => {
  it.each(["iliad_web_research", "iliad_web_research_crawl"])(
    "%s description drops 'Firecrawl' and carries the static-HTML caveat",
    (name) => {
      const tool = MCP_TOOLS.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool!.description).not.toMatch(/firecrawl/i);
      expect(tool!.description).toMatch(/AXIS's owned crawler/);
      expect(tool!.description).toMatch(/no JavaScript rendering/i);
    },
  );

  it("web-research.ts no longer punts SSRF to a third party in its header", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const source = await readFile(fileURLToPath(new URL("./web-research.ts", import.meta.url)), "utf-8");
    expect(source).not.toContain("SSRF is its concern, not ours");
    expect(source).toContain("no JavaScript rendering");
  });
});
