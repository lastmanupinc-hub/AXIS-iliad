// ─── Scrape Cache Store ─────────────────────────────────────────
//
// 24-hour deduplicated cache for Firecrawl scrape responses, shared across
// every AXIS account. When any agent in the network has scraped a URL in the
// last 24h, the next caller gets the cached markdown for $0 — and AXIS pays
// Firecrawl nothing. This shared-across-customers cache is the differentiator
// vs calling Firecrawl directly.
//
// Cache hit semantics:
//   - URL normalization: lowercase scheme + host, drop fragment, keep
//     path/query intact (case-sensitive — matters for signed/JSON/content URLs).
//   - Hash: SHA-256 hex of the normalized URL.
//   - TTL: 24h default. Stored with absolute expires_at so a restart or schema
//     change doesn't extend stale entries.
//   - hit_count incremented on every fetch for telemetry (pre-warm candidates).

import { createHash } from "node:crypto";
import { sql } from "./pg.js";

export interface CachedScrape {
  url: string;
  markdown: string;
  metadata: Record<string, unknown>;
  status_code: number;
  created_at: string;
  expires_at: string;
  hit_count: number;
  age_seconds: number;
}

export interface ScrapeCacheStats {
  total_entries: number;
  total_hits_lifetime: number;
  avg_hits_per_entry: number;
  oldest_entry_age_hours: number | null;
  hottest_url: string | null;
  hottest_url_hits: number;
}

const DEFAULT_TTL_SECONDS = 86_400; // 24h

/** Normalize a URL for cache key generation. Lowercase scheme+host, drop fragment. */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = ""; // drop fragment
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.host = parsed.host.toLowerCase();
    // toString() preserves path/query case-sensitivity (signed/content URLs).
    return parsed.toString();
  } catch {
    // If URL parsing fails, fall back to a trimmed lowercase of the raw string.
    return rawUrl.trim().toLowerCase();
  }
}

function hashUrl(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex");
}

/**
 * Look up a cached scrape result by URL. Returns null if absent or expired.
 * On hit, atomically increments hit_count.
 */
export async function getCachedScrape(url: string): Promise<CachedScrape | null> {
  const url_hash = hashUrl(url);
  const now = new Date().toISOString();

  const row = await sql.one<{
    url: string;
    markdown: string;
    metadata: string;
    status_code: number;
    created_at: string;
    expires_at: string;
    hit_count: number;
  }>(
    `SELECT url, markdown, metadata, status_code, created_at, expires_at, hit_count
       FROM scrape_cache
      WHERE url_hash = ? AND expires_at > ?`,
    [url_hash, now],
  );

  if (!row) return null;

  await sql.run(
    `UPDATE scrape_cache
       SET hit_count = hit_count + 1, last_hit_at = ?
     WHERE url_hash = ?`,
    [now, url_hash],
  );

  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(row.metadata) as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  const ageMs = Date.now() - new Date(row.created_at).getTime();
  return {
    url: row.url,
    markdown: row.markdown,
    metadata,
    status_code: row.status_code,
    created_at: row.created_at,
    expires_at: row.expires_at,
    hit_count: row.hit_count + 1,
    age_seconds: Math.floor(ageMs / 1000),
  };
}

/**
 * Store a scrape result. Upserts on URL hash — newer scrapes replace older ones
 * with a fresh TTL. Only success responses (2xx) should be cached by convention.
 */
export async function putCachedScrape(
  url: string,
  markdown: string,
  metadata: Record<string, unknown> = {},
  statusCode = 200,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  if (!url || typeof url !== "string") return;
  if (typeof markdown !== "string") return;

  const url_hash = hashUrl(url);
  const normalized = normalizeUrl(url);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000);

  await sql.run(
    `INSERT INTO scrape_cache
       (url_hash, url, markdown, metadata, status_code, created_at, expires_at, hit_count, last_hit_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
     ON CONFLICT(url_hash) DO UPDATE SET
       url = excluded.url,
       markdown = excluded.markdown,
       metadata = excluded.metadata,
       status_code = excluded.status_code,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at,
       hit_count = 0,
       last_hit_at = NULL`,
    [
      url_hash,
      normalized,
      markdown,
      JSON.stringify(metadata),
      statusCode,
      now.toISOString(),
      expires.toISOString(),
    ],
  );
}

/** Remove all expired entries. Returns the number of rows deleted. */
export async function cleanupExpiredScrapes(): Promise<number> {
  const now = new Date().toISOString();
  return (await sql.run(`DELETE FROM scrape_cache WHERE expires_at <= ?`, [now])).rowCount;
}

/** Aggregate cache stats for /v1/db/stats and analytics. */
export async function getScrapeCacheStats(): Promise<ScrapeCacheStats> {
  const summary = (await sql.one<{
    total_entries: number;
    total_hits: number;
    oldest_created: string | null;
  }>(
    `SELECT COUNT(*) AS total_entries, COALESCE(SUM(hit_count), 0) AS total_hits, MIN(created_at) AS oldest_created
       FROM scrape_cache`,
  ))!;

  const hottest = await sql.one<{ url: string; hit_count: number }>(
    `SELECT url, hit_count FROM scrape_cache ORDER BY hit_count DESC, created_at ASC LIMIT 1`,
  );

  const oldestAgeHours = summary.oldest_created
    ? (Date.now() - new Date(summary.oldest_created).getTime()) / (1000 * 60 * 60)
    : null;
  const avg = summary.total_entries > 0 ? summary.total_hits / summary.total_entries : 0;

  return {
    total_entries: summary.total_entries,
    total_hits_lifetime: summary.total_hits,
    avg_hits_per_entry: Number(avg.toFixed(2)),
    oldest_entry_age_hours: oldestAgeHours !== null ? Number(oldestAgeHours.toFixed(2)) : null,
    hottest_url: hottest?.url ?? null,
    hottest_url_hits: hottest?.hit_count ?? 0,
  };
}

/** Test/debug helper — purge all cache entries. */
export async function _clearScrapeCacheForTests(): Promise<void> {
  await sql.run("DELETE FROM scrape_cache");
}
