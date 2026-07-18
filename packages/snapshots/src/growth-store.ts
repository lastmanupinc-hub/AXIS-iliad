// Growth & revenue snapshot — the data source for the product-readiness
// monetization-execution score (ME-01), so it moves on real numbers instead of
// estimate. Concrete figures (account counts, new-account growth windows,
// metered overage billed this month, active subscriptions) plus a transparent,
// clearly-labelled MRR ESTIMATE derived from paid-tier counts — and, since
// WO-19 (revenue-mrr-tracker), a SETTLED-payment-derived counterpart that
// reads a true $0 until real money moves, then rises on its own.

import { sql } from "./pg.js";
import { getTotalCompensationOwed } from "./compensation-store.js";
import { MARKETED_TIERS } from "./pricing-constants.js";

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
    /**
     * Rough MRR = paid-tier counts × the documented per-tier monthly price. An
     * ESTIMATE — never conflate with `settled_mrr_cents`, the code-derived figure.
     */
    estimated_mrr_cents: number;
    /**
     * Per-plan monthly price (cents) used for the estimate — exposed so the
     * number is auditable. Starter and Pro both collapse into the coarse
     * "paid" BillingTier, so they're split here via paid_plan_id
     * (H-Phase-A cycle 2 — this used to be a single flat `paid` price that
     * always assumed Starter, undercounting every real Pro subscriber).
     */
    mrr_basis_cents: { starter: number; pro: number; suite: number };
    /** Concrete: usage-credit OVERAGE billed this calendar month (real metered revenue). */
    metered_overage_cents_this_month: number;
    /** Concrete: active or trialing subscriptions on record. */
    active_subscriptions: number;
    /**
     * SETTLED (not estimated) revenue over the trailing 30 days: usage_credit_ledger
     * overage rows (amount_cents WHERE overage_credits > 0 — the metered cash owed)
     * plus payment_receipts (the H1 cash rail's actual Stripe/Tempo settlements).
     * A true $0 until a real payment settles — see WO-19.
     */
    settled_mrr_cents: number;
    /** All-time equivalent of `settled_mrr_cents` (no trailing-30d window). */
    settled_revenue_cents_all_time: number;
    /**
     * H2.4: money recorded in `compensation_ledger` as 'owed' right now — cash
     * settled for calls that then failed or an ambiguous wallet debit, not yet
     * made whole. This does NOT change `settled_revenue_cents_all_time` (that
     * stays the exact receipts sum); it is surfaced separately so the raw
     * receipts figure never silently drifts from its own documented definition.
     */
    compensation_owed_cents_all_time: number;
    /** `settled_revenue_cents_all_time` minus `compensation_owed_cents_all_time` — can go negative if owed exceeds settled. */
    settled_revenue_cents_all_time_net_of_compensation: number;
    /** Settled revenue broken out per tool, merging both settlement sources. */
    revenue_by_tool: Array<{ tool: string; cents: number; calls: number }>;
    /** MIN(created_at) across settled sources; null until the first dollar settles. */
    first_paid_call_at: string | null;
    /** DISTINCT accounts with >= 1 settled overage row or payment receipt. */
    paying_account_count: number;
    /** paying_account_count / accounts.total (0 when there are no accounts at all). */
    payment_conversion_rate: number;
  };
}

// MRR estimate assumptions: starter ($29), pro ($99), suite ≈ Growth ($299).
// H-Phase-A cycle 9: this used to be a THIRD independently-hardcoded price
// table (alongside pricing-constants.ts's MARKETED_TIERS — the file's own
// documented single source of truth — and tier-audit.ts's TIER_PRICES), with
// no test cross-checking any of them — the exact shape that already drifted
// once (tier-audit.ts's TIER_PRICES held a stale $99/mo suite price until
// cycle 1). Derived from MARKETED_TIERS now so a real price change can't
// desync this file from the source of truth it's documented to defer to.
function marketedPriceCents(planId: "starter" | "pro" | "growth"): number {
  return MARKETED_TIERS.find((t) => t.plan_id === planId)!.price_monthly_cents;
}
const PLAN_MONTHLY_CENTS = { starter: marketedPriceCents("starter"), pro: marketedPriceCents("pro"), suite: marketedPriceCents("growth") } as const;

