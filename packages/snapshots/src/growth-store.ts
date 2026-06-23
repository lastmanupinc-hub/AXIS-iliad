// Growth & revenue snapshot — the data source for the product-readiness
// monetization-execution score (ME-01), so it moves on real numbers instead of
// estimate. Concrete figures (account counts, new-account growth windows,
// metered overage billed this month, active subscriptions) plus a transparent,
// clearly-labelled MRR ESTIMATE derived from paid-tier counts.

import { sql } from "./pg.js";

export interface GrowthSnapshot {
  generated_at: string;
  accounts: {
    total: number;
    free: number;
    paid: number;
    suite: number;
    new_24h: number;
    new_7d: number;
    new_30d: number;
  };
  revenue: {
    /** Rough MRR = paid-tier counts × the documented per-tier monthly price. An ESTIMATE. */
    estimated_mrr_cents: number;
    /** Per-tier monthly price (cents) used for the estimate — exposed so the number is auditable. */
    mrr_basis_cents: { paid: number; suite: number };
    /** Concrete: usage-credit OVERAGE billed this calendar month (real metered revenue). */
    metered_overage_cents_this_month: number;
    /** Concrete: active or trialing subscriptions on record. */
    active_subscriptions: number;
  };
}

// MRR estimate assumptions: paid ≈ Starter ($29), suite ≈ Growth ($299).
// Adjust here if the tier↔plan mapping changes; the value is echoed in mrr_basis_cents.
const TIER_MONTHLY_CENTS = { paid: 2900, suite: 29900 } as const;

/** A growth + revenue snapshot computed entirely from local data (no external calls). */
export async function getGrowthSnapshot(now: Date = new Date()): Promise<GrowthSnapshot> {
  const DAY = 86_400_000;
  const since = async (msAgo: number) =>
    (await sql.one<{ n: number }>(
      "SELECT COUNT(*) as n FROM accounts WHERE created_at >= ?",
      [new Date(now.getTime() - msAgo).toISOString()],
    ))!.n;

  const tiers = (await sql.one<{ total: number; free: number | null; paid: number | null; suite: number | null }>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN tier='free'  THEN 1 ELSE 0 END) as free,
            SUM(CASE WHEN tier='paid'  THEN 1 ELSE 0 END) as paid,
            SUM(CASE WHEN tier='suite' THEN 1 ELSE 0 END) as suite
       FROM accounts`,
  ))!;
  const paid = tiers.paid ?? 0;
  const suite = tiers.suite ?? 0;

  // 1 credit = 0.18 cents (18/100); match consumeUsageCredits' ceil rounding.
  const monthKey = now.toISOString().slice(0, 7);
  const overage = (await sql.one<{ oc: number }>(
    "SELECT COALESCE(SUM(overage_credits), 0) as oc FROM usage_credit_ledger WHERE month_key = ?",
    [monthKey],
  ))!.oc;

  const activeSubs = (await sql.one<{ n: number }>(
    "SELECT COUNT(*) as n FROM stripe_subscriptions WHERE status IN ('active', 'trialing')",
  ))!.n;

  return {
    generated_at: now.toISOString(),
    accounts: {
      total: tiers.total ?? 0,
      free: tiers.free ?? 0,
      paid,
      suite,
      new_24h: await since(DAY),
      new_7d: await since(7 * DAY),
      new_30d: await since(30 * DAY),
    },
    revenue: {
      estimated_mrr_cents: paid * TIER_MONTHLY_CENTS.paid + suite * TIER_MONTHLY_CENTS.suite,
      mrr_basis_cents: { paid: TIER_MONTHLY_CENTS.paid, suite: TIER_MONTHLY_CENTS.suite },
      metered_overage_cents_this_month: Math.ceil((overage * 18) / 100),
      active_subscriptions: activeSubs,
    },
  };
}
