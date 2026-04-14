import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDb, closeDb, getDb } from "./db.js";
import { createAccount } from "./billing-store.js";
import {
  createReferralCode,
  lookupReferralCode,
  getReferralCodes,
  recordReferralConversion,
  getReferralConversionCount,
  getReferralCredits,
  initFreeCallGrant,
  consumeFreeCall,
  applyReferralDiscount,
  buildIncentivesSummary,
  REWARD_MILLICENTS,
  MAX_EARNED_MILLICENTS,
} from "./referral-store.js";

beforeEach(() => { openMemoryDb(); });
afterEach(() => { closeDb(); });

// ─── Referral Code Management ───────────────────────────────────

describe("Referral Codes", () => {
  it("creates a referral code for an account", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const code = createReferralCode(acct.account_id);
    expect(code.code).toHaveLength(12);
    expect(code.account_id).toBe(acct.account_id);
    expect(code.created_at).toBeTruthy();
  });

  it("returns existing code on duplicate create", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const code1 = createReferralCode(acct.account_id);
    const code2 = createReferralCode(acct.account_id);
    expect(code1.code).toBe(code2.code);
  });

  it("lookupReferralCode finds existing codes", () => {
    const acct = createAccount("Alice", "alice@example.com");
    const code = createReferralCode(acct.account_id);
    const found = lookupReferralCode(code.code);
    expect(found).toBeDefined();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("lookupReferralCode returns undefined for unknown codes", () => {
    expect(lookupReferralCode("NONEXISTENT")).toBeUndefined();
  });

  it("getReferralCodes returns all codes for account", () => {
    const acct = createAccount("Alice", "alice@example.com");
    createReferralCode(acct.account_id);
    const codes = getReferralCodes(acct.account_id);
    expect(codes).toHaveLength(1);
  });
});

// ─── Conversion Tracking ────────────────────────────────────────

describe("Referral Conversions", () => {
  it("records a valid conversion", () => {
    const referrer = createAccount("Referrer", "ref@example.com");
    const referee = createAccount("Referee", "ree@example.com");
    createReferralCode(referrer.account_id);

    const result = recordReferralConversion(referrer.account_id, referee.account_id);
    expect(result).toBe(true);
    expect(getReferralConversionCount(referrer.account_id)).toBe(1);
  });

  it("prevents duplicate referee conversions", () => {
    const referrer = createAccount("Referrer", "ref@example.com");
    const referee = createAccount("Referee", "ree@example.com");

    expect(recordReferralConversion(referrer.account_id, referee.account_id)).toBe(true);
    expect(recordReferralConversion(referrer.account_id, referee.account_id)).toBe(false);
  });

  it("prevents self-referral", () => {
    const acct = createAccount("Self", "self@example.com");
    expect(recordReferralConversion(acct.account_id, acct.account_id)).toBe(false);
  });

  it("credits referrer with REWARD_MILLICENTS per conversion", () => {
    const referrer = createAccount("Referrer", "ref@example.com");
    const referee = createAccount("Referee", "ree@example.com");

    recordReferralConversion(referrer.account_id, referee.account_id);
    const credits = getReferralCredits(referrer.account_id);
    expect(credits.earned_credits_millicents).toBe(REWARD_MILLICENTS);
    expect(credits.lifetime_referrals).toBe(1);
  });

  it("caps earned credits at MAX_EARNED_MILLICENTS", () => {
    const referrer = createAccount("Referrer", "ref@example.com");

    // Seed credits row, then set near max directly for speed
    getReferralCredits(referrer.account_id);
    const db = getDb();
    db.prepare("UPDATE referral_credits SET earned_credits_millicents = ? WHERE account_id = ?").run(MAX_EARNED_MILLICENTS - 1, referrer.account_id);

    const referee = createAccount("Last", "last@example.com");
    recordReferralConversion(referrer.account_id, referee.account_id);

    const credits = getReferralCredits(referrer.account_id);
    expect(credits.earned_credits_millicents).toBe(MAX_EARNED_MILLICENTS);
  });
});

// ─── Free Call Grant (One-Time Onboarding) ─────────────────────────────

