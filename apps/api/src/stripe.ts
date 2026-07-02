// ─── Stripe Payment Integration ──────────────────────────────────
//
// Webhook handler (Stripe-Signature verified), checkout URL generator,
// and subscription status/cancel endpoints.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, readBody, sendError } from "./router.js";
import { ErrorCode, log } from "./logger.js";
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

type CheckoutPlanId = "starter" | "pro" | "growth";

function normalizeCheckoutPlanId(raw: unknown): CheckoutPlanId | null {
  if (raw === "starter" || raw === "pro" || raw === "growth") return raw;
  if (raw === "paid") return "starter";
  if (raw === "suite") return "growth";
  return null;
}

/**
 * Extract the bare Stripe price id, tolerating a value pasted with a trailing
 * label (e.g. `price_1Tk… (monthly $29.00)` → `price_1Tk…`). Guards against the
 * common dashboard copy-paste that makes Stripe return "No such price".
 */
export function cleanPriceId(value: string | undefined): string | undefined {
  if (!value) return value;
  // The id is the first whitespace-delimited token; a pasted "(monthly $29.00)"
  // label (always space-separated) is dropped. Underscores in the id are preserved.
  return value.trim().split(/\s+/)[0] || value.trim();
}

function resolveCheckoutPriceId(planId: CheckoutPlanId, billingCycle: "monthly" | "annual"): string | undefined {
  switch (planId) {
    case "starter":
      return cleanPriceId(billingCycle === "annual"
        ? process.env.STRIPE_PRICE_ID_STARTER_ANNUAL ?? process.env.STRIPE_PRICE_ID_PAID_ANNUAL
        : process.env.STRIPE_PRICE_ID_STARTER ?? process.env.STRIPE_PRICE_ID_PAID);
    case "pro":
      return cleanPriceId(billingCycle === "annual"
        ? process.env.STRIPE_PRICE_ID_PRO_ANNUAL
        : process.env.STRIPE_PRICE_ID_PRO);
    case "growth":
      return cleanPriceId(billingCycle === "annual"
        ? process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL ?? process.env.STRIPE_PRICE_ID_SUITE
        : process.env.STRIPE_PRICE_ID_GROWTH ?? process.env.STRIPE_PRICE_ID_SUITE);
  }
}

function resolvePlanNameFromPriceId(priceId: string): string | null {
  if (
    priceId === process.env.STRIPE_PRICE_ID_STARTER ||
    priceId === process.env.STRIPE_PRICE_ID_STARTER_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_PAID ||
    priceId === process.env.STRIPE_PRICE_ID_PAID_ANNUAL
  ) return "Starter";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO || priceId === process.env.STRIPE_PRICE_ID_PRO_ANNUAL) return "Pro";
  if (
    priceId === process.env.STRIPE_PRICE_ID_GROWTH ||
    priceId === process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL ||
    priceId === process.env.STRIPE_PRICE_ID_SUITE
  ) return "Growth";
  return null;
}

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

function parseStripeErrorBody(raw: string): {
  message?: string;
  param?: string;
  request_log_url?: string;
  type?: string;
} {
  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: string;
        param?: string;
        request_log_url?: string;
        type?: string;
      };
    };
    return parsed.error ?? {};
  } catch {
    return {};
  }
}

function resolveCheckoutBaseUrl(req?: IncomingMessage): string {
  const candidates = [
    process.env.AXIS_WEB_URL,
    process.env.CORS_ORIGIN,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "*") continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // ignore invalid candidate
    }
  }

  // In production, default to the known web frontend rather than the API host.
  if (process.env.NODE_ENV === "production") {
    return "https://iliad.trustfabric.ai";
  }

  return "http://localhost:5173";
}

// ─── Sync tier from subscription status ────────────────────────

