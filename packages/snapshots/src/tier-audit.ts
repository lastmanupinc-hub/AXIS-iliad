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
  proration_amount: number;  // cents — see calculateProration's own comment
  direction: "upgrade" | "downgrade" | "none";
}

// ─── Proration calculation ──────────────────────────────────────

/** Monthly prices in cents, keyed by the coarse BillingTier (used for the
 * "to" side of a proration, which has no specific-plan context — see
 * resolveAccountMonthlyPriceCents in pricing-constants.ts for the
 * plan-aware "from" side). suite/Growth is $299/mo — see growth-store.ts's
 * PLAN_MONTHLY_CENTS (the live MRR-estimate source of truth) and
 * pricing-constants.ts's MARKETED_TIERS; this table held a stale $99/mo
 * holdover from the old 2-tier pricing model until H-Phase-A cycle 1. */
// H-Phase-A cycle 9: this used to be a hardcoded literal table, independent
// of both pricing-constants.ts's MARKETED_TIERS (the documented single
// source of truth) and growth-store.ts's own PLAN_MONTHLY_CENTS, with no
// test cross-checking any of them — exactly the shape that already drifted
// once here (this table held a stale $99/mo suite price until cycle 1;
// see the comment above). Derived via resolveAccountMonthlyPriceCents with
// no paidPlanId (its own documented Starter-default fallback for a coarse
// "paid" tier with no specific-plan context — matching this table's own
// purpose) instead of re-declaring the numbers.
const TIER_PRICES: Record<BillingTier, number> = {
  free: resolveAccountMonthlyPriceCents("free", null),
  paid: resolveAccountMonthlyPriceCents("paid", null),
  suite: resolveAccountMonthlyPriceCents("suite", null),
};

// H-Phase-A cycle 10: this used to compute a day-fraction-blended "credit
// for unused time on the old plan, charge for the new plan's remaining
// time" (daysRemainingInPeriod/daysInPeriod defaulting to 30/30) — entirely
// fictional under PAI'D's one-time-charge model, which has no billing
// period to prorate within (cycle 9 found and fixed the same fabrication
// in UsagePage.tsx's now-deleted proration-preview widget; this function
// was the ROOT of that bug and had 3 other live consumers cycle 9 missed:
// this table's own logTierChange — which permanently wrote the fictional
// amount to every tier_changes audit row — plus GET /v1/billing/proration
// and GET /v1/billing/history, both of which surfaced it to real callers).
// For a downgrade, the old day-fraction math could return a NEGATIVE
// "credit" — directly contradicting TermsPage.tsx's own already-corrected
// "we do not provide refunds for unused time" clause. The honest answer to
// "what does switching to to_tier cost" is simply to_tier's full one-time
// price — no credit for time already paid on from_tier, matching
// UsagePage.tsx's own established disclosure ("switching plans charges the
// full price of the new plan... there's no prorated credit for time
// remaining on your current plan").
export function calculateProration(
  from_tier: BillingTier,
  to_tier: BillingTier,
  // The account's actual current plan (starter/pro), when known — only
  // affects `direction` now (today's tier prices never disagree on
  // direction between the Starter/Pro defaults, since a same-coarse-tier
  // switch always hits the early return above; kept for correctness
  // against the account's real price rather than an assumed default).
  // Omit for a fresh-tier preview with no account context; defaults to
  // Starter, matching resolvePlanForAccount.
  fromPaidPlanId?: string | null,
): ProrationResult {
  if (from_tier === to_tier) {
    return { from_tier, to_tier, proration_amount: 0, direction: "none" };
  }

  const fromPrice = resolveAccountMonthlyPriceCents(from_tier, fromPaidPlanId);
  const toPrice = TIER_PRICES[to_tier];
  const direction = toPrice > fromPrice ? "upgrade" : "downgrade";

  return { from_tier, to_tier, proration_amount: toPrice, direction };
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
  const proration = calculateProration(from_tier, to_tier, fromPaidPlanId);

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