describe("Free Call Grant", () => {
  it("grants one free call on first init", () => {
    const acct = createAccount("New", "new@example.com");
    initFreeCallGrant(acct.account_id);
    const credits = getReferralCredits(acct.account_id);
    expect(credits.free_calls_remaining).toBe(1);
  });

  it("does not double-grant on second init", () => {
    const acct = createAccount("New", "new@example.com");
    initFreeCallGrant(acct.account_id);
    initFreeCallGrant(acct.account_id);
    const credits = getReferralCredits(acct.account_id);
    expect(credits.free_calls_remaining).toBe(1);
  });

  it("does not re-grant after free call is consumed", () => {
    const acct = createAccount("New", "new@example.com");
    initFreeCallGrant(acct.account_id);
    expect(consumeFreeCall(acct.account_id)).toBe(true);
    expect(getReferralCredits(acct.account_id).free_calls_remaining).toBe(0);
    // Re-calling initFreeCallGrant must NOT re-grant
    initFreeCallGrant(acct.account_id);
    expect(getReferralCredits(acct.account_id).free_calls_remaining).toBe(0);
  });

  it("consumeFreeCall returns true and decrements", () => {
    const acct = createAccount("New", "new@example.com");
    initFreeCallGrant(acct.account_id);
    expect(consumeFreeCall(acct.account_id)).toBe(true);
    const credits = getReferralCredits(acct.account_id);
    expect(credits.free_calls_remaining).toBe(0);
  });

  it("consumeFreeCall returns false when none remaining", () => {
    const acct = createAccount("New", "new@example.com");
    initFreeCallGrant(acct.account_id);
    consumeFreeCall(acct.account_id);
    expect(consumeFreeCall(acct.account_id)).toBe(false);
  });
});

// ─── Discount Application ───────────────────────────────────────

describe("Referral Discount", () => {
  it("returns no discount when no credits earned", () => {
    const acct = createAccount("New", "new@example.com");
    const result = applyReferralDiscount(acct.account_id, 50);
    expect(result.final_cents).toBe(50);
    expect(result.discount_cents).toBe(0);
  });

  it("applies accumulated credits as discount", () => {
    const referrer = createAccount("Referrer", "ref@example.com");

    // Seed credits directly — 1000 millicents = 1 cent discount
    getReferralCredits(referrer.account_id);
    const db = getDb();
    db.prepare("UPDATE referral_credits SET earned_credits_millicents = 1000 WHERE account_id = ?").run(referrer.account_id);

    const result = applyReferralDiscount(referrer.account_id, 50);
    expect(result.discount_cents).toBe(1);
    expect(result.final_cents).toBe(49);
    expect(result.credits_used_millicents).toBe(1000);

    // Credits should be consumed
    const afterCredits = getReferralCredits(referrer.account_id);
    expect(afterCredits.earned_credits_millicents).toBe(0);
  });

  it("caps discount at $0.20 (20 cents)", () => {
    const referrer = createAccount("Referrer", "ref@example.com");

    // Seed max credits directly
    getReferralCredits(referrer.account_id);
    const db = getDb();
    db.prepare("UPDATE referral_credits SET earned_credits_millicents = ? WHERE account_id = ?").run(MAX_EARNED_MILLICENTS, referrer.account_id);

    const result = applyReferralDiscount(referrer.account_id, 50);
    expect(result.discount_cents).toBe(20);
    expect(result.final_cents).toBe(30);
  });
});

// ─── Incentives Summary ─────────────────────────────────────────

describe("Incentives Summary", () => {
  it("returns base summary without account", () => {
    const summary = buildIncentivesSummary();
    expect(summary.share_to_earn).toBeDefined();
    expect(summary.free_call).toBeDefined();
    expect(summary.referral_token_field).toBeDefined();
    expect(summary).not.toHaveProperty("your_status");
  });

  it("returns enriched summary with account", () => {
    const acct = createAccount("Alice", "alice@example.com");
    createReferralCode(acct.account_id);
    const summary = buildIncentivesSummary(acct.account_id);
    expect(summary).toHaveProperty("your_status");
    const status = summary.your_status as Record<string, unknown>;
    expect(status.referral_code).toBeTruthy();
    expect(status.earned_credits_millicents).toBe(0);
    expect(status.lifetime_referrals).toBe(0);
  });
});

// ─── Schema Migration ───────────────────────────────────────────

describe("Migration v16 — referral tables", () => {
  it("creates referral_codes table", () => {
    const acct = createAccount("Test", "test@example.com");
    const code = createReferralCode(acct.account_id);
    expect(code.code).toBeTruthy();
  });

  it("creates referral_conversions table with unique referee constraint", () => {
    const r1 = createAccount("R1", "r1@example.com");
    const r2 = createAccount("R2", "r2@example.com");
    const referee = createAccount("Ref", "ref@example.com");

    expect(recordReferralConversion(r1.account_id, referee.account_id)).toBe(true);
    // Second referrer for same referee should fail (unique on referee_account_id)
    expect(recordReferralConversion(r2.account_id, referee.account_id)).toBe(false);
  });

  it("creates referral_credits table", () => {
    const acct = createAccount("Test", "test@example.com");
    const credits = getReferralCredits(acct.account_id);
    expect(credits.account_id).toBe(acct.account_id);
    expect(credits.earned_credits_millicents).toBe(0);
    expect(credits.free_calls_remaining).toBe(0);
  });
});
