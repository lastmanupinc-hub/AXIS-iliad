// A paying account must actually receive what the pricing page promises.
//
// THE INCIDENT (2026-08-18, reported by a real paying customer): funds settled
// and the account still had no pro access. Root cause: updateAccountTier and
// updateAccountTierIfCurrent granted program entitlements only when the target
// tier was "suite". A free->paid upgrade set accounts.tier = 'paid' and wrote no
// entitlement rows; TIER_LIMITS.paid declares `programs: []` ("governed by
// entitlements"); isProgramEnabled() therefore returned false for every pro
// program. The customer was billed and locked out of all 21 programs.
//
// Nothing failed. Every existing test passed, because every test asserted the
// mechanism ("suite enables all programs") rather than the PROMISE ("a paid plan
// gets All 21"). This file asserts the promise, against the real marketed table.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetTestDb, closeTestDb } from "./pg-test.js";
import { createAccount, updateAccountTier, updateAccountTierIfCurrent, isProgramEnabled, getEntitlements } from "./billing-store.js";
import { ALL_PROGRAMS } from "./billing-types.js";
import { PLAN_FEATURES } from "./funnel-types.js";

/** What the public pricing table claims about program access, per plan. */
function marketedPrograms(): Record<string, unknown> {
  const row = PLAN_FEATURES.find((f) => f.name === "Programs available");
  if (!row) throw new Error("PLAN_FEATURES has no 'Programs available' row — did it get renamed?");
  return row as unknown as Record<string, unknown>;
}

describe("paid entitlement honesty — a payer gets what the pricing page promises", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("the marketed table still promises All 21 on every paid plan (guards the premise)", () => {
    const row = marketedPrograms();
    // If marketing ever changes, this fails FIRST and loudly, rather than the
    // behaviour tests below quietly enforcing a promise no longer made.
    for (const plan of ["starter", "pro", "growth"]) {
      expect(String(row[plan]), `${plan} should market all programs`).toMatch(/all\s*21/i);
    }
    expect(String(row.free)).not.toMatch(/all\s*21/i);
    expect(ALL_PROGRAMS.length).toBe(21);
  });

  it("a free->paid upgrade enables EVERY program (the incident)", async () => {
    const acct = await createAccount("Payer", "payer@example.com", "free");
    await updateAccountTier(acct.account_id, "paid");

    const missing: string[] = [];
    for (const program of ALL_PROGRAMS) {
      if (!(await isProgramEnabled(acct.account_id, program))) missing.push(program);
    }
    expect(
      missing,
      "A paid account could not use these programs. The pricing page promises All 21 to every " +
        "paid plan; TIER_LIMITS.paid.programs is [] and access comes from program_entitlements, " +
        "so the tier change MUST write those rows.",
    ).toEqual([]);
  });

  it("the compare-and-set webhook path grants them too (the path payments actually use)", async () => {
    // updateAccountTierIfCurrent is what the billing webhook calls; it had the
    // same suite-only condition, so fixing only updateAccountTier would have
    // left the real payment path broken.
    const acct = await createAccount("Webhook Payer", "wh-payer@example.com", "free");
    const moved = await updateAccountTierIfCurrent(acct.account_id, "free", "paid");
    expect(moved).toBe(true);

    const entitlements = await getEntitlements(acct.account_id);
    expect(entitlements.map((e) => e.program).sort()).toEqual([...ALL_PROGRAMS].sort());
  });

  it("suite still grants everything (no regression on the path that worked)", async () => {
    const acct = await createAccount("Suite", "suite@example.com", "free");
    await updateAccountTier(acct.account_id, "suite");
    for (const program of ALL_PROGRAMS) {
      expect(await isProgramEnabled(acct.account_id, program), program).toBe(true);
    }
  });

  it("free accounts get only the 3 core programs — the fix must not hand out paid access", async () => {
    const acct = await createAccount("Free", "free-user@example.com", "free");
    expect(await isProgramEnabled(acct.account_id, "search")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "theme")).toBe(false);
    expect(await isProgramEnabled(acct.account_id, "mcp")).toBe(false);
    // And no entitlement rows were written for a free account.
    expect(await getEntitlements(acct.account_id)).toEqual([]);
  });
});