async function syncTierFromStripeSubscription(
  accountId: string,
  priceId: string,
  status: StripeSubscriptionStatus,
): Promise<void> {
  const account = await getAccount(accountId);
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

  await updateAccountTier(accountId, newTier);
  await logTierChange(accountId, previousTier, newTier, "stripe_webhook", { status });
  await trackEvent(
    accountId,
    newTier === "free" ? "downgrade_completed" : "upgrade_completed",
    newTier === "free" ? "signup" : "conversion",
    { from_tier: previousTier, to_tier: newTier, source: "stripe" },
  );

  if (newTier !== "free") {
    const planName = resolvePlanNameFromPriceId(priceId) ?? (newTier === "suite" ? "Growth" : "Starter");
    const limits: Record<string, { snaps: string; projects: string; programs: string }> = {
      Starter: { snaps: "200", projects: "20", programs: "19" },
      Pro: { snaps: "200", projects: "20", programs: "19" },
      Growth: { snaps: "Unlimited", projects: "Unlimited", programs: "19" },
    };
    /* v8 ignore next */
    const l = limits[planName] ?? limits.Starter;
    /* v8 ignore next 3 */
    sendUpgradeConfirmation(account.email, account.name, planName, l.snaps, l.projects, l.programs).catch((err: unknown) => {
      log("warn", "upgrade-confirmation-email-failed", { account_id: accountId, error: err instanceof Error ? err.message : String(err) });
    });
  }
}

// ─── Handle checkout.session.completed ─────────────────────────

async function handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const meta = session.metadata as Record<string, unknown> | null;
  const accountId = (session.client_reference_id ?? meta?.account_id) as string | undefined;
  if (!accountId) return;

  const subscriptionId = session.subscription as string | undefined;
  const customerId = session.customer as string | undefined;
  if (!subscriptionId || !customerId) return;

  const billingCycle = meta?.billing_cycle === "annual" ? "annual" : "monthly";
  const planId = normalizeCheckoutPlanId(meta?.plan_id ?? meta?.tier);
  const priceId = planId ? (resolveCheckoutPriceId(planId, billingCycle) ?? "") : "";

  const now = new Date().toISOString();
  const existing = await getSubscription(subscriptionId);
  await upsertSubscription({
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
    await syncTierFromStripeSubscription(accountId, priceId, "active");
  }
}

// ─── Handle customer.subscription.* ────────────────────────────

