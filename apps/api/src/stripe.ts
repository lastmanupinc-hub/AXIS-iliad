// ─── Stripe Payment Integration ──────────────────────────────────
//
// Webhook handler (Stripe-Signature verified), checkout URL generator,
// and subscription status/cancel endpoints.

import { createHmac, timingSafeEqual } from "node:crypto";

// H0.4: every outbound Stripe call pins the API version. Unpinned calls float
// on the ACCOUNT default and silently change shape when that default moves;
// this module reads dahlia-era payload shapes (item-level subscription
// periods, invoice parent.subscription_details), so the pin and the reads
// must move together. Webhook payloads are NOT governed by this header (they
// follow the webhook endpoint's configured version) — the webhook handlers
// therefore dual-read new-then-legacy shapes.
const STRIPE_API_VERSION = "2026-06-24.dahlia";
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
  priceToPlanId,
  updateAccountTier,
  updateAccountPaidPlanId,
  logTierChange,
  trackEvent,
  getAccount,
  sendUpgradeConfirmation,
  type StripeSubscriptionStatus,
} from "@axis/snapshots";
import { checkoutIdempotencyKey } from "./paid-client.js";
import { PROGRAM_COUNT } from "./counts.js";
import {
  handleDisputeCreated,
  handleDisputeUpdated,
  handleDisputeClosed,
  handleEarlyFraudWarning,
} from "./disputes.js";

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
  // Dispute lifecycle (WO-08) — handlers live in disputes.ts.
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "radar.early_fraud_warning.created",
  // H-Phase-A cycle 8: a refund used to be a silent 200 no-op (event type
  // not in this set) — nothing in this system's own database ever learned
  // a refund happened, for either a subscription payment or a one-shot
  // credit-pack top-up. See handleChargeRefunded's own comment for scope.
  "charge.refunded",
]);

// ─── Convert Unix timestamp to ISO string ──────────────────────

function tsToISO(ts: unknown): string | null {
  if (typeof ts !== "number" || ts === 0) return null;
  return new Date(ts * 1000).toISOString();
}

