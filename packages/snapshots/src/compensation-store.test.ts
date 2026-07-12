/**
 * H2.1 — compensation ledger (WO-20 phase 3): migration v34 + store semantics.
 * The load-bearing property is the claim's AT-MOST-ONCE transition — the
 * compensator can retry, crash, and race without ever double-granting.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { createAccount } from "./billing-store.js";
import {
  recordCompensationOwed,
  claimCompensationForCredit,
  resolveCompensation,
  getCompensationSummary,
  getTotalCompensationOwed,
  listOwedCompensation,
} from "./compensation-store.js";

beforeEach(async () => {
  await resetTestDb();
});

async function owedEntry(cents = 150, reason: "settled_then_error" | "wallet_rail_ambiguous" = "settled_then_error") {
  const acct = await createAccount("Comp User", `comp-${cents}-${reason}@test.com`, "paid");
  const entry = await recordCompensationOwed({
    account_id: acct.account_id,
    tool: "analyze_repo",
    amount_cents: cents,
    reason,
    receipt_ref: "rcpt_test_1",
  });
  return { acct, entry };
}

describe("compensation ledger — record + summarize (H2.1)", () => {
  it("records an owed row and surfaces it in the per-account summary", async () => {
    const { acct, entry } = await owedEntry(150);
    expect(entry.status).toBe("owed");
    expect(entry.attempts).toBe(0);

    const summary = await getCompensationSummary(acct.account_id);
    expect(summary).toEqual({ owed_cents: 150, credited_cents: 0 });
    expect(await getTotalCompensationOwed()).toBe(150);

    const batch = await listOwedCompensation();
    expect(batch.map((e) => e.entry_id)).toContain(entry.entry_id);
  });

  it("rejects an unknown reason at the DB layer (CHECK constraint)", async () => {
    const acct = await createAccount("Bad Reason", "bad-reason@test.com", "paid");
    await expect(
      recordCompensationOwed({
        account_id: acct.account_id,
        tool: "t",
        amount_cents: 10,
        reason: "banana" as never,
      }),
    ).rejects.toThrow();
  });
});

describe("compensation ledger — at-most-once claim (H2.1)", () => {
  it("first claim wins and stamps credited; the replay gets null", async () => {
    const { acct, entry } = await owedEntry(300);

    const claimed = await claimCompensationForCredit(entry.entry_id);
    expect(claimed?.status).toBe("credited");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.resolved_at).toBeTruthy();

    // Replay (compensator retry / crash-recovery double-run) must NOT re-claim.
    expect(await claimCompensationForCredit(entry.entry_id)).toBeNull();

    const summary = await getCompensationSummary(acct.account_id);
    expect(summary).toEqual({ owed_cents: 0, credited_cents: 300 });
    expect(await getTotalCompensationOwed()).toBe(0);
  });

  it("concurrent claims on one entry yield exactly one winner", async () => {
    const { entry } = await owedEntry(500);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => claimCompensationForCredit(entry.entry_id)),
    );
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("out-of-band resolution (waive / cash refund) also consumes the owed state exactly once", async () => {
    const { acct, entry } = await owedEntry(200, "wallet_rail_ambiguous");

    expect(await resolveCompensation(entry.entry_id, "waived")).toBe(true);
    expect(await resolveCompensation(entry.entry_id, "cash_refunded")).toBe(false); // already resolved
    expect(await claimCompensationForCredit(entry.entry_id)).toBeNull();            // and not claimable

    const summary = await getCompensationSummary(acct.account_id);
    expect(summary).toEqual({ owed_cents: 0, credited_cents: 0 }); // waived is neither owed nor credited
  });
});
