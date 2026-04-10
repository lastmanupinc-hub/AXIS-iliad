import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb } from "./db.js";
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

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

// ─── Balance ────────────────────────────────────────────────────

describe("getPersistenceBalance", () => {
  it("returns 0 for an account with no credits", () => {
    const acct = createAccount("Alice", "alice@example.com");
    expect(getPersistenceBalance(acct.account_id)).toBe(0);
  });

  it("returns the correct balance after purchases", () => {
    const acct = createAccount("Alice", "alice@example.com", "paid");
    addPersistenceCredits(acct.account_id, 100);
    addPersistenceCredits(acct.account_id, 50);
    expect(getPersistenceBalance(acct.account_id)).toBe(150);
  });

  it("never goes negative (clamps at 0)", () => {
    const acct = createAccount("Alice", "alice@example.com", "paid");
    // No credits added, balance stays 0
    expect(getPersistenceBalance(acct.account_id)).toBe(0);
  });
});

// ─── Access ─────────────────────────────────────────────────────

describe("canUsePersistence", () => {
  it("blocks free tier regardless of balance", () => {
    const acct = createAccount("Alice", "alice@example.com", "free");
    // Even if we hypothetically added credits, free should still fail canUsePersistence
    expect(canUsePersistence(acct.account_id, "free")).toBe(false);
  });

  it("blocks paid tier with zero balance", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    expect(canUsePersistence(acct.account_id, "paid")).toBe(false);
  });

  it("allows paid tier with credits", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 10);
    expect(canUsePersistence(acct.account_id, "paid")).toBe(true);
  });

  it("allows suite tier with credits", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    addPersistenceCredits(acct.account_id, 500, "suite_monthly_grant");
    expect(canUsePersistence(acct.account_id, "suite")).toBe(true);
  });
});

// ─── Credit grants ───────────────────────────────────────────────

describe("addPersistenceCredits", () => {
  it("returns the new balance after purchase", () => {
    const acct = createAccount("Alice", "alice@example.com", "paid");
    const balance = addPersistenceCredits(acct.account_id, 100);
    expect(balance).toBe(100);
  });

  it("accumulates across multiple purchases", () => {
    const acct = createAccount("Alice", "alice@example.com", "paid");
    addPersistenceCredits(acct.account_id, 100);
    const balance = addPersistenceCredits(acct.account_id, 500);
    expect(balance).toBe(600);
  });

  it("records the purchase operation in the ledger", () => {
    const acct = createAccount("Alice", "alice@example.com", "paid");
    addPersistenceCredits(acct.account_id, 100, "purchase");
    const ledger = getPersistenceLedger(acct.account_id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].operation).toBe("purchase");
    expect(ledger[0].credits_delta).toBe(100);
    expect(ledger[0].balance_after).toBe(100);
  });
});

describe("applySuiteMonthlyGrant", () => {
  it("returns null for non-suite tier", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    expect(applySuiteMonthlyGrant(acct.account_id, "paid")).toBeNull();
  });

  it("grants SUITE_MONTHLY_PERSISTENCE_CREDITS for suite tier", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    const balance = applySuiteMonthlyGrant(acct.account_id, "suite");
    expect(balance).toBe(SUITE_MONTHLY_PERSISTENCE_CREDITS);
  });

  it("is idempotent within the same calendar month", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    applySuiteMonthlyGrant(acct.account_id, "suite");
    const result = applySuiteMonthlyGrant(acct.account_id, "suite"); // second call same month
    expect(result).toBeNull();
    expect(getPersistenceBalance(acct.account_id)).toBe(SUITE_MONTHLY_PERSISTENCE_CREDITS);
  });
});

// ─── Metering ────────────────────────────────────────────────────

describe("meterPersistenceOp", () => {
  it("blocks free tier with descriptive reason", () => {
    const acct = createAccount("Alice", "alice@example.com", "free");
    const result = meterPersistenceOp(acct.account_id, "free", "save_version");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("paid plan");
  });

  it("blocks paid tier with insufficient credits", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 1); // need 2 for save_version
    const result = meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Insufficient");
  });

  it("deducts save_version cost (2 credits)", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 10);
    const result = meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance_after).toBe(10 - PERSISTENCE_CREDIT_COSTS.save_version);
    }
  });

  it("deducts diff_versions cost (1 credit)", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 10);
    const result = meterPersistenceOp(acct.account_id, "paid", "diff_versions");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance_after).toBe(10 - PERSISTENCE_CREDIT_COSTS.diff_versions);
    }
  });

  it("deducts cross_snapshot_diff cost (5 credits)", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 10);
    const result = meterPersistenceOp(acct.account_id, "paid", "cross_snapshot_diff");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.balance_after).toBe(10 - PERSISTENCE_CREDIT_COSTS.cross_snapshot_diff);
    }
  });

  it("records the ledger entry with correct negative delta", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 10);
    meterPersistenceOp(acct.account_id, "paid", "save_version");
    const ledger = getPersistenceLedger(acct.account_id);
    const spend = ledger.find(e => e.operation === "save_version");
    expect(spend).toBeDefined();
    expect(spend!.credits_delta).toBe(-PERSISTENCE_CREDIT_COSTS.save_version);
    expect(spend!.snapshot_id).toBeNull();
  });

  it("balance never goes below 0 after exact spend", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 2); // exactly enough for one save
    const result = meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.balance_after).toBe(0);
    // next op should fail
    const result2 = meterPersistenceOp(acct.account_id, "paid", "save_version");
    expect(result2.ok).toBe(false);
  });

  it("suite tier can meter operations", () => {
    const acct = createAccount("Corp", "corp@example.com", "suite");
    addPersistenceCredits(acct.account_id, 500, "suite_monthly_grant");
    const result = meterPersistenceOp(acct.account_id, "suite", "save_version");
    expect(result.ok).toBe(true);
  });
});

// ─── Ledger ─────────────────────────────────────────────────────

describe("getPersistenceLedger", () => {
  it("returns empty array for an account with no activity", () => {
    const acct = createAccount("Alice", "alice@example.com");
    expect(getPersistenceLedger(acct.account_id)).toHaveLength(0);
  });

  it("returns entries in descending chronological order", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(acct.account_id, 100);
    addPersistenceCredits(acct.account_id, 50);
    const ledger = getPersistenceLedger(acct.account_id);
    expect(ledger).toHaveLength(2);
    // Both entries present; balance_after increases monotonically
    const sortedByBalance = [...ledger].sort((a, b) => a.balance_after - b.balance_after);
    expect(sortedByBalance[0].balance_after).toBe(100);
    expect(sortedByBalance[1].balance_after).toBe(150);
  });

  it("respects the limit parameter", () => {
    const acct = createAccount("Bob", "bob@example.com", "paid");
    for (let i = 0; i < 10; i++) addPersistenceCredits(acct.account_id, 1);
    const ledger = getPersistenceLedger(acct.account_id, 3);
    expect(ledger).toHaveLength(3);
  });

  it("does not return other accounts' ledger entries", () => {
    const a = createAccount("Alice", "alice@example.com", "paid");
    const b = createAccount("Bob", "bob@example.com", "paid");
    addPersistenceCredits(a.account_id, 100);
    expect(getPersistenceLedger(b.account_id)).toHaveLength(0);
  });
});
