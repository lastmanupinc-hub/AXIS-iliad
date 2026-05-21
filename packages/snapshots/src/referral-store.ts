import { randomUUID, randomBytes } from "node:crypto";
import { getDb } from "./db.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ReferralCode {
  code: string;
  account_id: string;
  created_at: string;
}

export interface ReferralConversion {
  conversion_id: string;
  referrer_account_id: string;
  referee_account_id: string;
  converted_at: string;
}

export interface ReferralCredits {
  account_id: string;
  earned_credits_millicents: number;
  lifetime_referrals: number;
  free_calls_remaining: number;
  initial_grant_given: number;
  paid_call_count: number;
  last_reset_at: string;
  updated_at: string;
}

export interface ReferralTokenUsageModifier {
  reduction_rate: number;
  month_key: string;
  earned_credits_millicents: number;
}

// ─── Constants ──────────────────────────────────────────────────

/** Each unique downstream referral earns $0.00001 = 1 millicent. */
export const REWARD_MILLICENTS = 1;

/** Maximum earned discount balance: $0.0002 = 20 millicents. */
export const MAX_EARNED_MILLICENTS = 20;

/** Rolling window for credit expiry: 30 days in milliseconds. */
export const CREDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function getMonthKey(isoDate = new Date().toISOString()): string {
  return isoDate.slice(0, 7);
}

function resetCreditsIfBillingCycleChanged(account_id: string, nowIso = new Date().toISOString()): void {
  const db = getDb();
  const row = db.prepare("SELECT last_reset_at FROM referral_credits WHERE account_id = ?").get(account_id) as { last_reset_at: string } | undefined;
  if (!row) return;
  if (getMonthKey(row.last_reset_at) === getMonthKey(nowIso)) return;
  db.prepare("UPDATE referral_credits SET earned_credits_millicents = 0, last_reset_at = ?, updated_at = ? WHERE account_id = ?").run(nowIso, nowIso, account_id);
}

// ─── Referral Code Management ───────────────────────────────────

