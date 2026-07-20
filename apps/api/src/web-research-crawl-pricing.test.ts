/**
 * H-Phase-A cycle 19 (lead unit, disclosed since cycle 17) — the MCP tool
 * `iliad_web_research_crawl` charged a FLAT per-call fee (authorizeMcpToolCredits'
 * fixed PRICING_TIERS price) regardless of `limit` (1-100 pages) or actual
 * pages crawled, and never drew down the shared 100-page/month free pool at
 * all — up to a ~100x undercharge and a free-pool accounting bypass on a
 * tool explicitly designed as a monetization lever. REST's twin
 * (handleFirecrawlCrawl) correctly computes `perPageCents * unfundedPages`
 * after drawing down the pool.
 *
 * sovereignCrawl (the default backend, no Firecrawl key needed) is mocked to
 * return a fixed page count so this test never makes a real network call.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb, createAccount, createApiKey, getUsageCreditSummary, getFreeScrapePoolStatus, consumeFreeScrapes, creditsFromUsdCents } from "@axis/snapshots";

beforeAll(async () => {
  await resetTestDb();
});

const mockSovereignCrawl = vi.fn();
vi.mock("./web-research-sovereign.js", () => ({
  sovereignCrawl: (...args: unknown[]) => mockSovereignCrawl(...args),
  sovereignScrape: vi.fn(),
}));

const { runWebResearchCrawl } = await import("./mcp-tool-impls.js");

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

describe("runWebResearchCrawl — prices per actual page and draws down the free pool", () => {
  it("a fresh account's crawl draws down the shared free-scrape pool by the actual page count", async () => {
    const acc = await createAccount("CrawlPoolDraw", "crawl-pool-draw@test.local", "paid");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    mockSovereignCrawl.mockResolvedValueOnce(crawlResult(5));

    // Before the fix: the free pool was never touched by this MCP tool at all.
    const text = await runWebResearchCrawl({ url: "https://example.com", limit: 5 }, reqWithKey(rawKey));
    const parsed = JSON.parse(text) as { free_pages_used: number; free_pages_remaining: number; paid_pages: number };
    expect(parsed.free_pages_used).toBe(5);
    expect(parsed.free_pages_remaining).toBe(95);
    expect(parsed.paid_pages).toBe(0);

    const status = await getFreeScrapePoolStatus(acc.account_id);
    expect(status.used).toBe(5);
  });

  it("once the free pool is exhausted, credits consumed scale with actual page count, not a flat per-call fee", async () => {
    const acc = await createAccount("CrawlPerPage", "crawl-per-page@test.local", "paid");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    // Exhaust the free pool so every crawled page below is unfunded.
    await consumeFreeScrapes(acc.account_id, 100);
    mockSovereignCrawl.mockResolvedValueOnce(crawlResult(10));

    const before = await getUsageCreditSummary(acc.account_id, "paid");
    const text = await runWebResearchCrawl({ url: "https://example.com", limit: 10 }, reqWithKey(rawKey));
    const after = await getUsageCreditSummary(acc.account_id, "paid");

    const parsed = JSON.parse(text) as { paid_pages: number };
    expect(parsed.paid_pages).toBe(10);

    // 10 unfunded pages @ 1 cent/page = 10 cents = ceil(10/0.18) = 56 credits.
    // Before the fix, a flat 1-cent-per-call charge would have consumed only
    // ceil(1/0.18) = 6 credits regardless of how many pages were crawled.
    const expectedCreditsDelta = creditsFromUsdCents(10);
    expect(expectedCreditsDelta).toBe(56);
    expect(after.included_credits_used - before.included_credits_used).toBe(expectedCreditsDelta);
  });
});