// H-Phase-A cycle 11: resolveCheckoutBaseUrl (the redirect-URL helper for the
// removed legacy Stripe-direct checkout below) was deleted along with
// handleCreateCheckout — it had no other caller.

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

  if (!newTier) return;

  // H-Phase-A cycle 3: Starter and Pro both collapse into newTier==='paid',
  // so a same-tier plan switch (e.g. Starter -> Pro) used to hit the early
  // return below and never reach updateAccountPaidPlanId — the exact
  // "money-math-without-paid_plan_id" gap cycles 1-2 fixed downstream, but
  // at its SOURCE here. Still skip the tier-transition machinery (tier
  // write, audit log, upgrade email) below since the coarse tier itself
  // didn't move.
  if (newTier === previousTier) {
    await updateAccountPaidPlanId(accountId, priceToPlanId(priceId));
    return;
  }

  await updateAccountTier(accountId, newTier);
  // logTierChange reads the account's CURRENT paid_plan_id (still the OLD
  // plan at this point) to price the "from" side of the proration it logs —
  // must run before updateAccountPaidPlanId below, mirroring paid-handlers.ts's
  // established ordering (H-Phase-A cycle 2).
  await logTierChange(accountId, previousTier, newTier, "stripe_webhook", { status });
  // Starter/Pro both collapse into newTier==='paid' — persist the specific
  // plan so resolvePlanForAccount can tell them apart, same as the PAI'D
  // checkout webhook (H-Phase-A cycle 1). This path predates PAI'D and the
  // live web UI never reaches it (PAI'D is the only checkout it calls), but
  // it's still a live, tested route (POST /v1/checkout + this webhook) any
  // direct API caller or pre-PAI'D legacy subscriber can hit — without this,
  // an account tier-synced here would silently fall back to Starter's
  // allowance even if actually paying Pro.
  await updateAccountPaidPlanId(accountId, newTier === "free" ? null : priceToPlanId(priceId));
  await trackEvent(
    accountId,
    newTier === "free" ? "downgrade_completed" : "upgrade_completed",
    newTier === "free" ? "signup" : "conversion",
    { from_tier: previousTier, to_tier: newTier, source: "stripe" },
  );

  if (newTier !== "free") {
    const planName = resolvePlanNameFromPriceId(priceId) ?? (newTier === "suite" ? "Growth" : "Starter");
    // H-Phase-A cycle 11: programs was a hand-typed "19", stale against the
    // real, CI-guarded PROGRAM_COUNT (20) — the same hand-duplicated-count
    // drift shape this loop has fixed in a new location almost every cycle.
    const programs = String(PROGRAM_COUNT);
    const limits: Record<string, { snaps: string; projects: string; programs: string }> = {
      Starter: { snaps: "200", projects: "20", programs },
      Pro: { snaps: "200", projects: "20", programs },
      Growth: { snaps: "Unlimited", projects: "Unlimited", programs },
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

/** H8.1b: per-attempt wall-clock cap inside fetchSubscriptionPriceId's retry loop below — the loop itself only bounds attempt COUNT, not per-attempt time. */
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 10_000;

/**
 * H0.5: the price the customer ACTUALLY bought lives on their Stripe
 * subscription — fetch it (pinned API version) instead of trusting what the
 * env maps the plan to at webhook time. Returns null when every attempt
 * fails (no key, network, non-2xx, unexpected shape): the webhook must never
 * bounce on this, it just degrades to the caller's fallback.
 *
 * H2.6 (red-team fix, WAVE-0 finding #6): a SINGLE attempt meant any
 * transient hiccup (the exact moment this fetch races a network blip) fell
 * back to the env-derived price — silently reintroducing the precise bug
 * H0.5 exists to close, if a price rotation happened to coincide with that
 * hiccup. 2 retries with a short backoff absorb the common transient case;
 * the caller (handleCheckoutCompleted) additionally never trusts env over a
 * KNOWN existing value when every attempt here still fails.
 */
async function fetchSubscriptionPriceId(subscriptionId: string, attempts = 3): Promise<string | null> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // H8.1b: fresh controller/timer per attempt — each attempt gets its own
    // SUBSCRIPTION_FETCH_TIMEOUT_MS budget (the retry loop only bounds
    // attempt COUNT, not per-attempt wall time).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBSCRIPTION_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
        },
        signal: controller.signal,
      });
      if (response.ok) {
        const sub = (await response.json()) as { items?: { data?: Array<{ price?: { id?: string } }> } };
        return sub.items?.data?.[0]?.price?.id ?? null;
      }
    } catch {
      // fall through to retry/give-up below — also catches a per-attempt
      // timeout abort (AbortError), which behaves identically to any other
      // transport failure at this attempt.
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
  return null;
}

