import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb, createAccount, createApiKey, consumeFreeScrapes } from "@axis/snapshots";
import type { Server } from "node:http";
import { firecrawlScrape, firecrawlCrawl, isWebResearchNotConfigured } from "./web-research.js";
import { dispatch } from "./mcp-server.js";
import { putCachedScrape } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleFirecrawlScrape, handleFirecrawlCrawl } from "./handlers.js";
import { ErrorCode } from "./logger.js";

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

  // firecrawlPost wraps fetch() in try/finally (only clearTimeout on the way
  // out) — there is no catch block, so unlike sovereignFetch's SovereignFetchError
  // classification, an aborted/failed fetch propagates RAW and unclassified.
  it("propagates the raw AbortError when the client-side timeout controller fires", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
      }),
    );
    await expect(firecrawlScrape("https://example.com")).rejects.toMatchObject({ name: "AbortError" });
  });

  it("propagates a transport error when fetch rejects with a network failure", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(firecrawlScrape("https://example.com")).rejects.toThrow(/fetch failed/);
  });

  it("defaults markdown/metadata to empty rather than throwing when the 200 body is missing the expected data shape", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    const r = await firecrawlScrape("https://example.com");
    expect(isWebResearchNotConfigured(r)).toBe(false);
    if (!isWebResearchNotConfigured(r)) {
      expect(r.markdown).toBe("");
      expect(r.metadata).toEqual({});
    }
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
    // WO-12: the sovereign backend is the default and needs no key, so the
    // _not_configured path now requires an EXPLICIT firecrawl selection
    // without a key — still zero network.
    process.env.AXIS_WEB_RESEARCH_BACKEND = "firecrawl";
    delete process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    delete process.env.AXIS_WEB_RESEARCH_BACKEND;
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

  it("dispatches iliad_web_research (was 'Unknown tool') → _not_configured on explicit firecrawl w/o key", async () => {
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

describe("POST /v1/research/crawl — billing, free pool & two-phase charge", () => {
  let server: Server;
  let testPort = 0;
  let apiKey = "";
  let accountId = "";

  beforeEach(async () => {
    await resetTestDb();
    const acct = await createAccount("Crawl", "crawl@test.com", "paid");
    accountId = acct.account_id;
    apiKey = (await createApiKey(acct.account_id)).rawKey;
    const router = new Router();
    router.post("/v1/research/crawl", handleFirecrawlCrawl);
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreKey();
    vi.unstubAllGlobals();
  });

  function postCrawl(body: unknown, key?: string): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) headers.Authorization = `Bearer ${key}`;
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: testPort, path: "/v1/research/crawl", method: "POST", headers },
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

  it("rejects a limit outside 1–100 with 400 (before any billing)", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const r = await postCrawl({ url: "https://example.com", limit: 999 }, apiKey);
    expect(r.status).toBe(400);
  });

  it("rejects a missing url with 400", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const r = await postCrawl({ limit: 5 }, apiKey);
    expect(r.status).toBe(400);
  });

  it("requires auth (401) when no key is presented", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    const r = await postCrawl({ url: "https://example.com", limit: 5 });
    expect(r.status).toBe(401);
  });

  it("charges nothing upfront when the free pool covers the crawl (503 Firecrawl, not 402)", async () => {
    delete process.env.FIRECRAWL_API_KEY; // fresh 100-page pool covers limit=5 → estimate $0 → no payment gate
    const r = await postCrawl({ url: "https://example.com", limit: 5 }, apiKey);
    // Reaches the Firecrawl-unconfigured branch (503) rather than a payment gate (402),
    // proving the free-pool estimate skipped the upfront charge.
    expect(r.status).toBe(503);
  });

  it("two-phase: draws the free pool for crawled pages and bills $0 when fully covered", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: { scrapeResults: [{ url: "https://a", markdown: "A" }, { url: "https://b", markdown: "B" }] } }),
          { status: 200 },
        ),
      ),
    );
    const r = await postCrawl({ url: "https://example.com", limit: 5 }, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.free_pages_used).toBe(2);
    expect(r.data.paid_pages).toBe(0);
    expect(r.data.cost).toBe("$0.00");
    expect(r.data.data.pages_crawled).toBe(2);
  });

  it("never serves unfunded pages for free once the pool is drained", async () => {
    await consumeFreeScrapes(accountId, 100); // drain the monthly free pool
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: { scrapeResults: [{ url: "https://a", markdown: "A" }, { url: "https://b", markdown: "B" }, { url: "https://c", markdown: "C" }] } }),
          { status: 200 },
        ),
      ),
    );
    const r = await postCrawl({ url: "https://example.com", limit: 3 }, apiKey);
    // With the pool drained, the crawled pages are unfunded: the endpoint must either
    // charge for them (200 with paid_pages > 0) or gate on payment (402) — never free.
    expect([200, 402]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data.paid_pages).toBeGreaterThan(0);
      expect(r.data.free_pages_used).toBe(0);
    }
  });
});

// ─── Unhappy-path coverage for the two Firecrawl call sites in handlers.ts ──
//
// Both handleFirecrawlScrape and handleFirecrawlCrawl wrap their fetch() in a
// try/catch that produces a clean 500 INTERNAL_ERROR on any thrown error
// (transport failure, or a non-JSON body that throws inside res.json()), and
// both use optional chaining + `??` fallbacks when reading the parsed body,
// so a 200 response with an unexpected shape does not throw — see the
// per-test comments below for exactly what each handler falls back to.
//
// H8.1b: both handlers now also wrap their fetch() in a client-side
// AbortController/setTimeout (30s scrape / 60s crawl) that actually enforces
// the same budget already sent to Firecrawl via the body-level `timeout`
// field. The abort propagates into the same outer catch as any other
// transport error, so it lands on the identical clean 500 — see the
// dedicated timeout test at the end of each describe block below.

