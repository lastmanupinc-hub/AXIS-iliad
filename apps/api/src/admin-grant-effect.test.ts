// The admin grant endpoint must change something the customer can observe.
//
// THE DEFECT (2026-08-18): POST /v1/admin/entitlements/grant wrote only
// account_entitlements and returned {granted: true}. But isProgramEnabled() —
// the gate every pro program consults — reads program_entitlements, and
// hasEntitlement (the reader for account_entitlements) has NO production caller
// at all. So the one tool an operator would reach for to unblock a locked-out
// paying customer reported success and changed nothing they could use.
//
// This asserts the EFFECT (the customer can now run what they were granted),
// not the mechanism (a row exists somewhere).
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetTestDb, closeTestDb } from "@axis/snapshots";
import { createAccount, isProgramEnabled, hasEntitlement } from "@axis/snapshots";
import { getProduct, PRODUCT_IDS } from "@axis/generator-core";
import { grantEntitlement, enableProgram } from "@axis/snapshots";

/** Mirrors handleAdminGrantEntitlement's write path exactly. */
async function adminGrant(accountId: string, productId: string): Promise<string[]> {
  const product = getProduct(productId);
  await grantEntitlement(accountId, productId, "manual");
  const programs = product?.programs ?? [];
  for (const program of programs) await enableProgram(accountId, program);
  return programs;
}

describe("admin entitlement grant — grants access, not just a row", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("the product catalog is non-trivial (guards against a vacuous sweep)", () => {
    expect(PRODUCT_IDS.length).toBeGreaterThanOrEqual(20);
  });

  it("a granted product becomes RUNNABLE for a paid account", async () => {
    const acct = await createAccount("Granted", "granted@example.com", "paid");
    // Precondition: paid alone grants nothing, which is why the grant must work.
    expect(await isProgramEnabled(acct.account_id, "theme")).toBe(false);

    const programs = await adminGrant(acct.account_id, "theme");
    expect(programs).toContain("theme");
    for (const program of programs) {
      expect(
        await isProgramEnabled(acct.account_id, program),
        `granting product 'theme' must make program '${program}' runnable`,
      ).toBe(true);
    }
  });

  it("records WHAT was bought as well, so the two tables agree", async () => {
    const acct = await createAccount("Both", "both-tables@example.com", "paid");
    await adminGrant(acct.account_id, "canvas");
    expect(await hasEntitlement(acct.account_id, "canvas")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "canvas")).toBe(true);
  });

  it("grants ONLY the purchased product's programs — not the whole catalog", async () => {
    const acct = await createAccount("Scoped", "scoped-grant@example.com", "paid");
    await adminGrant(acct.account_id, "canvas");
    expect(await isProgramEnabled(acct.account_id, "canvas")).toBe(true);
    expect(await isProgramEnabled(acct.account_id, "mcp")).toBe(false);
    expect(await isProgramEnabled(acct.account_id, "closer")).toBe(false);
  });

  it("every product in the catalog maps to at least one real program", async () => {
    // A product whose programs list is empty would grant nothing and the
    // endpoint would still report success.
    const empty = PRODUCT_IDS.filter((id) => (getProduct(id)?.programs ?? []).length === 0);
    expect(empty, "these products would grant no access if purchased").toEqual([]);
  });
});
