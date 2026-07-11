import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import { consumeUsageCredits } from "./usage-credit-metering.js";
import { recordSettledPayment } from "./payment-receipts-store.js";
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
    // WO-19: settled figures are a TRUE $0 on an empty database — not the tier estimate.
    expect(s.revenue.settled_mrr_cents).toBe(0);
    expect(s.revenue.settled_revenue_cents_all_time).toBe(0);
    expect(s.revenue.revenue_by_tool).toEqual([]);
    expect(s.revenue.first_paid_call_at).toBeNull();
    expect(s.revenue.paying_account_count).toBe(0);
    expect(s.revenue.payment_conversion_rate).toBe(0);
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
    // Zero settled payments — the live figure stays $0 even though the estimate is non-zero.
    expect(s.revenue.settled_mrr_cents).toBe(0);
    expect(s.revenue.payment_conversion_rate).toBe(0);
  });

  it("counts metered overage billed this month as concrete revenue", async () => {
    const acct = await createAccount("Over", "over@x.com", "free");
    // Free allowance is 10k credits; a large charge forces overage onto the ledger.
    await consumeUsageCredits(acct.account_id, "free", "analyze_repo", 2000);
    const s = await getGrowthSnapshot();
    expect(s.revenue.metered_overage_cents_this_month).toBeGreaterThan(0);
  });

  // ─── WO-19: settled revenue (payment_receipts ONLY — cash actually collected) ──

  it("does NOT count unpaid ledger overage as settled revenue (billed != collected)", async () => {
    const a1 = await createAccount("A1", "a1@x.com", "free");
    const a2 = await createAccount("A2", "a2@x.com", "free");
    // Free allowance is 10k credits; a large per-call charge forces overage onto
    // the ledger — but nobody has PAID anything (an abandoned 402 leaves exactly
    // this state). Settled revenue must stay a true $0.
    const r1 = await consumeUsageCredits(a1.account_id, "free", "analyze_repo", 5000);
    const r2 = await consumeUsageCredits(a2.account_id, "free", "iliad_web_research", 3000);
    expect(r1.overage_credits).toBeGreaterThan(0);
    expect(r2.overage_credits).toBeGreaterThan(0);

    const s = await getGrowthSnapshot();
    expect(s.revenue.settled_revenue_cents_all_time).toBe(0);
    expect(s.revenue.settled_mrr_cents).toBe(0);
    expect(s.revenue.paying_account_count).toBe(0);
    expect(s.revenue.payment_conversion_rate).toBe(0);
    expect(s.revenue.first_paid_call_at).toBeNull();
    expect(s.revenue.revenue_by_tool).toEqual([]);
    // The billed-but-uncollected amount stays visible via the separate estimate.
    expect(s.revenue.metered_overage_cents_this_month).toBeGreaterThan(0);
  });

  it("ignores usage_credit_ledger rows fully covered by the plan allowance (no overage)", async () => {
    const acct = await createAccount("Covered", "covered@x.com", "free");
    // A tiny charge stays within the free monthly allowance -> overage_credits stays 0.
    const r = await consumeUsageCredits(acct.account_id, "free", "analyze_repo", 1);
    expect(r.overage_credits).toBe(0);

    const s = await getGrowthSnapshot();
    expect(s.revenue.settled_revenue_cents_all_time).toBe(0);
    expect(s.revenue.paying_account_count).toBe(0);
  });

  it("counts payment_receipts exactly once, even when the same call also wrote a ledger overage row", async () => {
    const acct = await createAccount("Payer", "payer@x.com", "free");
    // A real paid call produces BOTH rows: the usage ledger row (recorded by
    // consumeUsageCredits at capture) AND the cash receipt (recorded by
    // settleOverageCash when the money cleared). Settled revenue must count
    // the receipt only — the old UNION double-counted this exact case.
    const r = await consumeUsageCredits(acct.account_id, "free", "analyze_repo", 5000);
    expect(r.overage_credits).toBeGreaterThan(0);
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 250,
      currency: "usd",
      provider: "stripe",
      external_receipt: "rcpt_123",
    });

    const s = await getGrowthSnapshot();
    expect(s.revenue.settled_revenue_cents_all_time).toBe(250);
    expect(s.revenue.settled_mrr_cents).toBe(250);
    expect(s.revenue.paying_account_count).toBe(1);
    expect(s.revenue.payment_conversion_rate).toBe(1);
    expect(s.revenue.revenue_by_tool).toEqual([{ tool: "analyze_repo", cents: 250, calls: 1 }]);
  });

  it("counts wallet-rail (paid_fc) receipts in settled revenue (H0.3)", async () => {
    // The FC-wallet enforce rail is real settled cash (PAI'D -> its Stripe ->
    // founder settlement); the provider CHECK constraint and TS union must
    // admit it, and the totals must include it.
    const acct = await createAccount("Wallet", "wallet@x.com", "paid");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 150,
      currency: "usd",
      provider: "paid_fc",
    });

    const s = await getGrowthSnapshot();
    expect(s.revenue.settled_revenue_cents_all_time).toBe(150);
    expect(s.revenue.settled_mrr_cents).toBe(150);
    expect(s.revenue.paying_account_count).toBe(1);
  });

  it("excludes settled figures from the trailing-30d window once they age out, but keeps the all-time total", async () => {
    const acct = await createAccount("Old", "old@x.com", "free");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 400,
      currency: "usd",
      provider: "tempo",
      external_receipt: "0xabc",
    });

    // Inject a "now" 45 days in the future -> the 30d trailing window no longer covers the payment.
    const future = new Date(Date.now() + 45 * 86_400_000);
    const s = await getGrowthSnapshot(future);
    expect(s.revenue.settled_revenue_cents_all_time).toBe(400);
    expect(s.revenue.settled_mrr_cents).toBe(0);
  });

  it("is deterministic given a fixed now and fixed rows", async () => {
    const acct = await createAccount("Det", "det@x.com", "free");
    await consumeUsageCredits(acct.account_id, "free", "analyze_repo", 5000);
    const fixedNow = new Date("2026-01-15T00:00:00.000Z");
    const s1 = await getGrowthSnapshot(fixedNow);
    const s2 = await getGrowthSnapshot(fixedNow);
    expect(s1).toEqual(s2);
  });
});
