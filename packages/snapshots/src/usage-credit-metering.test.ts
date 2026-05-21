import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb, openMemoryDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  creditsFromUsdCents,
  consumeUsageCredits,
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
