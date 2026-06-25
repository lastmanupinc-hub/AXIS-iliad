import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import {
  getPersistenceBalance,
  canUsePersistence,
  addPersistenceCredits,
  applySuiteMonthlyGrant,
  meterPersistenceOp,
  getPersistenceLedger,
} from "./persistence-metering.js";
import { PERSISTENCE_CREDIT_COSTS, SUITE_MONTHLY_PERSISTENCE_CREDITS } from "./billing-types.js";

beforeEach(async () => { await resetTestDb(); });

// ─── Balance ────────────────────────────────────────────────────

describe("getPersistenceBalance", () => {
  it("returns 0 for an account with no credits", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await getPersistenceBalance(acct.account_id)).toBe(0);
  });

  it("returns the correct balance after purchases", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 100);
    await addPersistenceCredits(acct.account_id, 50);
    expect(await getPersistenceBalance(acct.account_id)).toBe(150);
  });

  it("never goes negative (clamps at 0)", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "paid");
    // No credits added, balance stays 0
    expect(await getPersistenceBalance(acct.account_id)).toBe(0);
  });
});

// ─── Access ─────────────────────────────────────────────────────

describe("canUsePersistence", () => {
  it("blocks free tier regardless of balance", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "free");
    // Even if we hypothetically added credits, free should still fail canUsePersistence
    expect(await canUsePersistence(acct.account_id, "free")).toBe(false);
  });

  it("blocks paid tier with zero balance", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    expect(await canUsePersistence(acct.account_id, "paid")).toBe(false);
  });

  it("allows paid tier with credits", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 10);
    expect(await canUsePersistence(acct.account_id, "paid")).toBe(true);
  });

  it("allows suite tier with credits", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    await addPersistenceCredits(acct.account_id, 500, "suite_monthly_grant");
    expect(await canUsePersistence(acct.account_id, "suite")).toBe(true);
  });
});

// ─── Credit grants ───────────────────────────────────────────────

describe("addPersistenceCredits", () => {
  it("returns the new balance after purchase", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "paid");
    const balance = await addPersistenceCredits(acct.account_id, 100);
    expect(balance).toBe(100);
  });

  it("accumulates across multiple purchases", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 100);
    const balance = await addPersistenceCredits(acct.account_id, 500);
    expect(balance).toBe(600);
  });

  it("records the purchase operation in the ledger", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 100, "purchase");
    const ledger = await getPersistenceLedger(acct.account_id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].operation).toBe("purchase");
    expect(ledger[0].credits_delta).toBe(100);
    expect(ledger[0].balance_after).toBe(100);
  });
});

describe("applySuiteMonthlyGrant", () => {
  it("returns null for non-suite tier", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    expect(await applySuiteMonthlyGrant(acct.account_id, "paid")).toBeNull();
  });

  it("grants SUITE_MONTHLY_PERSISTENCE_CREDITS for suite tier", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    const balance = await applySuiteMonthlyGrant(acct.account_id, "suite");
    expect(balance).toBe(SUITE_MONTHLY_PERSISTENCE_CREDITS);
  });

  it("is idempotent within the same calendar month", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    await applySuiteMonthlyGrant(acct.account_id, "suite");
    const result = await applySuiteMonthlyGrant(acct.account_id, "suite"); // second call same month
    expect(result).toBeNull();
    expect(await getPersistenceBalance(acct.account_id)).toBe(SUITE_MONTHLY_PERSISTENCE_CREDITS);
  });
});

// ─── Metering ────────────────────────────────────────────────────

