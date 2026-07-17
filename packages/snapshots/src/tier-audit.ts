import { randomUUID } from "node:crypto";
import { sql } from "./pg.js";
import type { BillingTier } from "./billing-types.js";
import { TIER_LIMITS } from "./billing-types.js";
import { resolveAccountMonthlyPriceCents } from "./pricing-constants.js";
import { getAccountPaidPlanId } from "./billing-store.js";

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

/** Monthly prices in cents. suite/Growth is $299/mo — see growth-store.ts's
 * TIER_MONTHLY_CENTS (the live MRR-estimate source of truth) and
 * pricing-constants.ts's MARKETED_TIERS; this table held a stale $99/mo
 * holdover from the old 2-tier pricing model until H-Phase-A cycle 1. */
const TIER_PRICES: Record<BillingTier, number> = {
  free: 0,
  paid: 2900,    // $29/month
  suite: 29900,  // $299/month
};

export function calculateProration(
  from_tier: BillingTier,
  to_tier: BillingTier,
  daysRemainingInPeriod: number = 30,
  daysInPeriod: number = 30,
  // The account's actual current plan (starter/pro), when known — Starter
  // and Pro both collapse into `from_tier === "paid"`, so without this a
  // real Pro subscriber's proration was always computed off Starter's $29
  // price (H-Phase-A cycle 2). Omit for a fresh-tier preview with no
  // account context; defaults to Starter, matching resolvePlanForAccount.
  fromPaidPlanId?: string | null,
): ProrationResult {
  if (from_tier === to_tier) {
    return { from_tier, to_tier, days_remaining_in_period: daysRemainingInPeriod, days_in_period: daysInPeriod, proration_amount: 0, direction: "none" };
  }

  const fromPrice = resolveAccountMonthlyPriceCents(from_tier, fromPaidPlanId);
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

export async function logTierChange(
  account_id: string,
  from_tier: BillingTier,
  to_tier: BillingTier,
  reason: string = "user_request",
  metadata: Record<string, unknown> = {},
): Promise<TierChange> {
  // Starter/Pro both collapse into from_tier === "paid" — every caller logs
  // BEFORE writing any plan_id change for this transition (paid-handlers.ts's
  // updateAccountPaidPlanId call happens after logTierChange), so the
  // column still holds the account's real FROM plan at this point. Without
  // this, every real tier change (self-service, PAI'D webhook, legacy
  // Stripe webhook) permanently logged a Pro subscriber's proration as if
  // they were on Starter (H-Phase-A cycle 2).
  const fromPaidPlanId = await getAccountPaidPlanId(account_id);
  const proration = calculateProration(from_tier, to_tier, undefined, undefined, fromPaidPlanId);

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

  await sql.run(
    `INSERT INTO tier_changes
       (change_id, account_id, from_tier, to_tier, reason, proration_amount, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      change.change_id, change.account_id, change.from_tier, change.to_tier,
      change.reason, change.proration_amount, change.metadata, change.created_at,
    ],
  );

  return change;
}

export async function getTierHistory(account_id: string, limit: number = 50): Promise<TierChange[]> {
  return await sql.many<TierChange>(
    "SELECT * FROM tier_changes WHERE account_id = ? ORDER BY created_at DESC LIMIT ?",
    [account_id, limit],
  );
}

export async function getLastTierChange(account_id: string): Promise<TierChange | undefined> {
  return await sql.one<TierChange>(
    "SELECT * FROM tier_changes WHERE account_id = ? ORDER BY created_at DESC LIMIT 1",
    [account_id],
  );
}
