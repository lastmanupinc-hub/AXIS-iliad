// ─── Stripe Payment Integration ──────────────────────────────────
//
// Webhook handler (Stripe-Signature verified), checkout URL generator,
// and subscription status/cancel endpoints.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, readBody, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import { requireAuth } from "./billing.js";
import {
  upsertSubscription,
  getSubscription,
  getActiveSubscriptionByAccount,
  listSubscriptionsByAccount,
  updateSubscriptionStatus,
  priceToTier,
  updateAccountTier,
  logTierChange,
  trackEvent,
  getAccount,
  sendUpgradeConfirmation,
  type StripeSubscriptionStatus,
} from "@axis/snapshots";

// ─── Webhook signature verification ────────────────────────────
//
// Stripe format: "Stripe-Signature: t=<timestamp>,v1=<hmac>"
// Expected HMAC: SHA-256 of "{timestamp}.{rawBody}"

function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | undefined,
  secret: string,
): boolean {
  if (!sigHeader) return false;

  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(",")) {
    const idx = piece.indexOf("=");
    if (idx > 0) parts[piece.slice(0, idx)] = piece.slice(idx + 1);
  }

  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  // Reject if older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ─── Webhook event types we handle ─────────────────────────────

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

// ─── Convert Unix timestamp to ISO string ──────────────────────

function tsToISO(ts: unknown): string | null {
  if (typeof ts !== "number" || ts === 0) return null;
  return new Date(ts * 1000).toISOString();
}

// ─── Sync tier from subscription status ────────────────────────

function syncTierFromStripeSubscription(
  accountId: string,
  priceId: string,
  status: StripeSubscriptionStatus,
): void {
  const account = getAccount(accountId);
  if (!account) return;

  const previousTier = account.tier;
  let newTier = priceToTier(priceId);

  // Downgrade to free on terminal/delinquent states
  if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    newTier = "free";
  }

  // past_due, incomplete, paused → keep current tier (Stripe will retry)
  if (status === "past_due" || status === "incomplete" || status === "paused") return;

  if (!newTier || newTier === previousTier) return;

  updateAccountTier(accountId, newTier);
  logTierChange(accountId, previousTier, newTier, "stripe_webhook", { status });
  trackEvent(
    accountId,
    newTier === "free" ? "downgrade_completed" : "upgrade_completed",
    newTier === "free" ? "signup" : "conversion",
    { from_tier: previousTier, to_tier: newTier, source: "stripe" },
  );

  if (newTier !== "free") {
    const tierNames: Record<string, string> = { paid: "Pro", suite: "Enterprise Suite" };
    const limits: Record<string, { snaps: string; projects: string; programs: string }> = {
      paid: { snaps: "200", projects: "20", programs: "17" },
      suite: { snaps: "Unlimited", projects: "Unlimited", programs: "17" },
    };
    /* v8 ignore next */
    const l = limits[newTier] ?? limits.paid;
    /* v8 ignore next */
    sendUpgradeConfirmation(account.email, account.name, tierNames[newTier] ?? newTier, l.snaps, l.projects, l.programs).catch(() => {});
  }
}

// ─── Handle checkout.session.completed ─────────────────────────

