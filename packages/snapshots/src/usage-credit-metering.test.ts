import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, openMemoryDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  creditsFromUsdCents,
  previewUsageCredits,
  consumeUsageCredits,
  getUsageCreditSummary,
} from "./usage-credit-metering.js";
import { getReferralCredits, getReferralTokenUsageModifier } from "./referral-store.js";

describe("usage credit metering + referral token rewards", () => {
  beforeEach(() => {
    openMemoryDb();
  });

  afterEach(() => {
    closeDb();
  });

  it("reduces tokens consumed for paid tier when referral rewards exist", () => {
    const account = createAccount("Paid", "paid@example.com", "paid");
    getReferralCredits(account.account_id);

    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 20, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
    ).run(new Date().toISOString(), new Date().toISOString(), account.account_id);

    const baseCredits = creditsFromUsdCents(1000);
    const charged = consumeUsageCredits(account.account_id, "paid", "analyze_repo", 1000);

    expect(baseCredits).toBe(5556);
    expect(charged.credits_required).toBe(5555);
    expect(charged.included_credits_applied).toBe(5555);
    expect(charged.effective_overage_cents).toBe(0);
  });

  it("does not apply referral token reduction for free tier", () => {
    const account = createAccount("Free", "free@example.com", "free");
    getReferralCredits(account.account_id);

    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 20, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
    ).run(new Date().toISOString(), new Date().toISOString(), account.account_id);

    const baseCredits = creditsFromUsdCents(1000);
    const charged = consumeUsageCredits(account.account_id, "free", "analyze_repo", 1000);

    expect(charged.credits_required).toBe(baseCredits);
  });

  it("resets referral token rewards when billing cycle changes", () => {
    const account = createAccount("Cycle", "cycle@example.com", "paid");
    getReferralCredits(account.account_id);

    const db = getDb();
    db.prepare(
      "UPDATE referral_credits SET earned_credits_millicents = 20, last_reset_at = ?, updated_at = ? WHERE account_id = ?",
    ).run("2026-01-15T00:00:00.000Z", "2026-01-15T00:00:00.000Z", account.account_id);

    const modifier = getReferralTokenUsageModifier(account.account_id);
    expect(modifier.reduction_rate).toBe(0);

    const credits = getReferralCredits(account.account_id);
    expect(credits.earned_credits_millicents).toBe(0);
  });
});

describe("previewUsageCredits — read-only authorization gate", () => {
  beforeEach(() => {
    openMemoryDb();
  });
  afterEach(() => {
    closeDb();
  });

  function ledgerCount(account_id: string): number {
    return (
      getDb()
        .prepare("SELECT COUNT(*) as n FROM usage_credit_ledger WHERE account_id = ?")
        .get(account_id) as { n: number }
    ).n;
  }

  it("computes the charge WITHOUT writing (no ledger row, allowance untouched)", () => {
    const account = createAccount("Preview", "preview@example.com", "free");
    const before = getUsageCreditSummary(account.account_id, "free");

    const preview = previewUsageCredits(account.account_id, "free", "analyze_repo", 50);
    expect(preview.credits_required).toBeGreaterThan(0);
    expect(preview.effective_overage_cents).toBe(0);
    // The gate must not touch state.
    expect(ledgerCount(account.account_id)).toBe(0);
    expect(getUsageCreditSummary(account.account_id, "free").included_credits_used).toBe(
      before.included_credits_used,
    );

    // Committing the same charge DOES write — and matches the preview exactly.
    const charged = consumeUsageCredits(account.account_id, "free", "analyze_repo", 50);
    expect(ledgerCount(account.account_id)).toBe(1);
    expect(charged.credits_required).toBe(preview.credits_required);
    expect(charged.included_credits_applied).toBe(preview.included_credits_applied);
  });

  it("over-allowance call previews overage but writes nothing (no partial charge before a 402)", () => {
    const account = createAccount("Overage", "overage@example.com", "free");
    // ~11,112 credits required > the 10,000 free monthly allowance → overage.
    const preview = previewUsageCredits(account.account_id, "free", "analyze_repo", 2000);
    expect(preview.overage_credits).toBeGreaterThan(0);
    expect(preview.effective_overage_cents).toBeGreaterThan(0);
    // The OLD path wrote the debit (consuming included credits + recording the
    // overage) and only THEN threw 402. The gate must commit nothing.
    expect(ledgerCount(account.account_id)).toBe(0);
    expect(getUsageCreditSummary(account.account_id, "free").included_credits_used).toBe(0);
  });

  it("preview matches what consume would charge (gate ≡ commit)", () => {
    const account = createAccount("Match", "match@example.com", "paid");
    const preview = previewUsageCredits(account.account_id, "paid", "iliad_embeddings", 50);
    const charged = consumeUsageCredits(account.account_id, "paid", "iliad_embeddings", 50);
    expect(preview.credits_required).toBe(charged.credits_required);
    expect(preview.included_credits_applied).toBe(charged.included_credits_applied);
    expect(preview.effective_overage_cents).toBe(charged.effective_overage_cents);
  });
});