async function handleCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
  const meta = session.metadata as Record<string, unknown> | null;
  const accountId = (session.client_reference_id ?? meta?.account_id) as string | undefined;
  if (!accountId) return;

  const subscriptionId = session.subscription as string | undefined;
  const customerId = session.customer as string | undefined;
  if (!subscriptionId || !customerId) return;

  const billingCycle = meta?.billing_cycle === "annual" ? "annual" : "monthly";
  const planId = normalizeCheckoutPlanId(meta?.plan_id ?? meta?.tier);
  const envPriceId = planId ? (resolveCheckoutPriceId(planId, billingCycle) ?? "") : "";
  const now = new Date().toISOString();
  const existing = await getSubscription(subscriptionId);
  // Truth first (what they bought — now retried, see fetchSubscriptionPriceId).
  const truePriceId = await fetchSubscriptionPriceId(subscriptionId);
  let priceId: string;
  if (truePriceId) {
    priceId = truePriceId;
  } else if (existing?.price_id) {
    // H2.6 (red-team fix, WAVE-0 finding #6): every truth-fetch attempt
    // failed — do NOT silently trust env over a price we've already
    // CONFIRMED for this exact subscription on a prior event. A price
    // rotation coinciding with this exact fetch failing would otherwise
    // silently rewrite a known-correct value with an unconfirmed guess.
    priceId = existing.price_id;
    log("warn", "checkout_price_truth_fetch_failed_kept_existing", { subscriptionId, existingPriceId: existing.price_id });
  } else {
    // First time seeing this subscription AND every truth-fetch attempt
    // failed — no historical value to fall back to. The env-derived price is
    // the best available signal, but this is now UNCONFIRMED, not silent:
    // logged loudly so it can be reconciled against Stripe directly.
    priceId = envPriceId;
    log("error", "checkout_price_unconfirmed", { subscriptionId, accountId, envPriceId });
  }
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
    // H2.6: checkout.session.completed doesn't track event ordering — null
    // here means upsertSubscription's COALESCE preserves whatever a
    // subscription.* event already recorded, rather than wiping it out.
    last_event_created_at: existing?.last_event_created_at ?? null,
  });

  if (priceId) {
    // Tier maps by env comparison (priceToTier) — if the TRUE price rotated
    // out of the env map, fall back to the plan-intent env price so a paying
    // customer is never left un-upgraded. The record above still holds truth.
    const tierPriceId = priceToTier(priceId) ? priceId : envPriceId;
    if (tierPriceId) await syncTierFromStripeSubscription(accountId, tierPriceId, "active");
  }
}

// ─── Handle customer.subscription.* ────────────────────────────

async function handleSubscriptionEvent(
  sub: Record<string, unknown>,
  isDeleted: boolean,
  eventCreated?: number,
): Promise<boolean> {
  const subscriptionId = sub.id as string;
  const customerId = sub.customer as string;
  const status = (isDeleted ? "canceled" : sub.status) as StripeSubscriptionStatus;

  const items = sub.items as { data: Array<{ price: { id: string }; current_period_start?: number; current_period_end?: number }> } | undefined;
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

  // H2.6 (red-team fix, WAVE-0 finding #7): Stripe does not guarantee webhook
  // delivery order. A stale event (e.g. an old cancellation redelivered late)
  // arriving after a newer one (e.g. a reactivation) must not overwrite the
  // newer state — <= (not <) so an exact replay of an already-applied event
  // is also correctly a no-op, not a re-application.
  if (eventCreated !== undefined && existing?.last_event_created_at != null && eventCreated <= existing.last_event_created_at) {
    log("warn", "stripe_stale_subscription_event_ignored", {
      subscriptionId,
      eventCreated,
      lastProcessed: existing.last_event_created_at,
      isDeleted,
    });
    return true; // acknowledge the webhook (200) so Stripe stops retrying — just don't apply stale state
  }

  const now = new Date().toISOString();
  await upsertSubscription({
    subscription_id: subscriptionId,
    customer_id: customerId,
    account_id: accountId,
    price_id: priceId,
    status,
    // Basil+ (2025-03-31 onward) moved the period bounds onto the subscription
    // ITEMS; older webhook-endpoint versions still send them top-level. Webhook
    // shape follows the ENDPOINT's configured version, so dual-read new-first.
    current_period_start: tsToISO(items?.data?.[0]?.current_period_start ?? sub.current_period_start),
    current_period_end: tsToISO(items?.data?.[0]?.current_period_end ?? sub.current_period_end),
    card_brand: null,
    card_last_four: null,
    cancel_at: tsToISO(sub.cancel_at),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    last_event_created_at: eventCreated ?? existing?.last_event_created_at ?? null,
  });

  await syncTierFromStripeSubscription(accountId, priceId, status);
  return true;
}

// ─── Handle invoice.payment_failed ─────────────────────────────

