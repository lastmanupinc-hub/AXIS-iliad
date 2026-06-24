import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import {
  normalizeUrl,
  getCachedScrape,
  putCachedScrape,
  cleanupExpiredScrapes,
  getScrapeCacheStats,
  _clearScrapeCacheForTests,
} from "./scrape-cache-store.js";

describe("scrape cache (24h shared)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await _clearScrapeCacheForTests();
  });

  it("misses on an uncached URL", async () => {
    expect(await getCachedScrape("https://example.com/a")).toBeNull();
  });

  it("stores then serves a hit, incrementing hit_count", async () => {
    await putCachedScrape("https://example.com/a", "# hello", { title: "A" }, 200);
    const hit = await getCachedScrape("https://example.com/a");
    expect(hit).not.toBeNull();
    expect(hit!.markdown).toBe("# hello");
    expect(hit!.metadata).toEqual({ title: "A" });
    expect(hit!.hit_count).toBe(1);
    // second read bumps again
    expect((await getCachedScrape("https://example.com/a"))!.hit_count).toBe(2);
  });

  it("normalizes scheme/host case and drops the fragment for the key", async () => {
    await putCachedScrape("https://Example.com/Path#frag", "cached", {}, 200);
    expect(await getCachedScrape("HTTPS://example.com/Path")).not.toBeNull(); // same after normalize
    expect(normalizeUrl("https://Example.com/Path#x")).toBe("https://example.com/Path");
  });

  it("treats path/query as case-sensitive (distinct keys)", async () => {
    await putCachedScrape("https://example.com/A", "upper", {}, 200);
    expect(await getCachedScrape("https://example.com/a")).toBeNull(); // different path case
  });

  it("does not serve an expired entry, and cleanup removes it", async () => {
    await putCachedScrape("https://example.com/old", "stale", {}, 200, -1); // already expired
    expect(await getCachedScrape("https://example.com/old")).toBeNull();
    expect(await cleanupExpiredScrapes()).toBe(1);
  });

  it("reports stats (hottest URL by hits)", async () => {
    await putCachedScrape("https://example.com/hot", "h", {}, 200);
    await getCachedScrape("https://example.com/hot");
    await getCachedScrape("https://example.com/hot");
    await putCachedScrape("https://example.com/cold", "c", {}, 200);
    const stats = await getScrapeCacheStats();
    expect(stats.total_entries).toBe(2);
    expect(stats.hottest_url).toBe("https://example.com/hot");
    expect(stats.hottest_url_hits).toBeGreaterThanOrEqual(2);
  });
});
