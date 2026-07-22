/**
 * Cycle 26 — runWebResearchCrawl's consumeFreeScrapes call (a real Postgres
 * write) ran unguarded AFTER the crawl already incurred its real backend
 * cost. A transient DB failure there used to throw past an already-completed,
 * deliverable crawl: no charge captured, no free-pool bookkeeping recorded,
 * the caller got an error for work AXIS already paid for.
 *
 * consumeFreeScrapes is mocked to throw exactly once, on demand (armed via
 * `armThrow`), simulating a transient failure. sovereignCrawl (the default
 * backend) is mocked too, so this test never makes a real network call.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb, createAccount, createApiKey, getUsageCreditSummary } from "@axis/snapshots";

let armThrow = false;

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    consumeFreeScrapes: (...args: Parameters<typeof actual.consumeFreeScrapes>) => {
      if (armThrow) {
        armThrow = false;
        return Promise.reject(new Error("simulated transient consumeFreeScrapes failure"));
      }
      return actual.consumeFreeScrapes(...args);
    },
  };
});

const mockSovereignCrawl = vi.fn();
vi.mock("./web-research-sovereign.js", () => ({
  sovereignCrawl: (...args: unknown[]) => mockSovereignCrawl(...args),
  sovereignScrape: vi.fn(),
}));

const { runWebResearchCrawl } = await import("./mcp-tool-impls.js");

beforeAll(async () => {
  await resetTestDb();
});

function reqWithKey(rawKey: string): IncomingMessage {
  return { headers: { authorization: `Bearer ${rawKey}` } } as unknown as IncomingMessage;
}

function crawlResult(pageCount: number) {
  return {
    url: "https://example.com",
    pages_crawled: pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({ url: `https://example.com/${i}`, markdown: "content", metadata: {} })),
  };
}

describe("runWebResearchCrawl — survives a transient consumeFreeScrapes failure without losing the crawl or the charge", () => {
  it("still returns the real crawl result (not an uncaught 500) when consumeFreeScrapes throws", async () => {
    const acc = await createAccount("CrawlPoolFailure", "crawl-pool-failure@test.local", "paid");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    mockSovereignCrawl.mockResolvedValueOnce(crawlResult(7));
    armThrow = true;

    const text = await runWebResearchCrawl({ url: "https://example.com", limit: 7 }, reqWithKey(rawKey));
    const parsed = JSON.parse(text) as { pages_crawled: number; free_pages_used: number; paid_pages: number };

    // The crawl itself is real and must still be delivered to the caller.
    expect(parsed.pages_crawled).toBe(7);
    expect(parsed.free_pages_used).toBe(0);
  });

  it("charges the full page count as unfunded (revenue-safe fallback) rather than silently charging nothing", async () => {
    const acc = await createAccount("CrawlPoolFailureCharge", "crawl-pool-failure-charge@test.local", "paid");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    mockSovereignCrawl.mockResolvedValueOnce(crawlResult(7));
    armThrow = true;

    const before = await getUsageCreditSummary(acc.account_id, "paid");
    const text = await runWebResearchCrawl({ url: "https://example.com", limit: 7 }, reqWithKey(rawKey));
    const after = await getUsageCreditSummary(acc.account_id, "paid");
    const parsed = JSON.parse(text) as { paid_pages: number };

    expect(parsed.paid_pages).toBe(7);
    expect(after.included_credits_used).toBeGreaterThan(before.included_credits_used);
  });
});
