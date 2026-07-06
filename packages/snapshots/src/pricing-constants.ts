// Single source of truth for the publicly marketed pricing (WO-01 billing-tiers-4).
//
// The four marketed tiers, the overage rate, and the referral reduction cap are
// defined ONCE here as exported named constants. Every consuming plane (usage
// credit metering, the plan catalog, the referral store, the ForAgents page,
// LAUNCH_CLAIMS.yaml) must derive from — or be cross-checked against — this
// module so the public pricing claim stays drift-proof. See
// pricing-constants.test.ts for the cross-plane guard tests.

export type MarketedPlanId = "free" | "starter" | "pro" | "growth";

export interface MarketedTier {
  plan_id: MarketedPlanId;
  price_monthly_cents: number; // 0 | 2900 | 9900 | 29900
  monthly_credits: number; // 10_000 | 75_000 | 300_000 | 1_200_000
}

export const MARKETED_TIERS: readonly MarketedTier[] = [
  { plan_id: "free", price_monthly_cents: 0, monthly_credits: 10_000 },
  { plan_id: "starter", price_monthly_cents: 2900, monthly_credits: 75_000 },
  { plan_id: "pro", price_monthly_cents: 9900, monthly_credits: 300_000 },
  { plan_id: "growth", price_monthly_cents: 29900, monthly_credits: 1_200_000 },
];

/** Overage billed at $0.0018 per credit. */
export const OVERAGE_USD_PER_CREDIT = 0.0018;
/** Same rate in cents (0.18 per credit) — used by the cents-based charge math. */
export const OVERAGE_CENTS_PER_CREDIT = 0.18;
/** Referral reward caps token-usage reduction at 0.02% (0.0002) per call. */
export const REFERRAL_MAX_REDUCTION_RATE = 0.0002;
