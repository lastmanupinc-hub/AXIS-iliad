import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount, updateAccountPaidPlanId } from "./billing-store.js";
import { consumeUsageCredits } from "./usage-credit-metering.js";
import { recordSettledPayment } from "./payment-receipts-store.js";
import { recordCompensationOwed, claimCompensationForCredit } from "./compensation-store.js";
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
    expect(s.revenue.mrr_basis_cents).toEqual({ starter: 2900, pro: 9900, suite: 29900 });
    // No paid_plan_id set — defaults to Starter, matching resolvePlanForAccount.
    expect(s.revenue.estimated_mrr_cents).toBe(2900 + 29900);
    // Zero settled payments — the live figure stays $0 even though the estimate is non-zero.
    expect(s.revenue.settled_mrr_cents).toBe(0);
    expect(s.revenue.payment_conversion_rate).toBe(0);
  });

  // H-Phase-A cycle 2: Starter and Pro both collapse into tier==='paid', so
  // the estimate previously always priced every "paid" account at Starter's
  // $29 — undercounting every real Pro subscriber's contribution to MRR.
  it("prices a Pro subscriber at $99, not Starter's $29, in the MRR estimate", async () => {
    await createAccount("Starter", "starter@x.com", "paid");
    const proAcct = await createAccount("Pro", "pro@x.com", "paid");
    await updateAccountPaidPlanId(proAcct.account_id, "pro");

    const s = await getGrowthSnapshot();
    expect(s.accounts).toMatchObject({ paid: 2 });
    // starter@$29 + pro@$99, not 2 * $29.
    expect(s.revenue.estimated_mrr_cents).toBe(2900 + 9900);
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

  // H8.3 — mutation-lite kill: recordSettledPayment always stamps created_at with the
  // real wall clock, so no other test in this file lands a receipt EXACTLY on the 30d
  // cutoff instant (`now - 30d`) — insert directly so the boundary itself is pinned.
  it("includes a settlement landing exactly ON the 30d trailing-window boundary (inclusive edge)", async () => {
    const acct = await createAccount("Edge", "edge@x.com", "free");
    const now = new Date("2026-03-01T00:00:00.000Z");
    const since30d = new Date(now.getTime() - 30 * 86_400_000); // the exact cutoff instant getGrowthSnapshot computes
    await sql.run(
      `INSERT INTO payment_receipts
        (id, account_id, tool, amount_cents, currency, provider, external_receipt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), acct.account_id, "analyze_repo", 275, "usd", "stripe", null, since30d.toISOString()],
    );

    const s = await getGrowthSnapshot(now);
    // The trailing window is inclusive of the cutoff instant itself — a receipt
    // created AT now-30d must still count toward settled_mrr_cents, not just
    // strictly-after it.
    expect(s.revenue.settled_mrr_cents).toBe(275);
    expect(s.revenue.settled_revenue_cents_all_time).toBe(275);
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

describe("getGrowthSnapshot — compensation owed (H2.4)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("is zero on an empty database", async () => {
    const s = await getGrowthSnapshot();
    expect(s.revenue.compensation_owed_cents_all_time).toBe(0);
    expect(s.revenue.settled_revenue_cents_all_time_net_of_compensation).toBe(0);
  });

  it("subtracts owed compensation from the NET figure WITHOUT altering the raw receipts sum", async () => {
    const acct = await createAccount("Payer", "comp-payer@x.com", "paid");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 500,
      currency: "usd",
      provider: "stripe",
      external_receipt: "rcpt_comp_1",
    });
    await recordCompensationOwed({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 150,
      reason: "settled_then_error",
    });

    const s = await getGrowthSnapshot();
    // The raw receipts sum is untouched — its own documented definition
    // ("the penny-exact record of what was actually collected") must never
    // silently drift because of an unrelated compensation obligation.
    expect(s.revenue.settled_revenue_cents_all_time).toBe(500);
    expect(s.revenue.compensation_owed_cents_all_time).toBe(150);
    expect(s.revenue.settled_revenue_cents_all_time_net_of_compensation).toBe(350);
  });

  it("a credited (made-whole) entry no longer counts as owed", async () => {
    const acct = await createAccount("Made Whole", "made-whole@x.com", "paid");
    const entry = await recordCompensationOwed({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 80,
      reason: "wallet_rail_ambiguous",
    });
    await claimCompensationForCredit(entry.entry_id);

    const s = await getGrowthSnapshot();
    expect(s.revenue.compensation_owed_cents_all_time).toBe(0);
    expect(s.revenue.settled_revenue_cents_all_time_net_of_compensation).toBe(
      s.revenue.settled_revenue_cents_all_time,
    );
  });

  it("net can go negative when owed compensation exceeds settled revenue — a real risk signal, not floored away", async () => {
    const acct = await createAccount("Underwater", "underwater@x.com", "paid");
    await recordCompensationOwed({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 1000,
      reason: "wallet_rail_ambiguous",
    });

    const s = await getGrowthSnapshot();
    expect(s.revenue.settled_revenue_cents_all_time).toBe(0);
    expect(s.revenue.compensation_owed_cents_all_time).toBe(1000);
    expect(s.revenue.settled_revenue_cents_all_time_net_of_compensation).toBe(-1000);
  });
});
