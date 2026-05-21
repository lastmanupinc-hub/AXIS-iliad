// ─── Free Scrape Pool Store ─────────────────────────────────────
//
// Every account gets 100 free Firecrawl pages per calendar month —
// scrapes OR crawl pages both consume from this pool. After the pool
// is exhausted, additional pages bill at the per-page rate
// (PRICING_TIERS.iliad_web_research[_crawl].standard_cents = 1¢).
//
// Combined with the 24h shared scrape cache, the free pool is the
// primary adoption hook: agents that route their scraping through
// AXIS get 100 free pages, cached responses for popular URLs across
// the whole network, and a 1¢/page floor after that. Direct Firecrawl
// callers get none of those benefits.
//
// Counter resets on the first of each calendar month. Atomic
// check-and-increment via SQLite UPDATE — safe under concurrent
// scrape requests from the same account.

import { getDb } from "./db.js";

/** Monthly free-page allowance per account. Same value applies to scrape and crawl. */
export const FREE_SCRAPE_POOL_MONTHLY = 100;

export interface FreeScrapeConsumption {
  /** Whether the requested page count was reservable (even partially). */
  allowed: boolean;
  /** Number of pages actually deducted from the free pool. May be less than requested. */
  consumed: number;
  /** Number of pages remaining in the pool after this consumption. */
  remaining: number;
  /** Total monthly cap for this account. */
  cap: number;
  /** Number of paid pages the caller still needs to cover. requested - consumed. */
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
  // Next month, first day, midnight UTC.
  const reset = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return reset.toISOString();
}

/**
 * Attempt to consume up to `requested` pages from the account's free pool
 * for the current month. Atomically updates the counter.
 *
 * If the pool has 0 remaining: returns `{ allowed: false, consumed: 0, unfunded: requested }`.
 * If the pool has fewer than requested: consumes what's available, returns
 *   `{ allowed: true, consumed: pool_remaining, unfunded: requested - pool_remaining }`.
 *   The caller is responsible for charging for the unfunded pages.
 */
export function consumeFreeScrapes(
  account_id: string,
  requested = 1,
): FreeScrapeConsumption {
  if (!account_id || requested <= 0) {
    return {
      allowed: false,
      consumed: 0,
      remaining: 0,
      cap: FREE_SCRAPE_POOL_MONTHLY,
      unfunded: Math.max(0, requested),
      month_key: getMonthKey(),
    };
  }

  const db = getDb();
  const month_key = getMonthKey();

  const row = db.prepare(
    `SELECT free_scrapes_used FROM account_free_scrape_pool
      WHERE account_id = ? AND month_key = ?`,
  ).get(account_id, month_key) as { free_scrapes_used: number } | undefined;

  const currentUsed = row?.free_scrapes_used ?? 0;
  const poolRemaining = Math.max(0, FREE_SCRAPE_POOL_MONTHLY - currentUsed);
  const toConsume = Math.min(requested, poolRemaining);
  const nextUsed = currentUsed + toConsume;

  if (toConsume > 0) {
    db.prepare(
      `INSERT INTO account_free_scrape_pool
         (account_id, month_key, free_scrapes_used, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id, month_key) DO UPDATE SET
         free_scrapes_used = excluded.free_scrapes_used,
         updated_at = excluded.updated_at`,
    ).run(account_id, month_key, nextUsed, new Date().toISOString());
  }

  return {
    allowed: toConsume > 0,
    consumed: toConsume,
    remaining: Math.max(0, FREE_SCRAPE_POOL_MONTHLY - nextUsed),
    cap: FREE_SCRAPE_POOL_MONTHLY,
    unfunded: requested - toConsume,
    month_key,
  };
}

/** Read-only status check — does not mutate the counter. */
export function getFreeScrapePoolStatus(account_id: string): FreeScrapePoolStatus {
  const db = getDb();
  const month_key = getMonthKey();
  const row = db.prepare(
    `SELECT free_scrapes_used FROM account_free_scrape_pool
      WHERE account_id = ? AND month_key = ?`,
  ).get(account_id, month_key) as { free_scrapes_used: number } | undefined;

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

/** Test/debug helper — wipe the pool. Not used in production code paths. */
export function _resetFreeScrapePoolForTests(): void {
  const db = getDb();
  db.prepare("DELETE FROM account_free_scrape_pool").run();
}
