import { describe, it, expect, beforeEach } from "vitest";
import { resetTestDb } from "./pg-test.js";
import { sql } from "./pg.js";
import { createAccount } from "./billing-store.js";
import {
  createReferralCode,
  lookupReferralCode,
  getReferralCodes,
  recordReferralConversion,
  getReferralConversionCount,
  getReferralCredits,
  recordPaidCall,
  consumeFreeCall,
  applyReferralDiscount,
  buildIncentivesSummary,
  REWARD_MILLICENTS,
  MAX_EARNED_MILLICENTS,
} from "./referral-store.js";

beforeEach(async () => { await resetTestDb(); });

// ─── Referral Code Management ───────────────────────────────────

describe("Referral Codes", () => {
  it("creates a referral code for an account", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const code = await createReferralCode(acct.account_id);
    expect(code.code).toHaveLength(12);
    expect(code.account_id).toBe(acct.account_id);
    expect(code.created_at).toBeTruthy();
  });

  it("returns existing code on duplicate create", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const code1 = await createReferralCode(acct.account_id);
    const code2 = await createReferralCode(acct.account_id);
    expect(code1.code).toBe(code2.code);
  });

  it("lookupReferralCode finds existing codes", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    const code = await createReferralCode(acct.account_id);
    const found = await lookupReferralCode(code.code);
    expect(found).toBeDefined();
    expect(found!.account_id).toBe(acct.account_id);
  });

  it("lookupReferralCode returns undefined for unknown codes", async () => {
    expect(await lookupReferralCode("NONEXISTENT")).toBeUndefined();
  });

  it("getReferralCodes returns all codes for account", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await createReferralCode(acct.account_id);
    const codes = await getReferralCodes(acct.account_id);
    expect(codes).toHaveLength(1);
  });
});

// ─── Conversion Tracking ────────────────────────────────────────

describe("Referral Conversions", () => {
  it("records a valid conversion", async () => {
    const referrer = await createAccount("Referrer", "ref@example.com");
    const referee = await createAccount("Referee", "ree@example.com");
    await createReferralCode(referrer.account_id);

    const result = await recordReferralConversion(referrer.account_id, referee.account_id);
    expect(result).toBe(true);
    expect(await getReferralConversionCount(referrer.account_id)).toBe(1);
  });

  it("prevents duplicate referee conversions", async () => {
    const referrer = await createAccount("Referrer", "ref@example.com");
    const referee = await createAccount("Referee", "ree@example.com");

    expect(await recordReferralConversion(referrer.account_id, referee.account_id)).toBe(true);
    expect(await recordReferralConversion(referrer.account_id, referee.account_id)).toBe(false);
  });

  it("prevents self-referral", async () => {
    const acct = await createAccount("Self", "self@example.com");
    expect(await recordReferralConversion(acct.account_id, acct.account_id)).toBe(false);
  });

  it("credits referrer with REWARD_MILLICENTS per conversion", async () => {
    const referrer = await createAccount("Referrer", "ref@example.com");
    const referee = await createAccount("Referee", "ree@example.com");

    await recordReferralConversion(referrer.account_id, referee.account_id);
    const credits = await getReferralCredits(referrer.account_id);
    expect(credits.earned_credits_millicents).toBe(REWARD_MILLICENTS);
    expect(credits.lifetime_referrals).toBe(1);
  });

  it("caps earned credits at MAX_EARNED_MILLICENTS", async () => {
    const referrer = await createAccount("Referrer", "ref@example.com");

    // Seed credits row, then set near max directly for speed
    await getReferralCredits(referrer.account_id);
    await sql.run("UPDATE referral_credits SET earned_credits_millicents = ? WHERE account_id = ?", [MAX_EARNED_MILLICENTS - 1, referrer.account_id]);

    const referee = await createAccount("Last", "last@example.com");
    await recordReferralConversion(referrer.account_id, referee.account_id);

    const credits = await getReferralCredits(referrer.account_id);
    expect(credits.earned_credits_millicents).toBe(MAX_EARNED_MILLICENTS);
  });
});

// ─── 5th Call Free (Paid Call Counting) ─────────────────────────────

