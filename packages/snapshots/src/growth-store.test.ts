import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openMemoryDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import { consumeUsageCredits } from "./usage-credit-metering.js";
import { getGrowthSnapshot } from "./growth-store.js";

describe("getGrowthSnapshot", () => {
  beforeEach(() => {
    openMemoryDb();
  });
  afterEach(() => {
    closeDb();
  });

  it("returns zeros on an empty database", () => {
    const s = getGrowthSnapshot();
    expect(s.accounts.total).toBe(0);
    expect(s.revenue.estimated_mrr_cents).toBe(0);
    expect(s.revenue.active_subscriptions).toBe(0);
    expect(s.revenue.metered_overage_cents_this_month).toBe(0);
  });

  it("counts accounts by tier and estimates MRR from an auditable basis", () => {
    createAccount("F", "f@x.com", "free");
    createAccount("P", "p@x.com", "paid");
    createAccount("S", "s@x.com", "suite");
    const s = getGrowthSnapshot();
    expect(s.accounts).toMatchObject({ total: 3, free: 1, paid: 1, suite: 1 });
    expect(s.accounts.new_24h).toBe(3); // all created just now
    expect(s.accounts.new_7d).toBe(3);
    expect(s.revenue.mrr_basis_cents).toEqual({ paid: 2900, suite: 29900 });
    expect(s.revenue.estimated_mrr_cents).toBe(2900 + 29900);
  });

  it("counts metered overage billed this month as concrete revenue", () => {
    const acct = createAccount("Over", "over@x.com", "free");
    // Free allowance is 10k credits; a large charge forces overage onto the ledger.
    consumeUsageCredits(acct.account_id, "free", "analyze_repo", 2000);
    const s = getGrowthSnapshot();
    expect(s.revenue.metered_overage_cents_this_month).toBeGreaterThan(0);
  });
});
