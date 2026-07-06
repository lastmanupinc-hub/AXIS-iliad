import { randomUUID } from "node:crypto";
import { sql, pgPlaceholders } from "./pg.js";
import type { BillingTier } from "./billing-types.js";
import { getActiveSubscriptionByAccount, priceToPlanId } from "./stripe-store.js";
import { getReferralTokenUsageModifier } from "./referral-store.js";
import { MARKETED_TIERS, OVERAGE_CENTS_PER_CREDIT } from "./pricing-constants.js";

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
  ...Object.fromEntries(MARKETED_TIERS.map((t) => [t.plan_id, t.monthly_credits])),
  enterprise: 0,
} as Record<UsageCreditPlanId, number>;

function getMonthKey(isoDate = new Date().toISOString()): string {
  return isoDate.slice(0, 7);
}

async function resolvePlanForAccount(account_id: string, tier: BillingTier): Promise<UsageCreditPlanId> {
  const activeSub = await getActiveSubscriptionByAccount(account_id);
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
  // Overage is advertised as $0.0018 per credit = OVERAGE_CENTS_PER_CREDIT (0.18) cents per credit.
  return Math.max(1, Math.ceil(amountCents / OVERAGE_CENTS_PER_CREDIT));
}

async function getMonthlyRows(account_id: string, month_key: string): Promise<{
  included_credits_used: number;
  overage_credits: number;
}> {
  const monthly = await sql.one<{ included_credits_used: string | number }>(
    `SELECT included_credits_used
       FROM usage_credit_monthly
      WHERE account_id = ? AND month_key = ?`,
    [account_id, month_key],
  );
  const overage = await sql.one<{ overage_credits: string | number }>(
    `SELECT COALESCE(SUM(overage_credits), 0) as overage_credits
       FROM usage_credit_ledger
      WHERE account_id = ? AND month_key = ?`,
    [account_id, month_key],
  );
  // pg SUM(...) returns a string/bigint — coerce before the allowance/overage
  // arithmetic in the callers. included_credits_used also feeds subtraction, so
  // coerce it too (numeric columns can serialize as strings).
  return {
    included_credits_used: Number(monthly?.included_credits_used ?? 0),
    overage_credits: Number(overage?.overage_credits ?? 0),
  };
}

export async function getUsageCreditSummary(account_id: string, tier: BillingTier, monthKey?: string): Promise<UsageCreditSummary> {
  const month_key = monthKey ?? getMonthKey();
  const plan_id = await resolvePlanForAccount(account_id, tier);
  const monthly_allowance = PLAN_MONTHLY_CREDITS[plan_id] ?? 0;
  const rows = await getMonthlyRows(account_id, month_key);
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

interface ChargeInputs {
  month_key: string;
  credits_required: number;
  summary: UsageCreditSummary;
}

/**
 * Gather the static charge inputs (referral modifier, plan, allowance, prior counter)
 * via POOL reads. consumeUsageCredits calls this BEFORE opening its tx so the tx never
 * does a pool read while holding its own connection (which deadlocks the pool under
 * multi-account concurrency — each tx pinning one connection and awaiting a second).
 */
async function gatherChargeInputs(account_id: string, tier: BillingTier, amountCents: number): Promise<ChargeInputs> {
  const month_key = getMonthKey();
  const base_credits_required = creditsFromUsdCents(amountCents);
  const referral = tier === "free"
    ? { reduction_rate: 0 }
    : await getReferralTokenUsageModifier(account_id, month_key);
  const credits_required = Math.max(1, Math.ceil(base_credits_required * (1 - referral.reduction_rate)));
  const summary = await getUsageCreditSummary(account_id, tier, month_key);
  return { month_key, credits_required, summary };
}

/** Pure split math — no DB. Computes the included/overage split for a GIVEN current counter. */
function splitFromUsed(
  month_key: string,
  summary: UsageCreditSummary,
  credits_required: number,
  included_credits_used: number,
): ChargeComputation {
  const remaining = Math.max(0, summary.monthly_allowance - included_credits_used);
  const included_credits_applied = Math.min(remaining, credits_required);
  const overage_credits = Math.max(0, credits_required - included_credits_applied);
  const nextIncludedUsed = included_credits_used + included_credits_applied;
  const nextIncludedRemaining = Math.max(0, summary.monthly_allowance - nextIncludedUsed);
  const effective_overage_cents = overage_credits > 0 ? Math.ceil(overage_credits * OVERAGE_CENTS_PER_CREDIT) : 0;
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

/** Read-only charge math (no writes). Used by previewUsageCredits (the gate). */
async function computeCharge(account_id: string, tier: BillingTier, amountCents: number): Promise<ChargeComputation> {
  const inputs = await gatherChargeInputs(account_id, tier, amountCents);
  return splitFromUsed(inputs.month_key, inputs.summary, inputs.credits_required, inputs.summary.included_credits_used);
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
export async function previewUsageCredits(
  account_id: string,
  tier: BillingTier,
  tool: string,
  amountCents: number,
): Promise<UsageCreditChargeResult> {
  return toChargeResult(await computeCharge(account_id, tier, amountCents), tool);
}

export async function consumeUsageCredits(
  account_id: string,
  tier: BillingTier,
  tool: string,
  amountCents: number,
): Promise<UsageCreditChargeResult> {
  // Gather inputs on the POOL, BEFORE opening the tx — they are not the racy value, and
  // reading them outside the tx is what prevents a pool-exhaustion deadlock (a tx that
  // pins one connection and then awaits a second starves the pool once concurrent
  // distinct-account calls reach pool max — distinct accounts don't serialize on the lock).
  const inputs = await gatherChargeInputs(account_id, tier, amountCents);

  // Serialize per-account consumes (namespace 2 = usage credits) and do EVERY in-tx
  // statement on the single tx `client` connection. The advisory lock guarantees any
  // prior consume for this account has committed, so the counter re-read below is fresh
  // and the included/overage split can't lose updates under concurrency.
  return await sql.tx<UsageCreditChargeResult>(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(2, hashtext($1))", [account_id]);

    const cur = await client.query<{ included_credits_used: string | number | null }>(
      "SELECT included_credits_used FROM usage_credit_monthly WHERE account_id = $1 AND month_key = $2",
      [account_id, inputs.month_key],
    );
    const includedUsed = Number(cur.rows[0]?.included_credits_used ?? 0);
    const c = splitFromUsed(inputs.month_key, inputs.summary, inputs.credits_required, includedUsed);

    await client.query(
      pgPlaceholders(
        `INSERT INTO usage_credit_monthly
          (account_id, month_key, plan_id, monthly_allowance, included_credits_used, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, month_key) DO UPDATE SET
           plan_id = excluded.plan_id,
           monthly_allowance = excluded.monthly_allowance,
           included_credits_used = excluded.included_credits_used,
           updated_at = excluded.updated_at`,
      ),
      [
        account_id,
        c.month_key,
        c.summary.plan_id,
        c.summary.monthly_allowance,
        c.nextIncludedUsed,
        new Date().toISOString(),
      ],
    );

    await client.query(
      pgPlaceholders(
        `INSERT INTO usage_credit_ledger
          (entry_id, account_id, month_key, plan_id, tool, amount_cents, credits_required, included_credits_applied, overage_credits, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      [
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
      ],
    );

    return toChargeResult(c, tool);
  });
}