describe("POST /v1/research/scrape — Firecrawl transport & malformed-response handling", () => {
  let server: Server;
  let testPort = 0;
  let apiKey = "";

  beforeEach(async () => {
    await resetTestDb();
    const acct = await createAccount("ScrapeErr", "scrape-err@test.com", "paid");
    apiKey = (await createApiKey(acct.account_id)).rawKey;
    const router = new Router();
    router.post("/v1/research/scrape", handleFirecrawlScrape);
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreKey();
    vi.unstubAllGlobals();
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

  it("returns a clean 500 (not a crash) when the Firecrawl fetch itself rejects — transport error", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed"); // mirrors Node/undici's real connection-failure error
      }),
    );
    const r = await post("https://example.com/transport-error", apiKey);
    expect(r.status).toBe(500);
    expect(r.data.error_code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(r.data.error).toContain("Firecrawl request failed");
  });

  it("doesn't crash on a 200 response with a malformed body — falls back to empty markdown/metadata", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    // Well-formed JSON, ok:true, but no `data` field at all (e.g. Firecrawl
    // changes its envelope, or a proxy strips it) — data.markdown is missing.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    const r = await post("https://example.com/malformed-scrape", apiKey);
    // The handler's `firecrawlData.data?.markdown ?? ""` / `?? {}` fallbacks mean
    // this is NOT an error — it succeeds with empty content rather than throwing.
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data.markdown).toBe("");
    expect(r.data.data.metadata).toEqual({});
  });

  it("returns a clean 500 (not a crash) when the Firecrawl call outlives the 30s client-side timeout (H8.1b)", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    // Never resolves on its own; only settles once the handler's internal
    // AbortController fires — same as a real stalled Firecrawl call would.
    // Fake timers must NOT be active until the request's real I/O (auth, DB,
    // cache lookup) has actually reached the fetch call — otherwise the fake
    // clock is advanced before the handler's abort timer even exists, and the
    // frozen setTimeout starves the pg driver + server teardown (this exact
    // test previously hung for 2×300s hook timeouts). Same waitForFetchCall
    // discipline as stripe-branches.test.ts's H8.1b tests.
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = post("https://example.com/timeout-scrape", apiKey);
      // Let real I/O reach the fetch() call so its abort timer is registered.
      for (let i = 0; i < 500 && fetchSpy.mock.calls.length < 1; i++) {
        await vi.advanceTimersByTimeAsync(0);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30000);
      const r = await pending;
      expect(r.status).toBe(500);
      expect(r.data.error_code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(r.data.error).toContain("Firecrawl request failed");
    } finally {
      vi.useRealTimers();
      vi.stubGlobal("fetch", realFetch);
    }
  });
});

describe("POST /v1/research/crawl — Firecrawl transport & malformed-response handling", () => {
  let server: Server;
  let testPort = 0;
  let apiKey = "";

  beforeEach(async () => {
    await resetTestDb();
    const acct = await createAccount("CrawlErr", "crawl-err@test.com", "paid");
    apiKey = (await createApiKey(acct.account_id)).rawKey;
    const router = new Router();
    router.post("/v1/research/crawl", handleFirecrawlCrawl);
    const ts = await startTestServer(router);
    server = ts.server;
    testPort = ts.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    restoreKey();
    vi.unstubAllGlobals();
  });

  function postCrawl(body: unknown, key?: string): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) headers.Authorization = `Bearer ${key}`;
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: testPort, path: "/v1/research/crawl", method: "POST", headers },
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

  it("returns a clean 500 (not a crash) when the Firecrawl fetch itself rejects — transport error", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed"); // mirrors Node/undici's real connection-failure error
      }),
    );
    const r = await postCrawl({ url: "https://example.com", limit: 5 }, apiKey);
    expect(r.status).toBe(500);
    expect(r.data.error_code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(r.data.error).toContain("Firecrawl request failed");
  });

  it("doesn't crash on a 200 response with a malformed body — falls back to zero pages crawled", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    // Well-formed JSON, ok:true, but no `data.scrapeResults` — missing/empty shape.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    const r = await postCrawl({ url: "https://example.com", limit: 5 }, apiKey);
    // `firecrawlData.data?.scrapeResults?.length ?? 0` and `?.map(...) ?? []` mean
    // this is NOT an error — it succeeds with 0 pages rather than throwing, and
    // (since 0 pages were "crawled") draws nothing from the free pool and bills $0.
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.data.pages_crawled).toBe(0);
    expect(r.data.data.pages).toEqual([]);
    expect(r.data.paid_pages).toBe(0);
    expect(r.data.free_pages_used).toBe(0);
    expect(r.data.cost).toBe("$0.00");
  });

  it("returns a clean 500 (not a crash) when the Firecrawl call outlives the 60s client-side timeout (H8.1b)", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    // See the scrape-path H8.1b test above for why fake timers must not be
    // advanced until the request's real I/O has reached the fetch call.
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = postCrawl({ url: "https://example.com", limit: 5 }, apiKey);
      for (let i = 0; i < 500 && fetchSpy.mock.calls.length < 1; i++) {
        await vi.advanceTimersByTimeAsync(0);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60000);
      const r = await pending;
      expect(r.status).toBe(500);
      expect(r.data.error_code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(r.data.error).toContain("Firecrawl request failed");
    } finally {
      vi.useRealTimers();
      vi.stubGlobal("fetch", realFetch);
    }
  });
});