/** A growth + revenue snapshot computed entirely from local data (no external calls). */
export async function getGrowthSnapshot(now: Date = new Date()): Promise<GrowthSnapshot> {
  const DAY = 86_400_000;
  // pg COUNT/SUM return strings/bigints — every aggregate read below is coerced
  // with Number() at the read site so the counts and MRR/overage math stay numeric.
  const since = async (msAgo: number) =>
    Number((await sql.one<{ n: string | number }>(
      "SELECT COUNT(*) as n FROM accounts WHERE created_at >= ?",
      [new Date(now.getTime() - msAgo).toISOString()],
    ))?.n ?? 0);

  const tiers = (await sql.one<{
    total: string | number;
    free: string | number | null;
    paid: string | number | null;
    paid_pro: string | number | null;
    suite: string | number | null;
  }>(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN tier='free'  THEN 1 ELSE 0 END) as free,
            SUM(CASE WHEN tier='paid'  THEN 1 ELSE 0 END) as paid,
            SUM(CASE WHEN tier='paid' AND paid_plan_id='pro' THEN 1 ELSE 0 END) as paid_pro,
            SUM(CASE WHEN tier='suite' THEN 1 ELSE 0 END) as suite
       FROM accounts`,
  ))!;
  const paid = Number(tiers.paid ?? 0);
  // Starter/Pro both collapse into tier==='paid' — paidPro is the subset
  // with paid_plan_id='pro' (H-Phase-A cycle 1); the rest default to
  // Starter, matching resolvePlanForAccount's own fallback.
  const paidPro = Number(tiers.paid_pro ?? 0);
  const paidStarter = paid - paidPro;
  const suite = Number(tiers.suite ?? 0);

  // 1 credit = 0.18 cents (18/100); match consumeUsageCredits' ceil rounding.
  const monthKey = now.toISOString().slice(0, 7);
  const overage = Number((await sql.one<{ oc: string | number }>(
    "SELECT COALESCE(SUM(overage_credits), 0) as oc FROM usage_credit_ledger WHERE month_key = ?",
    [monthKey],
  ))?.oc ?? 0);

  // H-Phase-A cycle 7: this used to count stripe_subscriptions rows only —
  // PAI'D (the only live checkout path) never writes that table (same root
  // cause estimated_mrr_cents was already fixed for, cycle 2, in this same
  // file), so it read persistently near-zero even while accounts/paid and
  // estimated_mrr_cents correctly showed real revenue — an internally
  // inconsistent snapshot. `paid`/`suite` above are already the real,
  // tier-derived counts; a real subscriber is exactly an account on a
  // paying tier, so no separate query is needed at all.
  const activeSubs = paid + suite;

  // ── Settled revenue (WO-19) ───────────────────────────────────────
  // Real, settled money ONLY — payment_receipts rows, written by
  // settleOverageCash (apps/api/src/cashier.ts) at the moment cash actually
  // clears on the live rail, one row per collected charge. This deliberately
  // EXCLUDES usage_credit_ledger overage rows: a ledger row records usage and
  // the amount BILLED, not money collected — an abandoned 402 challenge leaves
  // an overage ledger row with zero dollars moved, and a call that DOES pay
  // produces BOTH a ledger row and a receipt, so unioning the two counted
  // unpaid overage as revenue and double-counted paid overage. Receipts are
  // the penny-exact record of what was actually collected, which is the whole
  // point of "settled": this reads a true $0 until the first dollar clears.
  // (Billed-but-uncollected overage remains visible separately as
  // metered_overage_cents_this_month above.)
  const since30d = new Date(now.getTime() - 30 * DAY).toISOString();
  const SETTLED_CTE = `
    WITH settled AS (
      SELECT account_id, tool, amount_cents, created_at
        FROM payment_receipts
    )
  `;
  const settledTotals = await sql.one<{ total: string | number; first_at: string | null; payers: string | number }>(
    `${SETTLED_CTE} SELECT COALESCE(SUM(amount_cents), 0) as total,
                           MIN(created_at) as first_at,
                           COUNT(DISTINCT account_id) as payers
                    FROM settled`,
  );
  const settledTrailing = await sql.one<{ total: string | number }>(
    `${SETTLED_CTE} SELECT COALESCE(SUM(amount_cents), 0) as total FROM settled WHERE created_at >= ?`,
    [since30d],
  );
  const settledByTool = await sql.many<{ tool: string; cents: string | number; calls: string | number }>(
    `${SETTLED_CTE} SELECT tool, COALESCE(SUM(amount_cents), 0) as cents, COUNT(*) as calls
                    FROM settled GROUP BY tool ORDER BY tool`,
  );

  const totalAccounts = Number(tiers.total ?? 0);
  const payingAccountCount = Number(settledTotals?.payers ?? 0);
  const settledAllTime = Number(settledTotals?.total ?? 0);
  const compensationOwed = await getTotalCompensationOwed();

  return {
    generated_at: now.toISOString(),
    accounts: {
      total: totalAccounts,
      free: Number(tiers.free ?? 0),
      paid,
      suite,
      new_24h: await since(DAY),
      new_7d: await since(7 * DAY),
      new_30d: await since(30 * DAY),
    },
    revenue: {
      estimated_mrr_cents: paidStarter * PLAN_MONTHLY_CENTS.starter + paidPro * PLAN_MONTHLY_CENTS.pro + suite * PLAN_MONTHLY_CENTS.suite,
      mrr_basis_cents: { starter: PLAN_MONTHLY_CENTS.starter, pro: PLAN_MONTHLY_CENTS.pro, suite: PLAN_MONTHLY_CENTS.suite },
      metered_overage_cents_this_month: Math.ceil((overage * 18) / 100),
      active_subscriptions: activeSubs,
      settled_mrr_cents: Number(settledTrailing?.total ?? 0),
      settled_revenue_cents_all_time: settledAllTime,
      compensation_owed_cents_all_time: compensationOwed,
      settled_revenue_cents_all_time_net_of_compensation: settledAllTime - compensationOwed,
      revenue_by_tool: settledByTool.map((r) => ({
        tool: r.tool,
        cents: Number(r.cents),
        calls: Number(r.calls),
      })),
      first_paid_call_at: settledTotals?.first_at ?? null,
      paying_account_count: payingAccountCount,
      payment_conversion_rate: totalAccounts > 0 ? payingAccountCount / totalAccounts : 0,
    },
  };
}
