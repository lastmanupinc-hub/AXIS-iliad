import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { BillingTier } from "./billing-types.js";
import { getActiveSubscriptionByAccount, priceToPlanId } from "./stripe-store.js";
import { getReferralTokenUsageModifier } from "./referral-store.js";

export type UsageCreditPlanId = "free" | "starter" | "pro" | "growth" | "enterprise";

export interface UsageCreditSummary {
  plan_id: UsageCreditPlanId;
  month_key: string;
  monthly_allowance: number;
  included_credits_used: number;
  included_credits_remaining: number;
  overage_credits_this_month: number;
}

export interface UsageCreditChargeResult extends UsageCreditSummary {
  tool: string;
  credits_required: number;
  included_credits_applied: number;
  overage_credits: number;
  effective_overage_cents: number;
}

const PLAN_MONTHLY_CREDITS: Record<UsageCreditPlanId, number> = {
  free: 10_000,
  starter: 75_000,
  pro: 300_000,
  growth: 1_200_000,
  enterprise: 0,
};

function getMonthKey(isoDate = new Date().toISOString()): string {
  return isoDate.slice(0, 7);
}

function resolvePlanForAccount(account_id: string, tier: BillingTier): UsageCreditPlanId {
  const activeSub = getActiveSubscriptionByAccount(account_id);
  if (activeSub) {
    const planFromPrice = priceToPlanId(activeSub.price_id);
    if (planFromPrice) return planFromPrice;
  }
  if (tier === "suite") return "growth";
  if (tier === "paid") return "starter";
  return "free";
}

export function creditsFromUsdCents(amountCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  // Overage is advertised as $0.0018 per credit = 0.18 cents per credit.
  return Math.max(1, Math.ceil((amountCents * 100) / 18));
}

function getMonthlyRows(account_id: string, month_key: string): {
  included_credits_used: number;
  overage_credits: number;
} {
  const db = getDb();
  const monthly = db.prepare(
    `SELECT included_credits_used
       FROM usage_credit_monthly
      WHERE account_id = ? AND month_key = ?`,
  ).get(account_id, month_key) as { included_credits_used: number } | undefined;
  const overage = db.prepare(
    `SELECT COALESCE(SUM(overage_credits), 0) as overage_credits
       FROM usage_credit_ledger
      WHERE account_id = ? AND month_key = ?`,
  ).get(account_id, month_key) as { overage_credits: number } | undefined;
  return {
    included_credits_used: monthly?.included_credits_used ?? 0,
    overage_credits: overage?.overage_credits ?? 0,
  };
}

export function getUsageCreditSummary(account_id: string, tier: BillingTier, monthKey?: string): UsageCreditSummary {
  const month_key = monthKey ?? getMonthKey();
  const plan_id = resolvePlanForAccount(account_id, tier);
  const monthly_allowance = PLAN_MONTHLY_CREDITS[plan_id] ?? 0;
  const rows = getMonthlyRows(account_id, month_key);
  return {
    plan_id,
    month_key,
    monthly_allowance,
    included_credits_used: rows.included_credits_used,
    included_credits_remaining: Math.max(0, monthly_allowance - rows.included_credits_used),
    overage_credits_this_month: rows.overage_credits,
  };
}

interface ChargeComputation {
  month_key: string;
  summary: UsageCreditSummary;
  credits_required: number;
  included_credits_applied: number;
  overage_credits: number;
  nextIncludedUsed: number;
  nextIncludedRemaining: number;
  effective_overage_cents: number;
}

/** Pure charge math — no DB writes. Shared by previewUsageCredits (the gate) and consumeUsageCredits (the commit). */
function computeCharge(account_id: string, tier: BillingTier, amountCents: number): ChargeComputation {
  const month_key = getMonthKey();
  const base_credits_required = creditsFromUsdCents(amountCents);
  const referral = tier === "free"
    ? { reduction_rate: 0 }
    : getReferralTokenUsageModifier(account_id, month_key);
  const credits_required = Math.max(1, Math.ceil(base_credits_required * (1 - referral.reduction_rate)));
  const summary = getUsageCreditSummary(account_id, tier, month_key);
  const included_credits_applied = Math.min(summary.included_credits_remaining, credits_required);
  const overage_credits = Math.max(0, credits_required - included_credits_applied);
  const nextIncludedUsed = summary.included_credits_used + included_credits_applied;
  const nextIncludedRemaining = Math.max(0, summary.monthly_allowance - nextIncludedUsed);
  const effective_overage_cents = overage_credits > 0 ? Math.ceil((overage_credits * 18) / 100) : 0;
  return {
    month_key,
    summary,
    credits_required,
    included_credits_applied,
    overage_credits,
    nextIncludedUsed,
    nextIncludedRemaining,
    effective_overage_cents,
  };
}

function toChargeResult(c: ChargeComputation, tool: string): UsageCreditChargeResult {
  return {
    plan_id: c.summary.plan_id,
    month_key: c.month_key,
    monthly_allowance: c.summary.monthly_allowance,
    included_credits_used: c.nextIncludedUsed,
    included_credits_remaining: c.nextIncludedRemaining,
    overage_credits_this_month: c.summary.overage_credits_this_month + c.overage_credits,
    tool,
    credits_required: c.credits_required,
    included_credits_applied: c.included_credits_applied,
    overage_credits: c.overage_credits,
    effective_overage_cents: c.effective_overage_cents,
  };
}

/**
 * Read-only preview of what consumeUsageCredits WOULD charge — performs NO DB
 * write. Used as the pre-authorization gate: a call can be rejected (402) for
 * exceeding included credits without committing a debit, and the actual debit
 * can be deferred until the metered work succeeds.
 */
export function previewUsageCredits(
  account_id: string,
  tier: BillingTier,
  tool: string,
  amountCents: number,
): UsageCreditChargeResult {
  return toChargeResult(computeCharge(account_id, tier, amountCents), tool);
}

export function consumeUsageCredits(
  account_id: string,
  tier: BillingTier,
  tool: string,
  amountCents: number,
): UsageCreditChargeResult {
  const c = computeCharge(account_id, tier, amountCents);

  const db = getDb();
  db.prepare(
    `INSERT INTO usage_credit_monthly
      (account_id, month_key, plan_id, monthly_allowance, included_credits_used, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, month_key) DO UPDATE SET
       plan_id = excluded.plan_id,
       monthly_allowance = excluded.monthly_allowance,
       included_credits_used = excluded.included_credits_used,
       updated_at = excluded.updated_at`,
  ).run(
    account_id,
    c.month_key,
    c.summary.plan_id,
    c.summary.monthly_allowance,
    c.nextIncludedUsed,
    new Date().toISOString(),
  );

  db.prepare(
    `INSERT INTO usage_credit_ledger
      (entry_id, account_id, month_key, plan_id, tool, amount_cents, credits_required, included_credits_applied, overage_credits, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    account_id,
    c.month_key,
    c.summary.plan_id,
    tool,
    amountCents,
    c.credits_required,
    c.included_credits_applied,
    c.overage_credits,
    new Date().toISOString(),
  );

  return toChargeResult(c, tool);
}