/** Generate a URL-safe 12-character referral code. */
function generateCode(): string {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

/** Create a referral code for an account. Returns existing code if one already exists. */
export function createReferralCode(account_id: string): ReferralCode {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM referral_codes WHERE account_id = ?").get(account_id) as ReferralCode | undefined;
  if (existing) return existing;

  const code: ReferralCode = {
    code: generateCode(),
    account_id,
    created_at: new Date().toISOString(),
  };
  db.prepare("INSERT INTO referral_codes (code, account_id, created_at) VALUES (?, ?, ?)").run(code.code, code.account_id, code.created_at);
  return code;
}

/** Look up a referral code. Returns the referrer's account_id or undefined. */
export function lookupReferralCode(code: string): ReferralCode | undefined {
  return getDb().prepare("SELECT * FROM referral_codes WHERE code = ?").get(code) as ReferralCode | undefined;
}

/** Get referral code(s) for an account. */
export function getReferralCodes(account_id: string): ReferralCode[] {
  return getDb().prepare("SELECT * FROM referral_codes WHERE account_id = ?").all(account_id) as ReferralCode[];
}

// ─── Conversion Tracking ────────────────────────────────────────

/** Record a referral conversion. Returns false if referee was already referred. */
export function recordReferralConversion(referrer_account_id: string, referee_account_id: string): boolean {
  const db = getDb();

  // Self-referral prevention
  if (referrer_account_id === referee_account_id) return false;

  // Check if referee already converted (UNIQUE constraint on referee_account_id)
  const existing = db.prepare("SELECT 1 FROM referral_conversions WHERE referee_account_id = ?").get(referee_account_id);
  if (existing) return false;

  const conversion: ReferralConversion = {
    conversion_id: randomUUID(),
    referrer_account_id,
    referee_account_id,
    converted_at: new Date().toISOString(),
  };

  db.prepare("INSERT INTO referral_conversions (conversion_id, referrer_account_id, referee_account_id, converted_at) VALUES (?, ?, ?, ?)").run(
    conversion.conversion_id, conversion.referrer_account_id, conversion.referee_account_id, conversion.converted_at,
  );

  // Credit the referrer (capped at MAX_EARNED_MILLICENTS)
  ensureReferralCredits(referrer_account_id);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE referral_credits
    SET earned_credits_millicents = MIN(earned_credits_millicents + ?, ?),
        lifetime_referrals = lifetime_referrals + 1,
        updated_at = ?
    WHERE account_id = ?
  `).run(REWARD_MILLICENTS, MAX_EARNED_MILLICENTS, now, referrer_account_id);

  return true;
}

/** Get conversion count for a referrer. */
export function getReferralConversionCount(account_id: string): number {
  const row = getDb().prepare("SELECT COUNT(*) as c FROM referral_conversions WHERE referrer_account_id = ?").get(account_id) as { c: number };
  return row.c;
}

// ─── Credits Management ─────────────────────────────────────────

/** Ensure a referral_credits row exists for account. */
function ensureReferralCredits(account_id: string): void {
  const db = getDb();
  const existing = db.prepare("SELECT 1 FROM referral_credits WHERE account_id = ?").get(account_id);
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO referral_credits (account_id, earned_credits_millicents, lifetime_referrals, free_calls_remaining, initial_grant_given, paid_call_count, last_reset_at, updated_at) VALUES (?, 0, 0, 0, 0, 0, ?, ?)").run(account_id, now, now);
  }
}

/** Get referral credits for an account. Returns defaults if none exist. */
export function getReferralCredits(account_id: string): ReferralCredits {
  ensureReferralCredits(account_id);
  resetCreditsIfBillingCycleChanged(account_id);
  return getDb().prepare("SELECT * FROM referral_credits WHERE account_id = ?").get(account_id) as ReferralCredits;
}

/**
 * Referral rewards reduce token usage (credits consumed), not cash price.
 * reduction_rate is a small scalar in [0, 1], e.g. 0.0002 = 0.02%.
 */
export function getReferralTokenUsageModifier(account_id: string, monthKey?: string): ReferralTokenUsageModifier {
  const credits = getReferralCredits(account_id);
  const month_key = monthKey ?? getMonthKey();
  const reduction_rate = Math.min(credits.earned_credits_millicents / 100_000, 0.0002);
  return {
    reduction_rate,
    month_key,
    earned_credits_millicents: credits.earned_credits_millicents,
  };
}

/** Record a paid call and auto-grant 5th-call-free when paid_call_count reaches 4. */
export function recordPaidCall(account_id: string): void {
  ensureReferralCredits(account_id);
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE referral_credits SET paid_call_count = paid_call_count + 1, updated_at = ? WHERE account_id = ?").run(now, account_id);
  const row = db.prepare("SELECT paid_call_count, initial_grant_given FROM referral_credits WHERE account_id = ?").get(account_id) as { paid_call_count: number; initial_grant_given: number };
  if (row.paid_call_count >= 4 && !row.initial_grant_given) {
    db.prepare("UPDATE referral_credits SET free_calls_remaining = 1, initial_grant_given = 1, updated_at = ? WHERE account_id = ?").run(now, account_id);
  }
}

/** Consume one free call. Returns true if a free call was consumed. */
export function consumeFreeCall(account_id: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE referral_credits SET free_calls_remaining = free_calls_remaining - 1, updated_at = ? WHERE account_id = ? AND free_calls_remaining > 0").run(new Date().toISOString(), account_id);
  return result.changes > 0;
}

/** Apply referral discount to a base price in cents. Returns adjusted price (minimum 0). */
export function applyReferralDiscount(account_id: string, base_cents: number): { final_cents: number; discount_cents: number; credits_used_millicents: number } {
  const credits = getReferralCredits(account_id);

  if (credits.earned_credits_millicents <= 0) {
    return { final_cents: base_cents, discount_cents: 0, credits_used_millicents: 0 };
  }

  // Convert millicents to cents for discount (1000 millicents = 1 cent).
  const maxDiscountCents = Math.min(
    Math.floor(credits.earned_credits_millicents / 1000),
    Math.floor(MAX_EARNED_MILLICENTS / 1000),
  );
  const discountCents = Math.min(maxDiscountCents, base_cents);
  const millicentsUsed = discountCents * 1000;

  if (discountCents > 0) {
    getDb().prepare("UPDATE referral_credits SET earned_credits_millicents = earned_credits_millicents - ?, updated_at = ? WHERE account_id = ?").run(millicentsUsed, new Date().toISOString(), account_id);
  }

  return {
    final_cents: base_cents - discountCents,
    discount_cents: discountCents,
    credits_used_millicents: millicentsUsed,
  };
}

/** Build incentives summary for agent-facing responses. */
export function buildIncentivesSummary(account_id?: string): Record<string, unknown> {
  const base = {
    share_to_earn: {
      reward_per_referral: "$0.00001",
      reward_per_referral_millicents: REWARD_MILLICENTS,
      max_discount_per_call: "$0.0002",
      max_discount_millicents: MAX_EARNED_MILLICENTS,
      max_token_usage_reduction_rate: 0.0002,
      rolling_window_days: 30,
      how: "Share your referral_token with other agents. Referral rewards reduce token usage per call (cash pricing remains unchanged).",
    },
    fifth_call_free: {
      description: "After 4 paid calls, the 5th is free — one-time onboarding reward.",
      mechanism: "Tracked by paid_call_count. Granted exactly once per account when count reaches 4.",
    },
    referral_token_field: "Include referral_token in prepare_agentic_purchasing args to attribute referrals.",
  };

  if (!account_id) return base;

  const credits = getReferralCredits(account_id);
  const codes = getReferralCodes(account_id);

  return {
    ...base,
    your_status: {
      referral_code: codes.length > 0 ? codes[0].code : null,
      earned_credits_millicents: credits.earned_credits_millicents,
      earned_discount: `$${(credits.earned_credits_millicents / 100_000).toFixed(6)}`,
      token_usage_reduction_rate: Math.min(credits.earned_credits_millicents / 100_000, 0.0002),
      lifetime_referrals: credits.lifetime_referrals,
      free_calls_remaining: credits.free_calls_remaining,
    },
  };
}
