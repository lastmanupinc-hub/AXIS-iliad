import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openMemoryDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  FREE_SCRAPE_POOL_MONTHLY,
  consumeFreeScrapes,
  getFreeScrapePoolStatus,
  _resetFreeScrapePoolForTests,
} from "./free-scrape-pool-store.js";

describe("free scrape pool (100 pages/account/month)", () => {
  beforeEach(() => {
    openMemoryDb();
    _resetFreeScrapePoolForTests();
  });
  afterEach(() => {
    closeDb();
  });

  it("starts with the full monthly allowance", () => {
    const acct = createAccount("Pool", "pool@x.com", "paid");
    const s = getFreeScrapePoolStatus(acct.account_id);
    expect(s.remaining).toBe(FREE_SCRAPE_POOL_MONTHLY);
    expect(s.used).toBe(0);
  });

  it("consumes fully when within the pool", () => {
    const acct = createAccount("A", "a@x.com", "paid");
    const c = consumeFreeScrapes(acct.account_id, 10);
    expect(c).toMatchObject({ allowed: true, consumed: 10, unfunded: 0, remaining: 90 });
    expect(getFreeScrapePoolStatus(acct.account_id).used).toBe(10);
  });

  it("partially consumes at the boundary, leaving the rest unfunded", () => {
    const acct = createAccount("B", "b@x.com", "paid");
    consumeFreeScrapes(acct.account_id, 95);
    const c = consumeFreeScrapes(acct.account_id, 10); // only 5 left in the pool
    expect(c).toMatchObject({ allowed: true, consumed: 5, unfunded: 5, remaining: 0 });
  });

  it("returns all-unfunded once the pool is exhausted", () => {
    const acct = createAccount("C", "c@x.com", "paid");
    consumeFreeScrapes(acct.account_id, FREE_SCRAPE_POOL_MONTHLY);
    const c = consumeFreeScrapes(acct.account_id, 3);
    expect(c).toMatchObject({ allowed: false, consumed: 0, unfunded: 3, remaining: 0 });
  });

  it("status is read-only (does not consume)", () => {
    const acct = createAccount("D", "d@x.com", "paid");
    getFreeScrapePoolStatus(acct.account_id);
    getFreeScrapePoolStatus(acct.account_id);
    expect(getFreeScrapePoolStatus(acct.account_id).used).toBe(0);
  });
});