// H-Phase-A cycle 8: this system has no automatic refund reconciliation —
// a refunded customer keeps whatever tier/persistence-credits/PAI'D-granted
// balance they already had, indefinitely. Deciding HOW to reconcile a
// refund (revoke consumed credits? downgrade mid-cycle? handle a partial
// refund differently from a full one?) is a genuine product/policy
// decision this loop can't make unilaterally — correctly out of scope here.
// This makes a refund OBSERVABLE instead of a silent no-op: a structured
// log line an operator can alert on or grep for, using only the fields a
// charge.refunded event actually and reliably carries (no DB lookup that
// could itself fail or resolve to the wrong account).
async function handleChargeRefunded(charge: Record<string, unknown>): Promise<void> {
  log("warn", "stripe_charge_refunded", {
    charge_id: charge.id,
    payment_intent: charge.payment_intent,
    customer: charge.customer,
    amount_refunded: charge.amount_refunded,
    currency: charge.currency,
    refunded: charge.refunded,
  });
}

async function handleInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
  // Basil+ moved the invoice's subscription reference under
  // parent.subscription_details; legacy webhook-endpoint versions still send
  // it top-level. Dual-read new-first (same rationale as the period bounds).
  const parent = invoice.parent as { subscription_details?: { subscription?: string } } | undefined;
  const subscriptionId = (parent?.subscription_details?.subscription ?? invoice.subscription) as string | undefined;
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

  let event: { type: string; created?: number; data: { object: Record<string, unknown> } };
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
    handled = await handleSubscriptionEvent(obj, false, event.created);
    subscriptionId = obj.id as string;
  } else if (eventType === "customer.subscription.deleted") {
    handled = await handleSubscriptionEvent(obj, true, event.created);
    subscriptionId = obj.id as string;
  } else if (eventType === "charge.dispute.created") {
    await handleDisputeCreated(obj);
  } else if (eventType === "charge.dispute.updated") {
    await handleDisputeUpdated(obj);
  } else if (eventType === "charge.dispute.closed") {
    await handleDisputeClosed(obj);
  } else if (eventType === "radar.early_fraud_warning.created") {
    await handleEarlyFraudWarning(obj);
  } else if (eventType === "charge.refunded") {
    await handleChargeRefunded(obj);
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

// H-Phase-A cycle 11 [SECURITY/COMPLIANCE]: handleCreateCheckout (POST
// /v1/checkout — a Stripe-direct, subscription-mode checkout session
// creator) was removed. Rule 7 of this loop's own constitution says PAI'D is
// the ONLY checkout and to never resurrect this endpoint; it had been left
// registered and fully functional, gated only by whether the
// STRIPE_PRICE_ID_* env vars happened to be unset in prod — i.e. an operator
// following STRIPE_CHANGES_REQUIRED.md's own instructions would have
// silently reactivated real recurring Stripe billing, contradicting every
// "$99 once, not a subscription" claim this codebase makes elsewhere.
// normalizeCheckoutPlanId/resolveCheckoutPriceId below are KEPT — the
// checkout.session.completed webhook handler (syncTierFromStripeSubscription)
// still needs them to interpret metadata on events from pre-existing,
// legacy (pre-PAI'D) subscriptions; handleGetSubscription/
// handleCancelSubscription below are also kept for the same reason. Only
// the ability to CREATE a new Stripe-direct subscription is gone.
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

/** H8.1b: bound the cancel-subscription call — synchronous and user-facing, so it should fail fast rather than hang the request. */
const CANCEL_SUBSCRIPTION_TIMEOUT_MS = 15_000;

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

    // H8.1b: bound the call so a stalled Stripe response can't hang the request forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CANCEL_SUBSCRIPTION_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(
        `https://api.stripe.com/v1/subscriptions/${active.subscription_id}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Stripe-Version": STRIPE_API_VERSION,
            // H0.6: cancel is semantically idempotent (cancel_at_period_end=true);
            // the key makes a transport retry provably so on Stripe's side too.
            "Idempotency-Key": checkoutIdempotencyKey(ctx.account!.account_id, `stripe-cancel:${active.subscription_id}`),
          },
          body: params.toString(),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }

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
