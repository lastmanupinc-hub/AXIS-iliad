/**
 * H2.4 — the compensator (WO-20 phase 3): claims an 'owed' compensation_ledger
 * row and grants the account usage-credit headroom equal to the owed cents.
 * Real DB throughout (no mocks) — this IS the wiring between two real stores,
 * so mocking either side would prove nothing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  resetTestDb,
  createAccount,
  recordCompensationOwed,
  getCompensationSummary,
  getUsageCreditSummary,
} from "@axis/snapshots";
import * as snapshots from "@axis/snapshots";
import { compensateEntry, compensateAccountOwed, compensateAndSummarize } from "./compensator.js";

beforeEach(async () => {
  await resetTestDb();
});

async function owed(accountId: string, cents: number, tool = "analyze_repo") {
  return recordCompensationOwed({
    account_id: accountId,
    tool,
    amount_cents: cents,
    reason: "settled_then_error",
  });
}

describe("compensateEntry", () => {
  it("claims the entry and grants matching usage-credit headroom", async () => {
    const acct = await createAccount("Comp", "comp-entry@test.com", "paid");
    const entry = await owed(acct.account_id, 200);

    const before = await getUsageCreditSummary(acct.account_id, "paid");
    const did = await compensateEntry(entry.entry_id);
    expect(did).toBe(true);

    const after = await getUsageCreditSummary(acct.account_id, "paid");
    expect(after.included_credits_remaining).toBeGreaterThan(before.included_credits_remaining);

    const summary = await getCompensationSummary(acct.account_id);
    expect(summary).toEqual({ owed_cents: 0, credited_cents: 200 });
  });

  it("is idempotent — a second call on the same entry_id grants nothing more", async () => {
    const acct = await createAccount("CompIdem", "comp-idem@test.com", "paid");
    const entry = await owed(acct.account_id, 300);

    expect(await compensateEntry(entry.entry_id)).toBe(true);
    const afterFirst = await getUsageCreditSummary(acct.account_id, "paid");

    expect(await compensateEntry(entry.entry_id)).toBe(false); // already claimed — no-op
    const afterSecond = await getUsageCreditSummary(acct.account_id, "paid");
    expect(afterSecond.included_credits_remaining).toBe(afterFirst.included_credits_remaining);

    const summary = await getCompensationSummary(acct.account_id);
    expect(summary.credited_cents).toBe(300); // not 600 — one grant, not two
  });

  it("returns false for an unknown entry_id", async () => {
    expect(await compensateEntry("no-such-entry")).toBe(false);
  });
});

describe("compensateAccountOwed", () => {
  it("sweeps every owed entry for the account, leaving other accounts untouched", async () => {
    const acct = await createAccount("Sweep", "sweep@test.com", "paid");
    const other = await createAccount("SweepOther", "sweep-other@test.com", "paid");
    await owed(acct.account_id, 50);
    await owed(acct.account_id, 75, "iliad_web_search");
    await owed(other.account_id, 999);

    await compensateAccountOwed(acct.account_id);

    expect(await getCompensationSummary(acct.account_id)).toEqual({ owed_cents: 0, credited_cents: 125 });
    expect(await getCompensationSummary(other.account_id)).toEqual({ owed_cents: 999, credited_cents: 0 });
  });

  it("a grant failure on one entry does not stop the rest of the sweep", async () => {
    const acct = await createAccount("Resilient", "resilient@test.com", "paid");
    await owed(acct.account_id, 10);
    await owed(acct.account_id, 20);

    const spy = vi.spyOn(snapshots, "grantUsageCredits").mockRejectedValueOnce(new Error("boom"));
    await compensateAccountOwed(acct.account_id);

    // The loop reached BOTH entries (2 grantUsageCredits calls) despite the
    // first one throwing — proof the try/catch inside the sweep loop moved on
    // instead of aborting. Both entries are claimed regardless of grant outcome
    // (claim-then-grant — the same disclosed crash-gap tradeoff cashier.ts's
    // wallet-ambiguity path documents), so the ledger shows zero still owed.
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();

    const summary = await getCompensationSummary(acct.account_id);
    expect(summary.owed_cents).toBe(0);
  });
});

describe("compensateAndSummarize", () => {
  it("sweeps then returns the resulting summary", async () => {
    const acct = await createAccount("Summarize", "summarize@test.com", "paid");
    await owed(acct.account_id, 60);

    const result = await compensateAndSummarize(acct.account_id);
    expect(result).toEqual({ owed_cents: 0, credited_cents: 60 });
  });

  it("returns a zeroed summary and never throws for an account with nothing owed", async () => {
    const acct = await createAccount("Quiet", "quiet@test.com", "free");
    await expect(compensateAndSummarize(acct.account_id)).resolves.toEqual({ owed_cents: 0, credited_cents: 0 });
  });

  it("never throws even when the underlying sweep fails entirely", async () => {
    const acct = await createAccount("Fails", "fails@test.com", "free");
    await owed(acct.account_id, 40);
    const spy = vi.spyOn(snapshots, "listOwedCompensationForAccount").mockRejectedValueOnce(new Error("db down"));

    await expect(compensateAndSummarize(acct.account_id)).resolves.toEqual({ owed_cents: 40, credited_cents: 0 });
    spy.mockRestore();
  });
});
