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
  last_reset_at: string;
  updated_at: string;
}

// ─── Constants ──────────────────────────────────────────────────

/** Each unique downstream referral earns $0.001 = 1 millicent. */
export const REWARD_MILLICENTS = 1;

/** Maximum earned discount per call: $0.20 = 20_000 millicents. */
export const MAX_EARNED_MILLICENTS = 20_000;

/** Rolling window for credit expiry: 30 days in milliseconds. */
export const CREDIT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
    db.prepare("INSERT INTO referral_credits (account_id, earned_credits_millicents, lifetime_referrals, free_calls_remaining, last_reset_at, updated_at) VALUES (?, 0, 0, 0, ?, ?)").run(account_id, now, now);
  }
}

/** Get referral credits for an account. Returns defaults if none exist. */
export function getReferralCredits(account_id: string): ReferralCredits {
  ensureReferralCredits(account_id);
  return getDb().prepare("SELECT * FROM referral_credits WHERE account_id = ?").get(account_id) as ReferralCredits;
}

/** Initialize the "5th call free" onboarding hook — grants 1 free call on first paid interaction. */
export function initFreeCallGrant(account_id: string): void {
  ensureReferralCredits(account_id);
  const db = getDb();
  const credits = db.prepare("SELECT free_calls_remaining, lifetime_referrals FROM referral_credits WHERE account_id = ?").get(account_id) as { free_calls_remaining: number; lifetime_referrals: number };
  // Only grant if never used (lifetime_referrals tracks this was never touched as referrer,
  // but free_calls_remaining === 0 with no prior grants is the real check).
  // We use a flag: if free_calls_remaining === 0 and updated_at === last_reset_at, it's fresh.
  const row = db.prepare("SELECT updated_at, last_reset_at FROM referral_credits WHERE account_id = ?").get(account_id) as { updated_at: string; last_reset_at: string };
  if (credits.free_calls_remaining === 0 && row.updated_at === row.last_reset_at) {
    const now = new Date().toISOString();
    db.prepare("UPDATE referral_credits SET free_calls_remaining = 1, updated_at = ? WHERE account_id = ?").run(now, account_id);
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

  // Reset expired credits (30-day rolling window)
  const lastReset = new Date(credits.last_reset_at).getTime();
  const now = Date.now();
  if (now - lastReset > CREDIT_WINDOW_MS) {
    const nowIso = new Date().toISOString();
    getDb().prepare("UPDATE referral_credits SET earned_credits_millicents = 0, last_reset_at = ?, updated_at = ? WHERE account_id = ?").run(nowIso, nowIso, account_id);
    return { final_cents: base_cents, discount_cents: 0, credits_used_millicents: 0 };
  }

  if (credits.earned_credits_millicents <= 0) {
    return { final_cents: base_cents, discount_cents: 0, credits_used_millicents: 0 };
  }

  // Convert millicents to cents for discount (1000 millicents = 1 cent)
  const maxDiscountCents = Math.min(Math.floor(credits.earned_credits_millicents / 1000), 20); // $0.20 cap
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
      reward_per_referral: "$0.001",
      reward_per_referral_millicents: REWARD_MILLICENTS,
      max_discount_per_call: "$0.20",
      max_discount_millicents: MAX_EARNED_MILLICENTS,
      rolling_window_days: 30,
      how: "Share your referral_token with other agents. When they make their first paid call with your token, you earn $0.001 off future calls.",
    },
    fifth_call_free: {
      description: "New agents get their 5th paid call free as an onboarding reward.",
      mechanism: "After 4 paid calls, the next call is automatically free.",
    },
    referral_token_field: "Include referral_token in prepare_for_agentic_purchasing args to attribute referrals.",
  };

  if (!account_id) return base;

  const credits = getReferralCredits(account_id);
  const codes = getReferralCodes(account_id);

  return {
    ...base,
    your_status: {
      referral_code: codes.length > 0 ? codes[0].code : null,
      earned_credits_millicents: credits.earned_credits_millicents,
      earned_discount: `$${(credits.earned_credits_millicents / 100_000).toFixed(3)}`,
      lifetime_referrals: credits.lifetime_referrals,
      free_calls_remaining: credits.free_calls_remaining,
    },
  };
}
