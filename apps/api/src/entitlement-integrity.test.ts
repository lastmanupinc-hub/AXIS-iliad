// Hardening pass over the 2026-08-18 paid-access incident.
//
// Two failures made that incident possible and BOTH were invisible:
//   1. A paid account could hold zero entitlements and nothing counted it.
//   2. entitlements.test.ts asserted against product ids — socket, palette,
//      runway, embed, crate, reach — that do not exist. Those are the rejected
//      9-product merger names (killed by app_00). A green suite testing a dead
//      catalog can never catch a real entitlement bug.
//
// These guard the invariants, not the mechanics.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resetTestDb,
  closeTestDb,
  createAccount,
  enableProgram,
  getSystemStats,
  isProgramEnabled,
  ALL_PROGRAMS,
} from "@axis/snapshots";
import { PRODUCT_IDS } from "@axis/generator-core";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "snapshots", "src");

describe("entitlement tests must exercise the REAL catalog", () => {
  it("no test asserts against a product id that cannot be bought", () => {
    const source = readFileSync(join(SRC, "entitlements.test.ts"), "utf8");
    const real = new Set(PRODUCT_IDS as readonly string[]);
    // Ids passed to grantEntitlement/hasEntitlement as string literals.
    const used = new Set<string>();
    for (const m of source.matchAll(/(?:grantEntitlement|hasEntitlement)\([^,]+,\s*"([a-z-]+)"/g)) {
      used.add(m[1]);
    }
    expect(used.size, "found no product ids — the extraction regex broke").toBeGreaterThan(0);
    const fictional = [...used].filter((id) => !real.has(id));
    expect(
      fictional,
      "entitlements.test.ts asserts against product ids that are not in PRODUCT_REGISTRY. A suite " +
        "testing a catalog that does not exist is green by construction and cannot catch a real bug.",
    ).toEqual([]);
  });
});

describe("stranded paid accounts are counted, not silently tolerated", () => {
  beforeEach(async () => { await resetTestDb(); });
  afterAll(async () => { await closeTestDb(); });

  it("a paid account with no enabled programs is REPORTED as stranded", async () => {
    const acct = await createAccount("Stranded", "stranded@example.com", "paid");
    // This is precisely the production state on 2026-08-18: tier flipped, zero grants.
    expect(await isProgramEnabled(acct.account_id, "theme")).toBe(false);

    const stats = await getSystemStats();
    expect(
      stats.paid_accounts_without_entitlements,
      "a paying customer who can run nothing must be visible in admin stats",
    ).toBe(1);
  });

  it("granting even one program clears the stranded state", async () => {
    const acct = await createAccount("Repaired", "repaired@example.com", "paid");
    expect((await getSystemStats()).paid_accounts_without_entitlements).toBe(1);

    await enableProgram(acct.account_id, "theme");
    expect((await getSystemStats()).paid_accounts_without_entitlements).toBe(0);
  });

  it("free and suite accounts are never counted as stranded", async () => {
    // free: gated by TIER_LIMITS.free.programs, holds no entitlement rows by design.
    // suite: isProgramEnabled short-circuits true, so zero rows is correct.
    await createAccount("Freebie", "free-not-stranded@example.com", "free");
    await createAccount("Suite", "suite-not-stranded@example.com", "suite");
    expect((await getSystemStats()).paid_accounts_without_entitlements).toBe(0);
  });

  it("the healthy case reports zero (guards against a counter stuck high)", async () => {
    const acct = await createAccount("Healthy", "healthy-paid@example.com", "paid");
    for (const program of ALL_PROGRAMS as readonly string[]) {
      await enableProgram(acct.account_id, program);
    }
    expect((await getSystemStats()).paid_accounts_without_entitlements).toBe(0);
  });
});
