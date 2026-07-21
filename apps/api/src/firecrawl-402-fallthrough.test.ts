/**
 * H-Phase-A cycle 22 — handleFirecrawlScrape/handleFirecrawlCrawl's post-work
 * charge only checked `chargeResult === null` (MPP not configured), never
 * `chargeResult.status === 402` (a REAL 402 challenge chargeMpp/
 * settleOverageCash had already written+ended to `res`, per chargeMpp's own
 * documented contract in mpp.ts: "MUST return immediately"). This is the
 * NORMAL shape of every first-leg x402 call (no payment credential attached
 * yet) -- not an edge case -- so a protocol-compliant client got a scrape/
 * crawl for free under totally ordinary usage, and the scrape variant
 * additionally populated the 24h shared cache with content nobody paid for,
 * letting the client's own retry serve it for $0 forever after.
 *
 * The unit test suite never configures a real STRIPE_SECRET_KEY, so
 * chargeMpp always short-circuits to `null` in tests -- exactly why this bug
 * was invisible until now. settleOverageCash (imported into handlers.ts from
 * cashier.js) is mocked here to return a real {status:402} (matching
 * chargeMpp's actual contract, including writing+ending a real 402 response)
 * without needing a real Stripe key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, Server } from "node:http";

vi.mock("./cashier.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cashier.js")>();
  return {
    ...actual,
    settleOverageCash: vi.fn(async (_req: unknown, res: import("node:http").ServerResponse) => {
      // Matches chargeMpp's real contract: write+end a 402 challenge and
      // return {status:402} -- the caller MUST return immediately.
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "mock_402_challenge" }));
      return { status: 402 as const };
    }),
  };
});

const putCachedScrapeSpy = vi.fn();
const trackEventSpy = vi.fn();
vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    putCachedScrape: (...args: Parameters<typeof actual.putCachedScrape>) => {
      putCachedScrapeSpy(...args);
      return actual.putCachedScrape(...args);
    },
    trackEvent: (...args: Parameters<typeof actual.trackEvent>) => {
      trackEventSpy(...args);
      return actual.trackEvent(...args);
    },
  };
});

import { resetTestDb, createAccount, createApiKey, consumeFreeScrapes } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleFirecrawlScrape, handleFirecrawlCrawl } from "./handlers.js";

let server: Server;
let testPort = 0;

const ORIGINAL_KEY = process.env.FIRECRAWL_API_KEY;

interface Res { status: number; data: Record<string, unknown> }

function post(path: string, body: unknown, key: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let data: unknown;
          try { data = JSON.parse(Buffer.concat(chunks).toString("utf-8")); } catch { data = {}; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.write(payload);
    r.end();
  });
}

beforeEach(async () => {
  await resetTestDb();
  process.env.FIRECRAWL_API_KEY = "fc-test";
  putCachedScrapeSpy.mockClear();
  trackEventSpy.mockClear();
  const router = new Router();
  router.post("/v1/research/scrape", handleFirecrawlScrape);
  router.post("/v1/research/crawl", handleFirecrawlCrawl);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (ORIGINAL_KEY === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = ORIGINAL_KEY;
  vi.unstubAllGlobals();
});

describe("POST /v1/research/scrape — a real 402 from the post-work charge must not fall through", () => {
  it("does not populate the shared cache, and reports 402, when the post-work charge is a real challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { markdown: "# must not be cached without payment" } }), { status: 200 })),
    );
    const acct = await createAccount("Scrape402Fallthrough", "scrape-402-fallthrough@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);

    const r = await post("/v1/research/scrape", { url: "https://example.com/402-fallthrough-test" }, rawKey);

    expect(r.status).toBe(402);
    // The client's HTTP response resolves as soon as the mocked
    // settleOverageCash's res.end() flushes -- which races against the
    // SERVER's own continued execution (a buggy fall-through awaits
    // trackEvent, a real DB call, before ever reaching putCachedScrape).
    // Wait for that continuation to settle before asserting, or a fast
    // localhost round-trip can resolve `post()` before the bug's own
    // side effect has had a chance to fire, masking a real regression.
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The bug: the handler fell through past the (real, already-ended) 402
    // and proceeded to cache the unpaid scrape -- proving payment was
    // bypassed for every subsequent free cache-hit retry.
    expect(putCachedScrapeSpy).not.toHaveBeenCalled();
  }, 15000);
});

describe("POST /v1/research/crawl — a real 402 from the post-work charge must not fall through", () => {
  it("does not silently succeed when the post-work charge is a real challenge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: { scrapeResults: [{ markdown: "# page", metadata: {} }] } }), { status: 200 })),
    );
    const acct = await createAccount("Crawl402Fallthrough", "crawl-402-fallthrough@test.local", "free");
    const { rawKey } = await createApiKey(acct.account_id);
    // Exhaust the 100-page/month free pool first so this crawl's page is
    // fully unfunded and actually reaches the post-work charge branch
    // (finalAmountCents > 0) -- otherwise the free pool alone covers it and
    // the charge (and therefore the bug) is never exercised at all.
    await consumeFreeScrapes(acct.account_id, 100);

    const r = await post("/v1/research/crawl", { url: "https://example.com/crawl-402-fallthrough", limit: 1 }, rawKey);

    expect(r.status).toBe(402);
    // Same client/server race as the scrape test above: wait for the
    // server's own continuation to settle before asserting on its side
    // effects, or a fast localhost round-trip masks a real regression.
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The bug: the handler fell through past the (real, already-ended) 402
    // and proceeded to trackEvent + attempt a 200 response for an unpaid
    // crawl. trackEvent only fires AFTER the charge check in this handler,
    // so its absence proves the handler returned immediately instead.
    expect(trackEventSpy).not.toHaveBeenCalled();
  }, 15000);
});
