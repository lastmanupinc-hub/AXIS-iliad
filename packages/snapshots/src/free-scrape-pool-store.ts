// ─── Free Scrape Pool Store ─────────────────────────────────────
//
// Every account gets 100 free Firecrawl pages per calendar month — scrapes OR
// crawl pages both consume from this pool. After the pool is exhausted, extra
// pages bill at the per-page rate (1¢). Combined with the 24h shared scrape
// cache, this is the primary adoption hook: route scraping through AXIS and get
// 100 free pages + network-wide cached responses + a 1¢/page floor. Direct
// Firecrawl callers get none of those.
//
// Counter resets on the first of each calendar month. Atomic check-and-increment
// via a Postgres advisory-lock-serialized transaction (namespace 3) — safe under
// concurrent requests from the same account (H-Phase-A cycle 18: the prior
// plain read-then-write had a TOCTOU race letting concurrent same-account
// requests each read a stale counter and over-consume the free pool).

import { sql, pgPlaceholders } from "./pg.js";

/** Monthly free-page allowance per account (scrape + crawl share it). */
export const FREE_SCRAPE_POOL_MONTHLY = 100;

export interface FreeScrapeConsumption {
  /** Whether any pages were reservable from the pool. */
  allowed: boolean;
  /** Pages actually deducted from the free pool (may be < requested). */
  consumed: number;
  /** Pages remaining in the pool after this consumption. */
  remaining: number;
  /** Monthly cap for this account. */
  cap: number;
  /** Pages the caller must still pay for (requested - consumed). */
  unfunded: number;
  /** Current month key (YYYY-MM). */
  month_key: string;
}

export interface FreeScrapePoolStatus {
  account_id: string;
  month_key: string;
  used: number;
  remaining: number;
  cap: number;
  resets_at: string;
}

function getMonthKey(isoDate = new Date().toISOString()): string {
  return isoDate.slice(0, 7);
}

function getResetDate(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString(); // next month, day 1, UTC
}

/**
 * Consume up to `requested` pages from the account's free pool for the current
 * month, atomically. If the pool is empty: allowed=false, consumed=0,
 * unfunded=requested. If partially available: consumes what's left and the
 * caller charges for `unfunded`.
 */
export async function consumeFreeScrapes(account_id: string, requested = 1): Promise<FreeScrapeConsumption> {
  if (!account_id || requested <= 0) {
    return { allowed: false, consumed: 0, remaining: 0, cap: FREE_SCRAPE_POOL_MONTHLY, unfunded: Math.max(0, requested), month_key: getMonthKey() };
  }

  const month_key = getMonthKey();

  // Serialize per-account consumes (namespace 3 = free-scrape pool) so the
  // counter re-read below is fresh and two concurrent requests for the same
  // account can't both read the same stale `currentUsed` and each believe
  // the full remaining pool is theirs to consume.
  return await sql.tx<FreeScrapeConsumption>(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(3, hashtext($1))", [account_id]);

    const cur = await client.query<{ free_scrapes_used: number }>(
      "SELECT free_scrapes_used FROM account_free_scrape_pool WHERE account_id = $1 AND month_key = $2",
      [account_id, month_key],
    );
    const currentUsed = cur.rows[0]?.free_scrapes_used ?? 0;
    const poolRemaining = Math.max(0, FREE_SCRAPE_POOL_MONTHLY - currentUsed);
    const toConsume = Math.min(requested, poolRemaining);
    const nextUsed = currentUsed + toConsume;

    if (toConsume > 0) {
      await client.query(
        pgPlaceholders(
          `INSERT INTO account_free_scrape_pool (account_id, month_key, free_scrapes_used, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(account_id, month_key) DO UPDATE SET
             free_scrapes_used = excluded.free_scrapes_used,
             updated_at = excluded.updated_at`,
        ),
        [account_id, month_key, nextUsed, new Date().toISOString()],
      );
    }

    return {
      allowed: toConsume > 0,
      consumed: toConsume,
      remaining: Math.max(0, FREE_SCRAPE_POOL_MONTHLY - nextUsed),
      cap: FREE_SCRAPE_POOL_MONTHLY,
      unfunded: requested - toConsume,
      month_key,
    };
  });
}

/** Read-only status check — does not mutate the counter. */
export async function getFreeScrapePoolStatus(account_id: string): Promise<FreeScrapePoolStatus> {
  const month_key = getMonthKey();
  const row = await sql.one<{ free_scrapes_used: number }>(
    `SELECT free_scrapes_used FROM account_free_scrape_pool WHERE account_id = ? AND month_key = ?`,
    [account_id, month_key],
  );

  const used = row?.free_scrapes_used ?? 0;
  return {
    account_id,
    month_key,
    used,
    remaining: Math.max(0, FREE_SCRAPE_POOL_MONTHLY - used),
    cap: FREE_SCRAPE_POOL_MONTHLY,
    resets_at: getResetDate(month_key),
  };
}

/** Test/debug helper — wipe the pool. */
export async function _resetFreeScrapePoolForTests(): Promise<void> {
  await sql.run("DELETE FROM account_free_scrape_pool");
}
