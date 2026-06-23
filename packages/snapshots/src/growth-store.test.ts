import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import { consumeUsageCredits } from "./usage-credit-metering.js";
import { getGrowthSnapshot } from "./growth-store.js";

describe("getGrowthSnapshot", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns zeros on an empty database", async () => {
    const s = await getGrowthSnapshot();
    expect(s.accounts.total).toBe(0);
    expect(s.revenue.estimated_mrr_cents).toBe(0);
    expect(s.revenue.active_subscriptions).toBe(0);
    expect(s.revenue.metered_overage_cents_this_month).toBe(0);
  });

  it("counts accounts by tier and estimates MRR from an auditable basis", async () => {
    await createAccount("F", "f@x.com", "free");
    await createAccount("P", "p@x.com", "paid");
    await createAccount("S", "s@x.com", "suite");
    const s = await getGrowthSnapshot();
    expect(s.accounts).toMatchObject({ total: 3, free: 1, paid: 1, suite: 1 });
    expect(s.accounts.new_24h).toBe(3); // all created just now
    expect(s.accounts.new_7d).toBe(3);
    expect(s.revenue.mrr_basis_cents).toEqual({ paid: 2900, suite: 29900 });
    expect(s.revenue.estimated_mrr_cents).toBe(2900 + 29900);
  });

  it("counts metered overage billed this month as concrete revenue", async () => {
    const acct = await createAccount("Over", "over@x.com", "free");
    // Free allowance is 10k credits; a large charge forces overage onto the ledger.
    await consumeUsageCredits(acct.account_id, "free", "analyze_repo", 2000);
    const s = await getGrowthSnapshot();
    expect(s.revenue.metered_overage_cents_this_month).toBeGreaterThan(0);
  });
});
