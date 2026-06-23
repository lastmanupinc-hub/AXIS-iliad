import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb, createAccount, createApiKey } from "@axis/snapshots";
import type { Server } from "node:http";
import { firecrawlScrape, firecrawlCrawl, isWebResearchNotConfigured } from "./web-research.js";
import { dispatch } from "./mcp-server.js";
import { putCachedScrape } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleFirecrawlScrape } from "./handlers.js";

const ORIGINAL_KEY = process.env.FIRECRAWL_API_KEY;
function restoreKey() {
  if (ORIGINAL_KEY === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = ORIGINAL_KEY;
}

describe("web-research core", () => {
  afterEach(() => {
    restoreKey();
    vi.unstubAllGlobals();
  });

  it("returns _not_configured when FIRECRAWL_API_KEY is unset", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    expect(isWebResearchNotConfigured(await firecrawlScrape("https://example.com"))).toBe(true);
    expect(isWebResearchNotConfigured(await firecrawlCrawl("https://example.com", 5))).toBe(true);
  });

  it("scrapes markdown + metadata on success", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { markdown: "# Hi", metadata: { title: "T" } } }), { status: 200 })),
    );
    const r = await firecrawlScrape("https://example.com");
    expect(isWebResearchNotConfigured(r)).toBe(false);
    if (!isWebResearchNotConfigured(r)) {
      expect(r.markdown).toBe("# Hi");
      expect(r.metadata.title).toBe("T");
      expect(r.url).toBe("https://example.com");
    }
  });

  it("throws a clean error on a non-ok firecrawl response", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    await expect(firecrawlScrape("https://example.com")).rejects.toThrow(/Firecrawl scrape failed: 429/);
  });

  it("maps crawl scrapeResults to pages", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { scrapeResults: [{ url: "https://a", markdown: "A" }, { url: "https://b", markdown: "B" }] } }), { status: 200 }),
      ),
    );
    const r = await firecrawlCrawl("https://example.com", 10);
    expect(isWebResearchNotConfigured(r)).toBe(false);
    if (!isWebResearchNotConfigured(r)) {
      expect(r.pages_crawled).toBe(2);
      expect(r.pages[0].markdown).toBe("A");
    }
  });
});

describe("web-research MCP dispatch wiring", () => {
  let rawKey: string;

  beforeEach(async () => {
    await resetTestDb();
    const acct = await createAccount("WR", "wr@example.com", "paid");
    rawKey = (await createApiKey(acct.account_id)).rawKey;
    delete process.env.FIRECRAWL_API_KEY; // exercise the _not_configured path — no network
  });
  afterEach(() => {
    restoreKey();
  });

  function mockReq(key: string): IncomingMessage {
    return { headers: { authorization: `Bearer ${key}` }, socket: { remoteAddress: "127.0.0.1" } } as unknown as IncomingMessage;
  }

  async function callText(name: string, args: Record<string, unknown>, id: number): Promise<string> {
    const rpc = (await dispatch("tools/call", { name, arguments: args }, id, mockReq(rawKey))) as {
      result: { content: Array<{ text: string }> };
    };
    return rpc.result.content[0].text;
  }

  it("dispatches iliad_web_research (was 'Unknown tool') → _not_configured without a key", async () => {
    const text = await callText("iliad_web_research", { url: "https://example.com" }, 1);
    expect(text).not.toContain("Unknown tool");
    expect(text).toContain("firecrawl_not_configured");
  });

  it("dispatches iliad_web_research_crawl and validates the limit", async () => {
    const text = await callText("iliad_web_research_crawl", { url: "https://example.com", limit: 999 }, 2);
    expect(text).not.toContain("Unknown tool");
    expect(text).toContain("limit");
  });
});

describe("POST /v1/research/scrape — 24h shared cache", () => {
  let server: Server;
  let testPort = 0;
  let apiKey = "";

  beforeEach(async () => {
    await resetTestDb();
    const acct = await createAccount("Cache", "cache@test.com", "paid");
    apiKey = (await createApiKey(acct.account_id)).rawKey;
    delete process.env.FIRECRAWL_API_KEY; // prove the cache short-circuits before any Firecrawl call
    const router = new Router();
    router.post("/v1/research/scrape", handleFirecrawlScrape);
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreKey();
  });

  async function post(url: string, key: string): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ url });
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: testPort, path: "/v1/research/scrape", method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            let data: unknown;
            try { data = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { data = {}; }
            resolve({ status: res.statusCode ?? 0, data });
          });
        },
      );
      r.on("error", reject);
      r.write(payload);
      r.end();
    });
  }

  it("serves a cache hit for $0 without calling Firecrawl", async () => {
    await putCachedScrape("https://example.com/doc", "# cached markdown", { title: "Doc" }, 200);
    const r = await post("https://example.com/doc", apiKey);
    expect(r.status).toBe(200); // would be 503 (Firecrawl unconfigured) if it didn't hit cache
    expect(r.data.cached).toBe(true);
    expect(r.data.cost).toContain("$0.00");
    expect(r.data.data.markdown).toBe("# cached markdown");
  });
});