describe("meterPersistenceOp", () => {
  it("blocks free tier with descriptive reason", async () => {
    const acct = await createAccount("Alice", "alice@example.com", "free");
    const result = await meterPersistenceOp(acct.account_id, "free", "save_version");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("paid plan");
  });

  it("blocks paid tier with insufficient credits", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 1); // need 2 for save_version
    const result = await meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Insufficient");
  });

  it("deducts save_version cost (2 credits)", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 10);
    const result = await meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance_after).toBe(10 - PERSISTENCE_CREDIT_COSTS.save_version);
    }
  });

  it("deducts diff_versions cost (1 credit)", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 10);
    const result = await meterPersistenceOp(acct.account_id, "paid", "diff_versions");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance_after).toBe(10 - PERSISTENCE_CREDIT_COSTS.diff_versions);
    }
  });

  it("deducts cross_snapshot_diff cost (5 credits)", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 10);
    const result = await meterPersistenceOp(acct.account_id, "paid", "cross_snapshot_diff");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance_after).toBe(10 - PERSISTENCE_CREDIT_COSTS.cross_snapshot_diff);
    }
  });

  it("records the ledger entry with correct negative delta", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 10);
    await meterPersistenceOp(acct.account_id, "paid", "save_version");
    const ledger = await getPersistenceLedger(acct.account_id);
    const spend = ledger.find(e => e.operation === "save_version");
    expect(spend).toBeDefined();
    expect(spend!.credits_delta).toBe(-PERSISTENCE_CREDIT_COSTS.save_version);
    expect(spend!.snapshot_id).toBeNull();
  });

  it("balance never goes below 0 after exact spend", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 2); // exactly enough for one save
    const result = await meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.balance_after).toBe(0);
    // next op should fail
    const result2 = await meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result2.ok).toBe(false);
  });

  it("suite tier can meter operations", async () => {
    const acct = await createAccount("Corp", "corp@example.com", "suite");
    await addPersistenceCredits(acct.account_id, 500, "suite_monthly_grant");
    const result = await meterPersistenceOp(acct.account_id, "suite", "save_version");
    expect(result.ok).toBe(true);
  });
});

// ─── Ledger ─────────────────────────────────────────────────────

describe("getPersistenceLedger", () => {
  it("returns empty array for an account with no activity", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    expect(await getPersistenceLedger(acct.account_id)).toHaveLength(0);
  });

  it("returns entries in descending chronological order", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(acct.account_id, 100);
    await addPersistenceCredits(acct.account_id, 50);
    const ledger = await getPersistenceLedger(acct.account_id);
    expect(ledger).toHaveLength(2);
    // Both entries present; balance_after increases monotonically
    const sortedByBalance = [...ledger].sort((a, b) => a.balance_after - b.balance_after);
    expect(sortedByBalance[0].balance_after).toBe(100);
    expect(sortedByBalance[1].balance_after).toBe(150);
  });

  it("respects the limit parameter", async () => {
    const acct = await createAccount("Bob", "bob@example.com", "paid");
    for (let i = 0; i < 10; i++) await addPersistenceCredits(acct.account_id, 1);
    const ledger = await getPersistenceLedger(acct.account_id, 3);
    expect(ledger).toHaveLength(3);
  });

  it("does not return other accounts' ledger entries", async () => {
    const a = await createAccount("Alice", "alice@example.com", "paid");
    const b = await createAccount("Bob", "bob@example.com", "paid");
    await addPersistenceCredits(a.account_id, 100);
    expect(await getPersistenceLedger(b.account_id)).toHaveLength(0);
  });
});

// ─── Concurrency (A1: no double-spend) ──────────────────────────

// A cold pool opens the 2nd connection slower than op #1 commits, which masks the
// race; pre-warming N idle connections makes the burst truly overlap (all reads land
// before any write) — the exact double-spend window. Verified: these fail on the
// pre-fix read-check-insert and pass once the debit is advisory-locked.
async function warmPool(n: number): Promise<void> {
  await Promise.all(Array.from({ length: n }, () => sql.one("SELECT 1")));
}

describe("meterPersistenceOp — concurrency", () => {
  it("does not double-spend: a warm-pool burst on a one-op balance debits exactly once", async () => {
    const acct = await createAccount("Race", "race@example.com", "paid");
    const cost = PERSISTENCE_CREDIT_COSTS.save_version;
    await addPersistenceCredits(acct.account_id, cost); // exactly ONE op of headroom

    const N = 10;
    await warmPool(N);
    const results = await Promise.all(
      Array.from({ length: N }, () => meterPersistenceOp(acct.account_id, "paid", "save_version")),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1); // exactly one debit, not N
    expect(await getPersistenceBalance(acct.account_id)).toBe(0); // never negative
  });

  it("never overspends a bounded balance under a burst larger than its capacity", async () => {
    const acct = await createAccount("Burst", "burst@example.com", "paid");
    const cost = PERSISTENCE_CREDIT_COSTS.diff_versions;
    const cap = 6;
    await addPersistenceCredits(acct.account_id, cost * cap);

    const N = 12; // more concurrent ops than the balance can cover
    await warmPool(10);
    const results = await Promise.all(
      Array.from({ length: N }, () => meterPersistenceOp(acct.account_id, "paid", "diff_versions")),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(cap); // exactly capacity, never more
    expect(await getPersistenceBalance(acct.account_id)).toBe(0); // never negative
  });
});