async function handleSubscriptionEvent(
  sub: Record<string, unknown>,
  isDeleted: boolean,
): Promise<boolean> {
  const subscriptionId = sub.id as string;
  const customerId = sub.customer as string;
  const status = (isDeleted ? "canceled" : sub.status) as StripeSubscriptionStatus;

  const items = sub.items as { data: Array<{ price: { id: string } }> } | undefined;
  const priceId = items?.data?.[0]?.price?.id ?? "";

  // Resolve account_id: 1) from existing DB record, 2) from subscription metadata
  let accountId: string | undefined;
  const existing = await getSubscription(subscriptionId);
  if (existing) {
    accountId = existing.account_id;
  } else {
    accountId = ((sub.metadata as Record<string, unknown> | null)?.account_id) as string | undefined;
  }
  if (!accountId) return false;

  const now = new Date().toISOString();
  await upsertSubscription({
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

  await syncTierFromStripeSubscription(accountId, priceId, status);
  return true;
}

// ─── Handle invoice.payment_failed ─────────────────────────────

async function handleInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
  const subscriptionId = invoice.subscription as string | undefined;
  if (!subscriptionId) return;
  // Mark as past_due — Stripe will retry, we don't downgrade yet
  await updateSubscriptionStatus(subscriptionId, "past_due");
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
    await handleCheckoutCompleted(obj);
    subscriptionId = obj.subscription as string | undefined;
  } else if (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated"
  ) {
    handled = await handleSubscriptionEvent(obj, false);
    subscriptionId = obj.id as string;
  } else if (eventType === "customer.subscription.deleted") {
    handled = await handleSubscriptionEvent(obj, true);
    subscriptionId = obj.id as string;
  /* v8 ignore next */
  } else {
    // invoice.payment_failed (only remaining HANDLED_EVENT after the above checks)
    await handleInvoicePaymentFailed(obj);
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
  const ctx = await requireAuth(req, res);
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

  const planId = normalizeCheckoutPlanId(body.plan_id ?? body.tier);
  if (!planId) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "plan_id must be starter, pro, or growth");
    return;
  }

  const billingCycleRaw = body.billing_cycle;
  if (billingCycleRaw !== undefined && billingCycleRaw !== "monthly" && billingCycleRaw !== "annual") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "billing_cycle must be monthly or annual");
    return;
  }

  const billingCycle = billingCycleRaw === "annual" ? "annual" : "monthly";

  const priceId = resolveCheckoutPriceId(planId, billingCycle);

  if (!priceId) {
    const priceLabel = `${planId} ${billingCycle}`;
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, `No Stripe price ID configured for ${priceLabel} tier`);
    return;
  }

  // Check if account already has an active subscription
  const existingSub = await getActiveSubscriptionByAccount(ctx.account!.account_id);
  if (existingSub) {
    sendError(res, 409, ErrorCode.CONFLICT, "Account already has an active subscription. Use the customer portal to manage it.");
    return;
  }

  // Determine redirect URLs
  const webUrl = resolveCheckoutBaseUrl(req);
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
  params.append("metadata[plan_id]", planId);
  params.append("metadata[tier]", planId === "growth" ? "suite" : "paid");
  params.append("metadata[billing_cycle]", billingCycle);
  params.append("subscription_data[metadata][account_id]", ctx.account!.account_id);
  params.append("subscription_data[metadata][plan_id]", planId);
  params.append("subscription_data[metadata][tier]", planId === "growth" ? "suite" : "paid");
  params.append("subscription_data[metadata][billing_cycle]", billingCycle);

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
      const stripeErr = parseStripeErrorBody(errBody);
      const msg = (stripeErr.message ?? "").toLowerCase();

      // Stripe catalog misconfiguration: price exists but linked product is inactive.
      if (msg.includes("not available to be purchased") || msg.includes("product is not active")) {
        sendError(
          res,
          503,
          ErrorCode.UPSTREAM_ERROR,
          `Stripe price is not purchasable for ${planId} plan. Activate the product in Stripe or update the matching STRIPE_PRICE_ID_* env var.`,
          {
            stripe_error: errBody.slice(0, 1200),
            stripe_error_message: stripeErr.message,
            stripe_error_param: stripeErr.param,
            stripe_request_log_url: stripeErr.request_log_url,
            configured_price_id: priceId,
            configured_price_env: `STRIPE_PRICE_ID_${planId.toUpperCase()}`,
            success_url: successUrl,
            cancel_url: cancelUrl,
          },
        );
        return;
      }

      sendError(
        res,
        502,
        ErrorCode.UPSTREAM_ERROR,
        `Stripe API error: ${response.status}`,
        {
          stripe_error: errBody.slice(0, 1200),
          stripe_error_message: stripeErr.message,
          stripe_error_param: stripeErr.param,
          stripe_request_log_url: stripeErr.request_log_url,
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      );
      return;
    }

    const session = await response.json() as { id: string; url: string };

    await trackEvent(ctx.account!.account_id, "checkout_started", "conversion", {
      plan_id: planId,
      tier: planId === "growth" ? "suite" : "paid",
      billing_cycle: billingCycle,
      source: "stripe",
    });

    sendJSON(res, 201, {
      checkout_url: session.url,
      plan_id: planId,
      tier: planId === "growth" ? "suite" : "paid",
      billing_cycle: billingCycle,
      price_id: priceId,
      variant_id: priceId, // backward-compat for older web clients
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
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const subscriptions = await listSubscriptionsByAccount(ctx.account!.account_id);
  const active = await getActiveSubscriptionByAccount(ctx.account!.account_id);

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    tier: ctx.account!.tier,
    has_active_subscription: active !== null,
    active_subscription: active
      ? {
          subscription_id: active.subscription_id,
          status: active.status,
          price_id: active.price_id,
          variant_id: active.price_id, // backward-compat for older web clients
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
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const active = await getActiveSubscriptionByAccount(ctx.account!.account_id);
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
    await trackEvent(ctx.account!.account_id, "cancellation_requested", "conversion", {
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
