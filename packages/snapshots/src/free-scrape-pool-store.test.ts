import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  consumeFreeScrapes,
  getFreeScrapePoolStatus,
  FREE_SCRAPE_POOL_MONTHLY,
  _resetFreeScrapePoolForTests,
} from "./free-scrape-pool-store.js";

let accountId = "";

beforeEach(() => {
  openMemoryDb();
  _resetFreeScrapePoolForTests();
  const acct = createAccount("Free Pool Test", "free-pool-test@example.com", "free");
  accountId = acct.account_id;
});

afterEach(() => {
  closeDb();
});

describe("free-scrape-pool-store — basic consumption", () => {
  it("returns full cap remaining for a fresh account", () => {
    const status = getFreeScrapePoolStatus(accountId);
    expect(status.cap).toBe(FREE_SCRAPE_POOL_MONTHLY);
    expect(status.remaining).toBe(FREE_SCRAPE_POOL_MONTHLY);
    expect(status.used).toBe(0);
  });

  it("decrements remaining on a single-page consumption", () => {
    const r = consumeFreeScrapes(accountId, 1);
    expect(r.allowed).toBe(true);
    expect(r.consumed).toBe(1);
    expect(r.remaining).toBe(FREE_SCRAPE_POOL_MONTHLY - 1);
    expect(r.unfunded).toBe(0);
  });

  it("decrements remaining on a multi-page consumption", () => {
    const r = consumeFreeScrapes(accountId, 10);
    expect(r.allowed).toBe(true);
    expect(r.consumed).toBe(10);
    expect(r.remaining).toBe(FREE_SCRAPE_POOL_MONTHLY - 10);
    expect(r.unfunded).toBe(0);
  });

  it("getFreeScrapePoolStatus reflects consumed pages without mutating", () => {
    consumeFreeScrapes(accountId, 5);
    const a = getFreeScrapePoolStatus(accountId);
    const b = getFreeScrapePoolStatus(accountId);
    expect(a.used).toBe(5);
    expect(b.used).toBe(5); // status check is non-mutating
  });
});

describe("free-scrape-pool-store — partial reservation", () => {
  it("consumes only what's available when requested > remaining", () => {
    consumeFreeScrapes(accountId, FREE_SCRAPE_POOL_MONTHLY - 3); // pool down to 3 remaining
    const r = consumeFreeScrapes(accountId, 10); // request more than available
    expect(r.allowed).toBe(true);
    expect(r.consumed).toBe(3);
    expect(r.remaining).toBe(0);
    expect(r.unfunded).toBe(7);
  });

  it("returns allowed=false when pool is fully depleted", () => {
    consumeFreeScrapes(accountId, FREE_SCRAPE_POOL_MONTHLY);
    const r = consumeFreeScrapes(accountId, 5);
    expect(r.allowed).toBe(false);
    expect(r.consumed).toBe(0);
    expect(r.remaining).toBe(0);
    expect(r.unfunded).toBe(5);
  });

  it("never lets remaining go below zero on concurrent-style consumption", () => {
    consumeFreeScrapes(accountId, FREE_SCRAPE_POOL_MONTHLY + 50);
    const status = getFreeScrapePoolStatus(accountId);
    expect(status.remaining).toBe(0);
    expect(status.used).toBe(FREE_SCRAPE_POOL_MONTHLY);
  });
});

describe("free-scrape-pool-store — input validation", () => {
  it("rejects empty account_id (returns allowed=false, no mutation)", () => {
    const r = consumeFreeScrapes("", 1);
    expect(r.allowed).toBe(false);
    expect(r.consumed).toBe(0);
  });

  it("rejects zero or negative request counts", () => {
    const a = consumeFreeScrapes(accountId, 0);
    expect(a.allowed).toBe(false);
    expect(a.consumed).toBe(0);

    const b = consumeFreeScrapes(accountId, -5);
    expect(b.allowed).toBe(false);
    expect(b.consumed).toBe(0);
  });

  it("returns a sensible resets_at timestamp on the next-month boundary", () => {
    const status = getFreeScrapePoolStatus(accountId);
    const resetDate = new Date(status.resets_at);
    expect(resetDate.getUTCDate()).toBe(1);
    expect(resetDate.getUTCHours()).toBe(0);
  });
});

describe("free-scrape-pool-store — month rollover semantics", () => {
  it("treats each account independently", () => {
    const other = createAccount("Other", "other@example.com", "free");
    consumeFreeScrapes(accountId, 80);
    const myStatus = getFreeScrapePoolStatus(accountId);
    const otherStatus = getFreeScrapePoolStatus(other.account_id);
    expect(myStatus.used).toBe(80);
    expect(otherStatus.used).toBe(0);
  });
});
