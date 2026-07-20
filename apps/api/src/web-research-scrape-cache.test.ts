/**
 * H-Phase-A cycle 19 — the MCP tool `iliad_web_research` never read or wrote
 * the 24h shared scrape cache (getCachedScrape/putCachedScrape) that REST's
 * handleFirecrawlScrape already uses. An MCP scrape of a URL any caller
 * (REST or MCP) already scraped in the last 24h paid full price instead of
 * the documented $0 cache hit, and an MCP scrape never populated the cache
 * for the next caller either.
 *
 * sovereignScrape (the default backend, no Firecrawl key needed) is mocked
 * to return a fixed result so this test never makes a real network call.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { IncomingMessage } from "node:http";
import { resetTestDb, createAccount, createApiKey, getUsageCreditSummary, getCachedScrape } from "@axis/snapshots";

beforeAll(async () => {
  await resetTestDb();
});

const mockSovereignScrape = vi.fn();
vi.mock("./web-research-sovereign.js", () => ({
  sovereignScrape: (...args: unknown[]) => mockSovereignScrape(...args),
  sovereignCrawl: vi.fn(),
}));

const { runWebResearch } = await import("./mcp-tool-impls.js");

function reqWithKey(rawKey: string): IncomingMessage {
  return { headers: { authorization: `Bearer ${rawKey}` } } as unknown as IncomingMessage;
}

describe("runWebResearch — reads and writes the shared 24h scrape cache", () => {
  it("a fresh URL scrape populates the cache, and a second call for the SAME URL is a free cache hit (no second backend call, no second charge)", async () => {
    const acc = await createAccount("ScrapeCacheWrite", "scrape-cache-write@test.local", "paid");
    const { rawKey } = await createApiKey(acc.account_id, "test");
    mockSovereignScrape.mockResolvedValueOnce({ url: "https://example.com/cached-page", markdown: "# Hello", metadata: { title: "Hello" } });

    const before = await getUsageCreditSummary(acc.account_id, "paid");
    const firstText = await runWebResearch({ url: "https://example.com/cached-page" }, reqWithKey(rawKey));
    const firstParsed = JSON.parse(firstText) as { cached?: boolean; markdown: string };
    expect(firstParsed.cached).toBeUndefined();
    expect(firstParsed.markdown).toBe("# Hello");
    const afterFirst = await getUsageCreditSummary(acc.account_id, "paid");
    expect(afterFirst.included_credits_used).toBeGreaterThan(before.included_credits_used);

    // Confirm the cache was actually populated by the tool itself.
    const cached = await getCachedScrape("https://example.com/cached-page");
    expect(cached?.markdown).toBe("# Hello");

    // A second MCP call for the SAME URL must be a free cache hit — before
    // the fix, this would call sovereignScrape a second time and charge again.
    const secondText = await runWebResearch({ url: "https://example.com/cached-page" }, reqWithKey(rawKey));
    const secondParsed = JSON.parse(secondText) as { cached?: boolean; markdown: string };
    expect(secondParsed.cached).toBe(true);
    expect(secondParsed.markdown).toBe("# Hello");
    const afterSecond = await getUsageCreditSummary(acc.account_id, "paid");
    expect(afterSecond.included_credits_used).toBe(afterFirst.included_credits_used);
    expect(mockSovereignScrape).toHaveBeenCalledTimes(1);
  });
});
