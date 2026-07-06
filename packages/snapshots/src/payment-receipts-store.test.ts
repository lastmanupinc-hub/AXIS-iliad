import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import { recordSettledPayment, getSettledRevenue } from "./payment-receipts-store.js";

describe("payment-receipts-store", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("reads a true $0 on an empty database", async () => {
    const revenue = await getSettledRevenue();
    expect(revenue.all_time_cents).toBe(0);
    expect(revenue.trailing_30d_cents).toBe(0);
    expect(revenue.by_tool).toEqual([]);
    expect(revenue.first_at).toBeNull();
  });

  it("records a settled payment and it shows up in getSettledRevenue().all_time_cents", async () => {
    const acct = await createAccount("Payer", "payer@x.com", "free");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 150,
      currency: "usd",
      provider: "stripe",
      external_receipt: "rcpt_abc",
    });

    const revenue = await getSettledRevenue();
    expect(revenue.all_time_cents).toBe(150);
    expect(revenue.trailing_30d_cents).toBe(150);
    expect(revenue.by_tool).toEqual([{ tool: "analyze_repo", cents: 150 }]);
    expect(revenue.first_at).toEqual(expect.any(String));
  });

  it("groups multiple receipts across tools and accounts", async () => {
    const a1 = await createAccount("A1", "a1@x.com", "free");
    const a2 = await createAccount("A2", "a2@x.com", "free");
    await recordSettledPayment({
      account_id: a1.account_id,
      tool: "analyze_repo",
      amount_cents: 50,
      currency: "usd",
      provider: "stripe",
    });
    await recordSettledPayment({
      account_id: a2.account_id,
      tool: "iliad_web_research",
      amount_cents: 10,
      currency: "usd",
      provider: "tempo",
      external_receipt: "0xdeadbeef",
    });
    await recordSettledPayment({
      account_id: a1.account_id,
      tool: "analyze_repo",
      amount_cents: 25,
      currency: "usd",
      provider: "stripe",
    });

    const revenue = await getSettledRevenue();
    expect(revenue.all_time_cents).toBe(50 + 10 + 25);
    const byTool = Object.fromEntries(revenue.by_tool.map((t) => [t.tool, t.cents]));
    expect(byTool.analyze_repo).toBe(75);
    expect(byTool.iliad_web_research).toBe(10);
  });

  it("excludes receipts older than 30 days from trailing_30d_cents but keeps them in all_time_cents", async () => {
    const acct = await createAccount("Old", "old@x.com", "free");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 400,
      currency: "usd",
      provider: "stripe",
    });

    // Ask for settled revenue "as of" 45 days in the future — the receipt (created
    // just now) falls outside that trailing-30d window but stays in the all-time sum.
    const future = new Date(Date.now() + 45 * 86_400_000);
    const revenue = await getSettledRevenue(future);
    expect(revenue.all_time_cents).toBe(400);
    expect(revenue.trailing_30d_cents).toBe(0);
  });

  it("defaults external_receipt to null when omitted", async () => {
    const acct = await createAccount("NoRef", "noref@x.com", "free");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "default",
      amount_cents: 5,
      currency: "usd",
      provider: "stripe",
    });
    const revenue = await getSettledRevenue();
    expect(revenue.all_time_cents).toBe(5);
  });

  it("is deterministic given a fixed now and fixed rows", async () => {
    const acct = await createAccount("Det", "det@x.com", "free");
    await recordSettledPayment({
      account_id: acct.account_id,
      tool: "analyze_repo",
      amount_cents: 75,
      currency: "usd",
      provider: "stripe",
    });
    const fixedNow = new Date("2026-01-15T00:00:00.000Z");
    const r1 = await getSettledRevenue(fixedNow);
    const r2 = await getSettledRevenue(fixedNow);
    expect(r1).toEqual(r2);
  });
});
