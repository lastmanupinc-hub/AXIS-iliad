import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import {
  FREE_SCRAPE_POOL_MONTHLY,
  consumeFreeScrapes,
  getFreeScrapePoolStatus,
  _resetFreeScrapePoolForTests,
} from "./free-scrape-pool-store.js";

describe("free scrape pool (100 pages/account/month)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await _resetFreeScrapePoolForTests();
  });

  it("starts with the full monthly allowance", async () => {
    const acct = await createAccount("Pool", "pool@x.com", "paid");
    const s = await getFreeScrapePoolStatus(acct.account_id);
    expect(s.remaining).toBe(FREE_SCRAPE_POOL_MONTHLY);
    expect(s.used).toBe(0);
  });

  it("consumes fully when within the pool", async () => {
    const acct = await createAccount("A", "a@x.com", "paid");
    const c = await consumeFreeScrapes(acct.account_id, 10);
    expect(c).toMatchObject({ allowed: true, consumed: 10, unfunded: 0, remaining: 90 });
    expect((await getFreeScrapePoolStatus(acct.account_id)).used).toBe(10);
  });

  it("partially consumes at the boundary, leaving the rest unfunded", async () => {
    const acct = await createAccount("B", "b@x.com", "paid");
    await consumeFreeScrapes(acct.account_id, 95);
    const c = await consumeFreeScrapes(acct.account_id, 10); // only 5 left in the pool
    expect(c).toMatchObject({ allowed: true, consumed: 5, unfunded: 5, remaining: 0 });
  });

  it("returns all-unfunded once the pool is exhausted", async () => {
    const acct = await createAccount("C", "c@x.com", "paid");
    await consumeFreeScrapes(acct.account_id, FREE_SCRAPE_POOL_MONTHLY);
    const c = await consumeFreeScrapes(acct.account_id, 3);
    expect(c).toMatchObject({ allowed: false, consumed: 0, unfunded: 3, remaining: 0 });
  });

  it("status is read-only (does not consume)", async () => {
    const acct = await createAccount("D", "d@x.com", "paid");
    await getFreeScrapePoolStatus(acct.account_id);
    await getFreeScrapePoolStatus(acct.account_id);
    expect((await getFreeScrapePoolStatus(acct.account_id)).used).toBe(0);
  });

  it("under concurrent same-account requests, total consumed never exceeds the monthly cap (H-Phase-A cycle 18 TOCTOU fix)", async () => {
    const acct = await createAccount("Race", "race@x.com", "paid");
    // 10 concurrent requests for 20 pages each = 200 requested; the pool only
    // holds 100, so total consumed across ALL of them must be exactly 100 —
    // before the advisory-lock fix, a plain read-then-write let concurrent
    // requests each read the same stale counter and over-consume.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => consumeFreeScrapes(acct.account_id, 20)),
    );
    const totalConsumed = results.reduce((sum, r) => sum + r.consumed, 0);
    expect(totalConsumed).toBe(FREE_SCRAPE_POOL_MONTHLY);
    expect((await getFreeScrapePoolStatus(acct.account_id)).used).toBe(FREE_SCRAPE_POOL_MONTHLY);
  });
});