function handleCheckoutCompleted(session: Record<string, unknown>): void {
  const meta = session.metadata as Record<string, unknown> | null;
  const accountId = (session.client_reference_id ?? meta?.account_id) as string | undefined;
  if (!accountId) return;

  const subscriptionId = session.subscription as string | undefined;
  const customerId = session.customer as string | undefined;
  if (!subscriptionId || !customerId) return;

  const tier = (meta?.tier ?? "") as string;
  const priceId = tier === "paid"
    ? (process.env.STRIPE_PRICE_ID_PAID ?? "")
    : tier === "suite"
      ? (process.env.STRIPE_PRICE_ID_SUITE ?? "")
      : "";

  const now = new Date().toISOString();
  const existing = getSubscription(subscriptionId);
  upsertSubscription({
    subscription_id: subscriptionId,
    customer_id: customerId,
    account_id: accountId,
    price_id: priceId,
    status: "active",
    current_period_start: null,
    current_period_end: null,
    card_brand: null,
    card_last_four: null,
    cancel_at: null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  if (priceId) {
    syncTierFromStripeSubscription(accountId, priceId, "active");
  }
}

// ─── Handle customer.subscription.* ────────────────────────────

function handleSubscriptionEvent(
  sub: Record<string, unknown>,
  isDeleted: boolean,
): boolean {
  const subscriptionId = sub.id as string;
  const customerId = sub.customer as string;
  const status = (isDeleted ? "canceled" : sub.status) as StripeSubscriptionStatus;

  const items = sub.items as { data: Array<{ price: { id: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id ?? "";

  // Resolve account_id: 1) from existing DB record, 2) from subscription metadata
  let accountId: string | undefined;
  const existing = getSubscription(subscriptionId);
  if (existing) {
    accountId = existing.account_id;
  } else {
    accountId = ((sub.metadata as Record<string, unknown> | null)?.account_id) as string | undefined;
  }
  if (!accountId) return false;

  const now = new Date().toISOString();
  upsertSubscription({
    subscription_id: subscriptionId,
    customer_id: customerId,
    account_id: accountId,
    price_id: priceId,
    status,
    current_period_start: tsToISO(sub.current_period_start),
    current_period_end: tsToISO(sub.current_period_end),
    card_brand: null,
    card_last_four: null,
    cancel_at: tsToISO(sub.cancel_at),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  syncTierFromStripeSubscription(accountId, priceId, status);
  return true;
}

// ─── Handle invoice.payment_failed ─────────────────────────────

function handleInvoicePaymentFailed(invoice: Record<string, unknown>): void {
  const subscriptionId = invoice.subscription as string | undefined;
  if (!subscriptionId) return;
  // Mark as past_due — Stripe will retry, we don't downgrade yet
  updateSubscriptionStatus(subscriptionId, "past_due");
}

// ─── POST /v1/webhooks/stripe ───────────────────────────────────

export async function handleStripeWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Stripe webhook secret not configured");
    return;
  }

  const rawBody = await readBody(req);
  const sigHeader = req.headers["stripe-signature"] as string | undefined;

  if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Invalid webhook signature");
    return;
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const eventType = event.type;
  if (!eventType || !HANDLED_EVENTS.has(eventType)) {
    sendJSON(res, 200, { received: true, event: eventType, handled: false });
    return;
  }

  const obj = event.data.object;
  let handled = true;
  let subscriptionId: string | undefined;

  if (eventType === "checkout.session.completed") {
    handleCheckoutCompleted(obj);
    subscriptionId = obj.subscription as string | undefined;
  } else if (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated"
  ) {
    handled = handleSubscriptionEvent(obj, false);
    subscriptionId = obj.id as string;
  } else if (eventType === "customer.subscription.deleted") {
    handled = handleSubscriptionEvent(obj, true);
    subscriptionId = obj.id as string;
  /* v8 ignore next */
  } else {
    // invoice.payment_failed (only remaining HANDLED_EVENT after the above checks)
    handleInvoicePaymentFailed(obj);
    subscriptionId = obj.subscription as string | undefined;
  }

  sendJSON(res, 200, {
    received: true,
    event: eventType,
    subscription_id: subscriptionId,
    handled,
  });
}

// ─── POST /v1/checkout ──────────────────────────────────────────

export async function handleCreateCheckout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Stripe not configured");
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const tier = body.tier as string | undefined;
  if (!tier || !["paid", "suite"].includes(tier)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "tier must be paid or suite");
    return;
  }

  const priceId = tier === "paid"
    ? process.env.STRIPE_PRICE_ID_PAID
    : process.env.STRIPE_PRICE_ID_SUITE;

  if (!priceId) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, `No Stripe price ID configured for ${tier} tier`);
    return;
  }

  // Check if account already has an active subscription
  const existingSub = getActiveSubscriptionByAccount(ctx.account!.account_id);
  if (existingSub) {
    sendError(res, 409, ErrorCode.CONFLICT, "Account already has an active subscription. Use the customer portal to manage it.");
    return;
  }

  // Determine redirect URLs
  const webUrl = process.env.CORS_ORIGIN || "http://localhost:5173";
  const successUrl = `${webUrl}/#account`;
  const cancelUrl = `${webUrl}/#plans`;

  // Build Stripe Checkout Session
  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("line_items[0][price]", priceId);
  params.append("line_items[0][quantity]", "1");
  params.append("success_url", successUrl);
  params.append("cancel_url", cancelUrl);
  params.append("client_reference_id", ctx.account!.account_id);
  if (ctx.account!.email) {
    params.append("customer_email", ctx.account!.email);
  }
  params.append("metadata[account_id]", ctx.account!.account_id);
  params.append("metadata[tier]", tier);
  params.append("subscription_data[metadata][account_id]", ctx.account!.account_id);
  params.append("subscription_data[metadata][tier]", tier);

  try {
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text();
      sendError(res, 502, ErrorCode.INTERNAL_ERROR, `Stripe API error: ${response.status}`);
      return;
    }

    const session = await response.json() as { id: string; url: string };

    trackEvent(ctx.account!.account_id, "checkout_started", "conversion", { tier, source: "stripe" });

    sendJSON(res, 201, {
      checkout_url: session.url,
      tier,
      session_id: session.id,
    });
  } catch (err) {
    sendError(res, 502, ErrorCode.INTERNAL_ERROR, `Failed to create checkout: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── GET /v1/account/subscription ──────────────────────────────

export async function handleGetSubscription(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const subscriptions = listSubscriptionsByAccount(ctx.account!.account_id);
  const active = getActiveSubscriptionByAccount(ctx.account!.account_id);

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    tier: ctx.account!.tier,
    has_active_subscription: active !== null,
    active_subscription: active
      ? {
          subscription_id: active.subscription_id,
          status: active.status,
          price_id: active.price_id,
          current_period_start: active.current_period_start,
          current_period_end: active.current_period_end,
          card_brand: active.card_brand,
          card_last_four: active.card_last_four,
          cancel_at: active.cancel_at,
        }
      : null,
    subscription_count: subscriptions.length,
  });
}

// ─── POST /v1/account/subscription/cancel ──────────────────────

export async function handleCancelSubscription(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const active = getActiveSubscriptionByAccount(ctx.account!.account_id);
  if (!active) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No active subscription to cancel");
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Stripe not configured");
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append("cancel_at_period_end", "true");

    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions/${active.subscription_id}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );

    if (!response.ok) {
      sendError(res, 502, ErrorCode.INTERNAL_ERROR, `Stripe API error: ${response.status}`);
      return;
    }

    // The actual tier change will happen via webhook when Stripe confirms cancellation
    trackEvent(ctx.account!.account_id, "cancellation_requested", "conversion", {
      subscription_id: active.subscription_id,
      source: "stripe",
    });

    sendJSON(res, 200, {
      subscription_id: active.subscription_id,
      status: "cancellation_requested",
      message: "Subscription will be cancelled at the end of the current billing period.",
    });
  } catch (err) {
    sendError(res, 502, ErrorCode.INTERNAL_ERROR, `Failed to cancel subscription: ${err instanceof Error ? err.message : String(err)}`);
  }
}
