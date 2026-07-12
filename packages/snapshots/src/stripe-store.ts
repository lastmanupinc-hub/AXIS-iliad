// ─── Stripe Subscription Store ─────────────────────────────────
//
// CRUD for Stripe subscriptions linked to AXIS accounts.
// Used by the webhook handler and checkout flow.

import { sql } from "./pg.js";
import type { BillingTier } from "./billing-types.js";

export type StripePlanId = "starter" | "pro" | "growth";

// ─── Types ──────────────────────────────────────────────────────

export type StripeSubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "unpaid"
  | "paused";

export interface StripeSubscription {
  subscription_id: string;
  customer_id: string;
  account_id: string;
  price_id: string;
  status: StripeSubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  cancel_at: string | null;
  created_at: string;
  updated_at: string;
  /**
   * H2.6 (red-team fix, WAVE-0 finding #7): the Stripe Event object's own
   * `created` (Unix seconds) for the last customer.subscription.* webhook
   * actually APPLIED to this row. Stripe does not guarantee webhook delivery
   * order — a stale event (e.g. an old cancellation) arriving after a newer
   * one (e.g. a reactivation) must not overwrite the newer state. null for
   * rows that predate this column, or written only via checkout.session.completed.
   */
  last_event_created_at: number | null;
}

// ─── Price → Tier mapping ──────────────────────────────────────

/**
 * Resolve a Stripe price ID to an AXIS billing tier.
 * Reads from environment variables so values can change without code deploy.
 */
export function priceToTier(priceId: string): BillingTier | null {
  if (
    priceId === process.env.STRIPE_PRICE_ID_STARTER ||
    priceId === process.env.STRIPE_PRICE_ID_STARTER_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_PAID ||
    priceId === process.env.STRIPE_PRICE_ID_PAID_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_PRO ||
    priceId === process.env.STRIPE_PRICE_ID_PRO_ANNUAL
  ) return "paid";
  if (
    priceId === process.env.STRIPE_PRICE_ID_GROWTH ||
    priceId === process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_SUITE
  ) return "suite";
  return null;
}

export function priceToPlanId(priceId: string): StripePlanId | null {
  if (
    priceId === process.env.STRIPE_PRICE_ID_STARTER ||
    priceId === process.env.STRIPE_PRICE_ID_STARTER_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_PAID ||
    priceId === process.env.STRIPE_PRICE_ID_PAID_ANNUAL
  ) return "starter";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO || priceId === process.env.STRIPE_PRICE_ID_PRO_ANNUAL) return "pro";
  if (
    priceId === process.env.STRIPE_PRICE_ID_GROWTH ||
    priceId === process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_SUITE
  ) return "growth";
  return null;
}

// ─── CRUD ───────────────────────────────────────────────────────

export async function upsertSubscription(sub: StripeSubscription): Promise<StripeSubscription> {
  await sql.run(
    `
    INSERT INTO stripe_subscriptions
      (subscription_id, customer_id, account_id, price_id, status,
       current_period_start, current_period_end, card_brand, card_last_four,
       cancel_at, created_at, updated_at, last_event_created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(subscription_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      price_id = excluded.price_id,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      card_brand = excluded.card_brand,
      card_last_four = excluded.card_last_four,
      cancel_at = excluded.cancel_at,
      updated_at = excluded.updated_at,
      -- H2.6: a caller that doesn't track event ordering (checkout.session.completed)
      -- passes null here — COALESCE preserves whatever a subscription.* event
      -- already recorded instead of wiping it out.
      last_event_created_at = COALESCE(excluded.last_event_created_at, stripe_subscriptions.last_event_created_at)
  `,
    [
      sub.subscription_id,
      sub.customer_id,
      sub.account_id,
      sub.price_id,
      sub.status,
      sub.current_period_start,
      sub.current_period_end,
      sub.card_brand,
      sub.card_last_four,
      sub.cancel_at,
      sub.created_at,
      sub.updated_at,
      sub.last_event_created_at,
    ],
  );
  return sub;
}

export async function getSubscription(subscriptionId: string): Promise<StripeSubscription | null> {
  const row = await sql.one<StripeSubscription>(
    "SELECT * FROM stripe_subscriptions WHERE subscription_id = ?",
    [subscriptionId],
  );
  return row ?? null;
}

export async function getSubscriptionByAccount(accountId: string): Promise<StripeSubscription | null> {
  const row = await sql.one<StripeSubscription>(
    "SELECT * FROM stripe_subscriptions WHERE account_id = ? ORDER BY created_at DESC LIMIT 1",
    [accountId],
  );
  return row ?? null;
}

export async function getActiveSubscriptionByAccount(accountId: string): Promise<StripeSubscription | null> {
  const row = await sql.one<StripeSubscription>(
    "SELECT * FROM stripe_subscriptions WHERE account_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
    [accountId],
  );
  return row ?? null;
}

export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: StripeSubscriptionStatus,
): Promise<boolean> {
  const result = await sql.run(
    "UPDATE stripe_subscriptions SET status = ?, updated_at = ? WHERE subscription_id = ?",
    [status, new Date().toISOString(), subscriptionId],
  );
  return result.rowCount > 0;
}

export async function listSubscriptionsByAccount(accountId: string): Promise<StripeSubscription[]> {
  return await sql.many<StripeSubscription>(
    "SELECT * FROM stripe_subscriptions WHERE account_id = ? ORDER BY created_at DESC",
    [accountId],
  );
}

export async function deleteSubscription(subscriptionId: string): Promise<boolean> {
  const result = await sql.run(
    "DELETE FROM stripe_subscriptions WHERE subscription_id = ?",
    [subscriptionId],
  );
  return result.rowCount > 0;
}

/**
 * Check if an account has an active paid subscription via Stripe.
 * Returns the resolved tier or null if no active subscription.
 */
export async function getActiveSubscriptionTier(accountId: string): Promise<BillingTier | null> {
  const sub = await getActiveSubscriptionByAccount(accountId);
  if (!sub) return null;
  return priceToTier(sub.price_id);
}
