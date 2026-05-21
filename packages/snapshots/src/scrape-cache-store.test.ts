import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb } from "./db.js";
import {
  getCachedScrape,
  putCachedScrape,
  cleanupExpiredScrapes,
  getScrapeCacheStats,
  normalizeUrl,
  _clearScrapeCacheForTests,
} from "./scrape-cache-store.js";

describe("scrape-cache-store — normalizeUrl", () => {
  it("lowercases scheme and host but preserves path and query case", () => {
    expect(normalizeUrl("HTTPS://EXAMPLE.COM/Path?Foo=Bar")).toBe("https://example.com/Path?Foo=Bar");
  });

  it("strips fragments", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
  });

  it("falls back gracefully on a malformed URL", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("scrape-cache-store — get/put round trip", () => {
  beforeEach(() => {
    openMemoryDb();
    _clearScrapeCacheForTests();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns null on cache miss", () => {
    expect(getCachedScrape("https://example.com/missing")).toBeNull();
  });

  it("stores and retrieves a markdown payload with metadata", () => {
    putCachedScrape(
      "https://example.com/docs",
      "# Docs\n\nHello world.",
      { title: "Docs", description: "Test page", lang: "en" },
      200,
    );
    const got = getCachedScrape("https://example.com/docs");
    expect(got).not.toBeNull();
    expect(got!.markdown).toBe("# Docs\n\nHello world.");
    expect(got!.metadata.title).toBe("Docs");
    expect(got!.status_code).toBe(200);
    expect(got!.hit_count).toBe(1);
    expect(got!.age_seconds).toBeGreaterThanOrEqual(0);
  });

  it("treats case-equivalent URLs as the same key", () => {
    putCachedScrape("https://Example.com/page", "body");
    expect(getCachedScrape("HTTPS://example.COM/page")).not.toBeNull();
  });

  it("ignores fragments when matching", () => {
    putCachedScrape("https://example.com/page", "body");
    expect(getCachedScrape("https://example.com/page#hash")).not.toBeNull();
  });

  it("preserves path case (signed URLs / content-addressed paths)", () => {
    putCachedScrape("https://example.com/CaseSensitive", "first");
    putCachedScrape("https://example.com/casesensitive", "second");
    expect(getCachedScrape("https://example.com/CaseSensitive")!.markdown).toBe("first");
    expect(getCachedScrape("https://example.com/casesensitive")!.markdown).toBe("second");
  });

  it("increments hit_count on each read", () => {
    putCachedScrape("https://example.com/hot", "body");
    const a = getCachedScrape("https://example.com/hot");
    const b = getCachedScrape("https://example.com/hot");
    const c = getCachedScrape("https://example.com/hot");
    expect(a!.hit_count).toBe(1);
    expect(b!.hit_count).toBe(2);
    expect(c!.hit_count).toBe(3);
  });

  it("upserts on duplicate URL with a refreshed TTL and zeroed hit counter", () => {
    putCachedScrape("https://example.com/upsert", "v1");
    getCachedScrape("https://example.com/upsert"); // bumps hit_count to 1
    putCachedScrape("https://example.com/upsert", "v2");
    const got = getCachedScrape("https://example.com/upsert");
    expect(got!.markdown).toBe("v2");
    expect(got!.hit_count).toBe(1); // post-upsert read is hit #1
  });

  it("rejects non-string urls and non-string markdown silently (no throw)", () => {
    expect(() => putCachedScrape("", "body")).not.toThrow();
    expect(() => putCachedScrape("https://example.com/x", null as unknown as string)).not.toThrow();
    expect(getCachedScrape("")).toBeNull();
  });
});

describe("scrape-cache-store — TTL and cleanup", () => {
  beforeEach(() => {
    openMemoryDb();
    _clearScrapeCacheForTests();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns null for expired entries (treated as miss)", () => {
    putCachedScrape("https://example.com/expired", "body", {}, 200, -1); // already expired
    expect(getCachedScrape("https://example.com/expired")).toBeNull();
  });

  it("cleanupExpiredScrapes removes expired rows and returns the count", () => {
    putCachedScrape("https://a.com/x", "x", {}, 200, -1);
    putCachedScrape("https://b.com/y", "y", {}, 200, -1);
    putCachedScrape("https://c.com/z", "z", {}, 200, 86_400); // fresh
    const removed = cleanupExpiredScrapes();
    expect(removed).toBe(2);
    expect(getCachedScrape("https://c.com/z")).not.toBeNull();
  });
});

describe("scrape-cache-store — stats", () => {
  beforeEach(() => {
    openMemoryDb();
    _clearScrapeCacheForTests();
  });

  afterEach(() => {
    closeDb();
  });

  it("returns zeros for an empty cache", () => {
    const stats = getScrapeCacheStats();
    expect(stats.total_entries).toBe(0);
    expect(stats.total_hits_lifetime).toBe(0);
    expect(stats.avg_hits_per_entry).toBe(0);
    expect(stats.oldest_entry_age_hours).toBeNull();
    expect(stats.hottest_url).toBeNull();
  });

  it("reports aggregate hits and identifies the hottest URL", () => {
    putCachedScrape("https://example.com/cold", "cold");
    putCachedScrape("https://example.com/hot", "hot");
    getCachedScrape("https://example.com/hot");
    getCachedScrape("https://example.com/hot");
    getCachedScrape("https://example.com/hot");
    getCachedScrape("https://example.com/cold");

    const stats = getScrapeCacheStats();
    expect(stats.total_entries).toBe(2);
    expect(stats.total_hits_lifetime).toBe(4);
    expect(stats.avg_hits_per_entry).toBe(2);
    expect(stats.hottest_url).toBe("https://example.com/hot");
    expect(stats.hottest_url_hits).toBe(3);
  });
});