describe("5th Call Free", () => {
  it("does not grant free call before 4 paid calls", async () => {
    const acct = await createAccount("New", "new@example.com");
    for (let i = 0; i < 3; i++) await recordPaidCall(acct.account_id);
    const credits = await getReferralCredits(acct.account_id);
    expect(credits.paid_call_count).toBe(3);
    expect(credits.free_calls_remaining).toBe(0);
  });

  it("grants one free call on 4th paid call", async () => {
    const acct = await createAccount("New", "new@example.com");
    for (let i = 0; i < 4; i++) await recordPaidCall(acct.account_id);
    const credits = await getReferralCredits(acct.account_id);
    expect(credits.paid_call_count).toBe(4);
    expect(credits.free_calls_remaining).toBe(1);
    expect(credits.initial_grant_given).toBe(1);
  });

  it("does not re-grant after free call is consumed", async () => {
    const acct = await createAccount("New", "new@example.com");
    for (let i = 0; i < 4; i++) await recordPaidCall(acct.account_id);
    expect(await consumeFreeCall(acct.account_id)).toBe(true);
    expect((await getReferralCredits(acct.account_id)).free_calls_remaining).toBe(0);
    // More paid calls must NOT re-grant
    await recordPaidCall(acct.account_id);
    expect((await getReferralCredits(acct.account_id)).free_calls_remaining).toBe(0);
    expect((await getReferralCredits(acct.account_id)).paid_call_count).toBe(5);
  });

  it("consumeFreeCall returns true and decrements", async () => {
    const acct = await createAccount("New", "new@example.com");
    for (let i = 0; i < 4; i++) await recordPaidCall(acct.account_id);
    expect(await consumeFreeCall(acct.account_id)).toBe(true);
    const credits = await getReferralCredits(acct.account_id);
    expect(credits.free_calls_remaining).toBe(0);
  });

  it("consumeFreeCall returns false when none remaining", async () => {
    const acct = await createAccount("New", "new@example.com");
    for (let i = 0; i < 4; i++) await recordPaidCall(acct.account_id);
    await consumeFreeCall(acct.account_id);
    expect(await consumeFreeCall(acct.account_id)).toBe(false);
  });
});

// ─── Discount Application ───────────────────────────────────────

describe("Referral Discount", () => {
  it("returns no discount when no credits earned", async () => {
    const acct = await createAccount("New", "new@example.com");
    const result = await applyReferralDiscount(acct.account_id, 50);
    expect(result.final_cents).toBe(50);
    expect(result.discount_cents).toBe(0);
  });

  it("does not apply discount when accrued credits are below one cent", async () => {
    const referrer = await createAccount("Referrer", "ref@example.com");

    // Seed credits directly — still below one cent in this micro-discount model.
    await getReferralCredits(referrer.account_id);
    await sql.run("UPDATE referral_credits SET earned_credits_millicents = ? WHERE account_id = ?", [MAX_EARNED_MILLICENTS, referrer.account_id]);

    const result = await applyReferralDiscount(referrer.account_id, 50);
    expect(result.discount_cents).toBe(0);
    expect(result.final_cents).toBe(50);
    expect(result.credits_used_millicents).toBe(0);

    // Credits are preserved when no whole-cent discount can be applied.
    const afterCredits = await getReferralCredits(referrer.account_id);
    expect(afterCredits.earned_credits_millicents).toBe(MAX_EARNED_MILLICENTS);
  });

  it("caps earned balance at $0.0002 (20 millicents)", async () => {
    const referrer = await createAccount("Referrer", "ref@example.com");

    // Seed max credits directly
    await getReferralCredits(referrer.account_id);
    await sql.run("UPDATE referral_credits SET earned_credits_millicents = ? WHERE account_id = ?", [MAX_EARNED_MILLICENTS, referrer.account_id]);

    const result = await applyReferralDiscount(referrer.account_id, 50);
    expect(result.discount_cents).toBe(0);
    expect(result.final_cents).toBe(50);
  });
});

// ─── Incentives Summary ─────────────────────────────────────────

describe("Incentives Summary", () => {
  it("returns base summary without account", async () => {
    const summary = await buildIncentivesSummary();
    expect(summary.share_to_earn).toBeDefined();
    expect(summary.fifth_call_free).toBeDefined();
    expect(summary.referral_token_field).toBeDefined();
    expect(summary).not.toHaveProperty("your_status");
  });

  it("returns enriched summary with account", async () => {
    const acct = await createAccount("Alice", "alice@example.com");
    await createReferralCode(acct.account_id);
    const summary = await buildIncentivesSummary(acct.account_id);
    expect(summary).toHaveProperty("your_status");
    const status = summary.your_status as Record<string, unknown>;
    expect(status.referral_code).toBeTruthy();
    expect(status.earned_credits_millicents).toBe(0);
    expect(status.lifetime_referrals).toBe(0);
  });
});

// ─── Schema Migration ───────────────────────────────────────────

describe("Migration v16 — referral tables", () => {
  it("creates referral_codes table", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const code = await createReferralCode(acct.account_id);
    expect(code.code).toBeTruthy();
  });

  it("creates referral_conversions table with unique referee constraint", async () => {
    const r1 = await createAccount("R1", "r1@example.com");
    const r2 = await createAccount("R2", "r2@example.com");
    const referee = await createAccount("Ref", "ref@example.com");

    expect(await recordReferralConversion(r1.account_id, referee.account_id)).toBe(true);
    // Second referrer for same referee should fail (unique on referee_account_id)
    expect(await recordReferralConversion(r2.account_id, referee.account_id)).toBe(false);
  });

  it("creates referral_credits table", async () => {
    const acct = await createAccount("Test", "test@example.com");
    const credits = await getReferralCredits(acct.account_id);
    expect(credits.account_id).toBe(acct.account_id);
    expect(credits.earned_credits_millicents).toBe(0);
    expect(credits.free_calls_remaining).toBe(0);
  });
});
