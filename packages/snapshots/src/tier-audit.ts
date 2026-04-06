import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { BillingTier } from "./billing-types.js";
import { TIER_LIMITS } from "./billing-types.js";

// ─── Types ──────────────────────────────────────────────────────

export interface TierChange {
  change_id: string;
  account_id: string;
  from_tier: BillingTier;
  to_tier: BillingTier;
  reason: string;          // "user_request" | "admin_action" | "payment_failed" etc.
  proration_amount: number; // calculated proration in cents (positive = charge, negative = credit)
  metadata: string;         // JSON
  created_at: string;
}

export interface ProrationResult {
  from_tier: BillingTier;
  to_tier: BillingTier;
  days_remaining_in_period: number;
  days_in_period: number;
  proration_amount: number;  // cents
  direction: "upgrade" | "downgrade" | "none";
}

// ─── Proration calculation ──────────────────────────────────────

/** Monthly prices in cents */
const TIER_PRICES: Record<BillingTier, number> = {
  free: 0,
  paid: 2900,   // $29/month
  suite: 9900,  // $99/month
};

export function calculateProration(
  from_tier: BillingTier,
  to_tier: BillingTier,
  daysRemainingInPeriod: number = 30,
  daysInPeriod: number = 30,
): ProrationResult {
  if (from_tier === to_tier) {
    return { from_tier, to_tier, days_remaining_in_period: daysRemainingInPeriod, days_in_period: daysInPeriod, proration_amount: 0, direction: "none" };
  }

  const fromPrice = TIER_PRICES[from_tier];
  const toPrice = TIER_PRICES[to_tier];
  const fraction = daysRemainingInPeriod / daysInPeriod;

  // Credit for unused time on old plan, charge for new plan's remaining time
  const credit = Math.round(fromPrice * fraction);
  const charge = Math.round(toPrice * fraction);
  const proration_amount = charge - credit;

  const direction = toPrice > fromPrice ? "upgrade" : "downgrade";

  return { from_tier, to_tier, days_remaining_in_period: daysRemainingInPeriod, days_in_period: daysInPeriod, proration_amount, direction };
}

// ─── Store functions ────────────────────────────────────────────

export function logTierChange(
  account_id: string,
  from_tier: BillingTier,
  to_tier: BillingTier,
  reason: string = "user_request",
  metadata: Record<string, unknown> = {},
): TierChange {
  const proration = calculateProration(from_tier, to_tier);

  const change: TierChange = {
    change_id: randomUUID(),
    account_id,
    from_tier,
    to_tier,
    reason,
    proration_amount: proration.proration_amount,
    metadata: JSON.stringify(metadata),
    created_at: new Date().toISOString(),
  };

  getDb().prepare(
    `INSERT INTO tier_changes
       (change_id, account_id, from_tier, to_tier, reason, proration_amount, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    change.change_id, change.account_id, change.from_tier, change.to_tier,
    change.reason, change.proration_amount, change.metadata, change.created_at,
  );

  return change;
}

export function getTierHistory(account_id: string, limit: number = 50): TierChange[] {
  return getDb().prepare(
    "SELECT * FROM tier_changes WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
  ).all(account_id, limit) as TierChange[];
}

export function getLastTierChange(account_id: string): TierChange | undefined {
  return getDb().prepare(
    "SELECT * FROM tier_changes WHERE account_id = ? ORDER BY created_at DESC LIMIT 1",
  ).get(account_id) as TierChange | undefined;
}
