// ─── Stripe Subscription Store ─────────────────────────────────
//
// CRUD for Stripe subscriptions linked to AXIS accounts.
// Used by the webhook handler and checkout flow.

import { getDb } from "./db.js";
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

export function upsertSubscription(sub: StripeSubscription): StripeSubscription {
  const db = getDb();
  db.prepare(`
    INSERT INTO stripe_subscriptions
      (subscription_id, customer_id, account_id, price_id, status,
       current_period_start, current_period_end, card_brand, card_last_four,
       cancel_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(subscription_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      price_id = excluded.price_id,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      card_brand = excluded.card_brand,
      card_last_four = excluded.card_last_four,
      cancel_at = excluded.cancel_at,
      updated_at = excluded.updated_at
  `).run(
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
  );
  return sub;
}

export function getSubscription(subscriptionId: string): StripeSubscription | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM stripe_subscriptions WHERE subscription_id = ?",
  ).get(subscriptionId) as StripeSubscription | undefined;
  return row ?? null;
}

export function getSubscriptionByAccount(accountId: string): StripeSubscription | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM stripe_subscriptions WHERE account_id = ? ORDER BY created_at DESC LIMIT 1",
  ).get(accountId) as StripeSubscription | undefined;
  return row ?? null;
}

export function getActiveSubscriptionByAccount(accountId: string): StripeSubscription | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM stripe_subscriptions WHERE account_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
  ).get(accountId) as StripeSubscription | undefined;
  return row ?? null;
}

export function updateSubscriptionStatus(
  subscriptionId: string,
  status: StripeSubscriptionStatus,
): boolean {
  const db = getDb();
  const result = db.prepare(
    "UPDATE stripe_subscriptions SET status = ?, updated_at = ? WHERE subscription_id = ?",
  ).run(status, new Date().toISOString(), subscriptionId);
  return result.changes > 0;
}

export function listSubscriptionsByAccount(accountId: string): StripeSubscription[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM stripe_subscriptions WHERE account_id = ? ORDER BY created_at DESC",
  ).all(accountId) as StripeSubscription[];
}

export function deleteSubscription(subscriptionId: string): boolean {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM stripe_subscriptions WHERE subscription_id = ?",
  ).run(subscriptionId);
  return result.changes > 0;
}

/**
 * Check if an account has an active paid subscription via Stripe.
 * Returns the resolved tier or null if no active subscription.
 */
export function getActiveSubscriptionTier(accountId: string): BillingTier | null {
  const sub = getActiveSubscriptionByAccount(accountId);
  if (!sub) return null;
  return priceToTier(sub.price_id);
}
