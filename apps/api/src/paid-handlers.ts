// ─── PAI'D Payment Processor Handlers ────────────────────────────
//
// HTTP routes that integrate the AXIS Iliad backend with the PAI'D
// payment processor.
//
//   POST /portal/api/subscribe         (frontend → backend → PAID)
//   GET  /portal/api/paid/config       (public config probe, no auth)
//   POST /portal/api/paid/webhook      (PAID → backend, signed)
//
// The subscribe route creates a PAI'D HOSTED checkout session and returns its
// `checkout_url`; the frontend redirects the buyer to PAI'D's hosted page
// (PAI'D does NOT return a Stripe client_secret — there is no inline-Elements
// flow). Fulfilment is async: the webhook upgrades / downgrades the AXIS
// account tier when PAI'D forwards a checkout.session.completed (or
// subscription lifecycle) event.

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import {
  createCheckoutSession,
  loadPaidConfig,
  verifyPaidWebhookSignature,
  isPaidConfigured,
  resolvePaidWebhookSecret,
  PaidError,
  checkoutIdempotencyKey,
  type PaidPlan,
  type CheckoutPlanId,
} from "./paid-client.js";
import {
  getAccountByEmail,
  updateAccountTierIfCurrent,
  updateAccountPaidPlanId,
  logTierChange,
  trackEvent,
  markPurchaseSucceeded,
  PLAN_CATALOG,
} from "@axis/snapshots";

// All tiers (Starter/Pro/Growth) route through PAI'D. The plan id comes from the
// request; Starter is the default for back-compat with the old single-tier body.
const DEFAULT_PAID_PLAN_ID: CheckoutPlanId = "starter";

/** Normalize a requested plan to a PAI'D checkout plan id (accepts tier aliases). */
function resolvePaidPlanId(raw: unknown): CheckoutPlanId {
  if (raw === "starter" || raw === "pro" || raw === "growth") return raw;
  if (raw === "suite") return "growth";
  if (raw === "paid") return "starter";
  return DEFAULT_PAID_PLAN_ID;
}

/** Resolve the authoritative price (minor units) for a plan + cycle. */
function planPriceCents(planId: string, cycle: PaidPlan): number | null {
  const plan = PLAN_CATALOG.find((p) => p.id === planId);
  if (!plan) return null;
  const cents = cycle === "annual" ? plan.price_annual_cents : plan.price_monthly_cents;
  return cents > 0 ? cents : null;
}

/**
 * Resolve the app base URL for hosted-checkout return links. Env-driven and
 * validated — deliberately does NOT
 * trust the request `Origin` header, which is caller-controlled: a crafted
 * (non-browser) request could otherwise point PAI'D's post-checkout redirect at
 * an attacker-controlled origin (open-redirect via the payment processor).
 */
function paidAppBaseUrl(): string {
  const candidates = [process.env.PAID_PUBLIC_APP_URL, process.env.AXIS_WEB_URL];
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "*") continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
    } catch {
      // ignore an invalid candidate and try the next
    }
  }
  return "https://iliad.trustfabric.ai";
}

/** Build the hosted-checkout return URLs from the validated app base URL. */
function checkoutReturnUrls(): { successUrl: string; cancelUrl: string } {
  const base = paidAppBaseUrl();
  return {
    successUrl: `${base}/?paid_checkout=success`,
    cancelUrl: `${base}/?paid_checkout=cancel`,
  };
}

// ─── POST /portal/api/subscribe ─────────────────────────────────
//
// Body: { plan: "monthly" | "annual", email: string, idempotency_key?: string }
// Returns: { subscription_id, client_secret, status, publishable_key }
//
// publishable_key is PAI'D's Stripe publishable key — the client_secret
// belongs to PAI'D's Stripe account, so the frontend must initialize
// Stripe Elements with that key, not ours.

export async function handlePaidSubscribe(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: { plan?: unknown; plan_id?: unknown; email?: unknown; idempotency_key?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const plan = body.plan;
  if (plan !== "monthly" && plan !== "annual") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, 'plan must be "monthly" or "annual"');
    return;
  }
  // Lowercase to the canonical form — accounts store emails lowercased and
  // PAI'D/Stripe may normalize casing in webhook echoes.
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "email is required");
    return;
  }

  const account = await getAccountByEmail(email);
  if (!account) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "No account found for that email — sign up first");
    return;
  }

  let config;
  try {
    config = loadPaidConfig();
  } catch (err) {
    log("error", "PAI'D config missing", { error: (err as Error).message });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Payment processor not configured");
    return;
  }

  const planId = resolvePaidPlanId(body.plan_id);
  const amountCents = planPriceCents(planId, plan as PaidPlan);
  if (amountCents === null) {
    log("error", "PAI'D plan price unavailable", { plan_id: planId, cycle: plan });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Plan price unavailable");
    return;
  }
  const { successUrl, cancelUrl } = checkoutReturnUrls();

  try {
    const session = await createCheckoutSession(
      {
        planId,
        cycle: plan as PaidPlan,
        amountCents,
        description: `AXIS Iliad ${planId} (${plan})`,
        // Use the stored account email (canonical lowercase) so the
        // user_email PAI'D echoes back in the webhook maps onto the same
        // account, even for legacy mixed-case rows.
        customerEmail: account.email,
        successUrl,
        cancelUrl,
        // Prefer a client-supplied key; otherwise default one server-side so a
        // retried subscribe (double-submit) can't create a second subscription
        // charge (the shared client would otherwise fall back to a fresh UUID).
        idempotencyKey:
          typeof body.idempotency_key === "string"
            ? body.idempotency_key
            : checkoutIdempotencyKey(account.account_id, `subscribe:${planId}:${plan}`),
      },
      config,
    );
    // H-Phase-A cycle 11: a real, payable checkout_url already exists
    // server-side by this point — a transient failure in this best-effort
    // analytics write must never surface as a customer-facing "checkout
    // failed" 500 (same fix as credit-pack-handlers.ts's identical shape,
    // found in the same audit).
    void trackEvent(account.account_id, "checkout_started", "conversion", {
      processor: "paid",
      plan,
      session_id: session.id,
    }).catch(() => {});
    sendJSON(res, 200, {
      checkout_url: session.url,
      session_id: session.id,
      status: session.status,
    });
  } catch (err) {
    if (err instanceof PaidError) {
      log("error", "PAI'D checkout session create failed", {
        status: err.status,
        body: err.body.slice(0, 500),
      });
      sendError(res, 502, ErrorCode.UPSTREAM_ERROR, "Payment processor rejected request");
      return;
    }
    log("error", "PAI'D checkout session create error", { error: (err as Error).message });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Checkout session create failed");
  }
}

// ─── GET /portal/api/paid/config ────────────────────────────────
//
// Public, unauthenticated probe for the checkout frontend.
// Returns: { configured: boolean, publishable_key: string|null,
//            plans: { monthly: boolean, annual: boolean } }
//
// configured is true when the processor can create a hosted checkout session:
// PAID_API_BASE_URL + PAID_MERCHANT_ID + PAID_API_KEY (bearer). No Stripe
// publishable key is needed (PAI'D hosts the page) and PAID_API_SECRET is
// unused under bearer auth. No secret is ever exposed in the response.

export async function handlePaidConfig(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const env = process.env;
  const configured = isPaidConfigured(env);
  sendJSON(res, 200, { configured });
}

// ─── POST /portal/api/paid/webhook ──────────────────────────────
//
// Header: PAID-Signature: t=<unix>,v1=<hex>
// Body:   { type: string, data: { object: { customer_email?, … } } }
//
// Event names verified against PAI'D's published WebhookDelivery.type enum
// (TICKET-AXIS_TOOLBOX-subscription-contract-20260727, confirmed 2026-07-27,
// PAI'D @ 925cb60d). Before that reply this list was assembled from
// Stripe-shaped guesses, and three entries named events PAI'D does not emit
// at all: "subscription.deleted", "payment_intent.succeeded" and
// "charge.refunded". Removed rather than left in place — keeping a name the
// provider never sends implies a verified path that never existed.
//
// H-Phase-A cycle 9 recorded the subscription.* handling as "DEAD IN
// PRODUCTION" because PAI'D 501'd mode:"subscription". That diagnosis was
// wrong: mode:"subscription" is fully built on their side.
//
// A first correction here said the 501 was our missing per-merchant
// `subscriptions_enabled` flag, "dormant only until that flag is set". That
// came from PAI'D's own ticket reply and it was ALSO wrong — PAI'D verified
// against their live platform on 2026-07-27 and the flag has been
// enabled: true, rollout_percent: 100 since 2026-07-08, three weeks before we
// filed. Nothing is waiting on a flag.
//
// The ACTUAL blocker is ours and it is one line:
// packages/paid-client/src/index.ts still sends mode:"payment" (see the
// createCheckoutSession call there). Today's live $29 session proves it —
// mode:"payment" carrying metadata {kind:"subscription", plan_id:"starter"},
// i.e. a subscription intent charged once. This handling is NOT dormant; it
// goes live the moment that client sends mode:"subscription".

const HANDLED_PAID_EVENTS = new Set([
  "checkout.session.completed", // hosted-checkout fulfilment (the live path)
  "payment_intent.captured", // PAI'D's name — there is no payment_intent.succeeded
  "subscription.created",
  "subscription.updated",
  "subscription.renewed", // the renewal signal; tier must survive it
  "subscription.canceled", // the ONLY event that deactivates a tier
  // Allowlisted as a deliberate NO-OP, not an oversight. A failed payment
  // means the customer is mid-dunning and may still recover on PAI'D's +1d
  // retry, so deactivating here would cut off someone who then pays. Named
  // explicitly so a future reader doesn't "fix" the omission by downgrading.
  "subscription.payment_failed",
]);

// Refunds are absent from that list on purpose — they're caught earlier by a
// substring match, which is what made the old guess survivable: the real name
// is "payment_intent.refunded", not the "charge.refunded" this file guessed.
//
// KNOWN UNHANDLED — customer_portal.plan_changed. A self-serve plan change in
// PAI'D's customer portal emits ONLY this event (portal cancel/pause/resume
// emit the normal subscription.* events, so those are covered), and it carries
// old_plan_id/new_plan_id in the TOP-LEVEL metadata — which this handler never
// reads, since it destructures data.object. Wiring it is blocked on
// TICKET-AXIS_TOOLBOX-checkout-webhook-envelope-20260727, which asks where our
// metadata actually arrives; building it now would bake in the same unverified
// assumption that ticket exists to settle. Until then, a self-serve
// upgrade/downgrade leaves the previous tier in place.

type PaidTier = "free" | "paid" | "suite";

/**
 * Plan-id → AXIS tier mapping, built from env at call time so tests and
 * config changes take effect without a restart. Pro plans map to "paid";
 * optional Growth plans (PAID_PLAN_GROWTH_*) map to "suite".
 */
function buildPlanTierMap(env: NodeJS.ProcessEnv = process.env): Map<string, "paid" | "suite"> {
  const map = new Map<string, "paid" | "suite">();
  if (env.PAID_PLAN_PRO_MONTHLY) map.set(env.PAID_PLAN_PRO_MONTHLY, "paid");
  if (env.PAID_PLAN_PRO_ANNUAL) map.set(env.PAID_PLAN_PRO_ANNUAL, "paid");
  if (env.PAID_PLAN_GROWTH_MONTHLY) map.set(env.PAID_PLAN_GROWTH_MONTHLY, "suite");
  if (env.PAID_PLAN_GROWTH_ANNUAL) map.set(env.PAID_PLAN_GROWTH_ANNUAL, "suite");
  return map;
}

/**
 * Price/plan id → the specific marketed plan (starter/pro/growth) it
 * represents, for subscription lifecycle events. Mirrors buildPlanTierMap's
 * env-driven shape but keeps Starter distinct from Pro (both collapse into
 * the same coarse "paid" tier there) — H-Phase-A cycle 3: a Starter<->Pro
 * switch delivered via subscription.updated/created previously had no way to
 * update accounts.paid_plan_id at all, since marketedPlanIdForPaidEvent only
 * read it from checkout.session.completed's own metadata. Dormant until the
 * PAID_PLAN_STARTER_MONTHLY/ANNUAL env vars are set in the deploy
 * environment (mirroring PAID_PLAN_PRO_MONTHLY/ANNUAL and
 * PAID_PLAN_GROWTH_MONTHLY/ANNUAL, which are themselves optional today) —
 * until then this map is empty and the existing previously-recorded-
 * plan_id-untouched fallback still applies.
 */
function buildPricePlanIdMap(env: NodeJS.ProcessEnv = process.env): Map<string, CheckoutPlanId> {
  const map = new Map<string, CheckoutPlanId>();
  if (env.PAID_PLAN_STARTER_MONTHLY) map.set(env.PAID_PLAN_STARTER_MONTHLY, "starter");
  if (env.PAID_PLAN_STARTER_ANNUAL) map.set(env.PAID_PLAN_STARTER_ANNUAL, "starter");
  if (env.PAID_PLAN_PRO_MONTHLY) map.set(env.PAID_PLAN_PRO_MONTHLY, "pro");
  if (env.PAID_PLAN_PRO_ANNUAL) map.set(env.PAID_PLAN_PRO_ANNUAL, "pro");
  if (env.PAID_PLAN_GROWTH_MONTHLY) map.set(env.PAID_PLAN_GROWTH_MONTHLY, "growth");
  if (env.PAID_PLAN_GROWTH_ANNUAL) map.set(env.PAID_PLAN_GROWTH_ANNUAL, "growth");
  return map;
}

/** Defensively pull a plan id out of the webhook event object. */
function extractPlanId(obj: Record<string, unknown>): string | undefined {
  for (const candidate of [obj.plan_id, obj.plan, obj.price_id]) {
    if (typeof candidate === "string" && candidate) return candidate;
    if (candidate && typeof candidate === "object") {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === "string" && id) return id;
    }
  }
  return undefined;
}

function tierForPaidEvent(eventType: string, obj: Record<string, unknown>): PaidTier | null {
  if (eventType === "checkout.session.completed") {
    // Hosted-checkout fulfilment. We set metadata.tier ("paid"/"suite") and
    // metadata.plan_id when creating the session, so read those directly.
    const meta = (obj.metadata ?? {}) as Record<string, unknown>;
    if (meta.tier === "suite" || meta.tier === "paid") return meta.tier;
    const planId = typeof meta.plan_id === "string" ? meta.plan_id : undefined;
    if (planId === "growth") return "suite";
    if (planId) return "paid";
    log("warn", "PAID checkout.session.completed missing tier/plan_id — defaulting to paid", {
      event: eventType,
      plan_id: planId ?? null,
    });
    return "paid";
  }
  // Cancellation is the only deactivation trigger PAI'D designates; see
  // HANDLED_PAID_EVENTS on why payment_failed deliberately isn't one.
  if (eventType === "subscription.canceled") return "free";
  if (
    eventType === "subscription.created" ||
    eventType === "subscription.updated" ||
    eventType === "subscription.renewed"
  ) {
    const planId = extractPlanId(obj);
    if (planId) {
      const mapped = buildPlanTierMap().get(planId);
      if (mapped) return mapped;
    }
    log("warn", "PAID webhook plan id missing or unknown — defaulting tier to paid", {
      event: eventType,
      plan_id: planId ?? null,
    });
    return "paid";
  }
  return null;
}

/**
 * The specific marketed plan (starter/pro/growth) a PAID webhook event names,
 * distinct from tierForPaidEvent's coarse paid/suite tier — Starter and Pro
 * both map to "paid", so this is the only place that still knows which one a
 * subscriber actually bought (H-Phase-A cycle 1). checkout.session.completed
 * reliably carries it via createCheckoutSession's own metadata.plan_id,
 * stamped at session-creation time. subscription.created/updated events
 * carry PAI'D's own price/plan id instead, resolved through
 * buildPricePlanIdMap the same way tierForPaidEvent resolves buildPlanTierMap
 * (H-Phase-A cycle 3 — a Starter<->Pro switch delivered via subscription.
 * updated previously had NO path to update paid_plan_id at all, since this
 * function only looked at checkout.session.completed). An unrecognized price
 * id still returns null, intentionally leaving any previously-recorded
 * plan_id untouched rather than guessing wrong.
 */
function marketedPlanIdForPaidEvent(eventType: string, obj: Record<string, unknown>): CheckoutPlanId | null {
  if (eventType === "checkout.session.completed") {
    const meta = (obj.metadata ?? {}) as Record<string, unknown>;
    const planId = meta.plan_id;
    return planId === "starter" || planId === "pro" || planId === "growth" ? planId : null;
  }
  if (
    eventType === "subscription.created" ||
    eventType === "subscription.updated" ||
    eventType === "subscription.renewed"
  ) {
    const planId = extractPlanId(obj);
    if (!planId) return null;
    return buildPricePlanIdMap().get(planId) ?? null;
  }
  return null;
}

// H-Phase-A cycle 9: same scope/rationale as stripe.ts's handleChargeRefunded
// — this system has no automatic refund reconciliation, and deciding HOW to
// reconcile one (revoke consumed credits? downgrade mid-cycle? partial vs
// full refund?) is a genuine product/policy decision, correctly out of
// scope here. This makes a PAI'D-collected refund OBSERVABLE instead of a
// silent no-op, using only fields a refund-shaped event plausibly carries
// (no DB lookup that could itself fail or resolve to the wrong account).
function handlePaidRefund(eventType: string, obj: Record<string, unknown>): void {
  log("warn", "paid_charge_refunded", {
    event: eventType,
    charge_id: obj.charge_id ?? obj.id,
    payment_intent: obj.payment_intent,
    customer_email: obj.customer_email ?? obj.email,
    amount_refunded: obj.amount_refunded ?? obj.amount,
    currency: obj.currency,
  });
}

export async function handlePaidWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const signingKey = resolvePaidWebhookSecret();
  if (!signingKey) {
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "PAID webhook signing key not configured");
    return;
  }

  const rawBody = await readBody(req);
  // PAI'D signs with the `Webhook-Signature` header (Node lowercases header
  // keys). Keep the legacy paid-signature/x-paid-signature names as fallbacks.
  const signatureHeader =
    (req.headers["webhook-signature"] as string | undefined) ??
    (req.headers["paid-signature"] as string | undefined) ??
    (req.headers["x-paid-signature"] as string | undefined);

  if (!verifyPaidWebhookSignature({ rawBody, signatureHeader, signingKey })) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Invalid PAID webhook signature");
    return;
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const eventType = event.type ?? "";
  const obj = event.data?.object ?? {};

  // Checked before the named-event allowlist below, and independent of it.
  // PAI'D's naming doesn't mirror Stripe verbatim (subscription.created has
  // no "customer." prefix here, unlike Stripe's own customer.subscription.
  // created), so this file once had to guess the refund event name and
  // guessed "charge.refunded". The substring match is what made that
  // survivable: PAI'D's published enum confirms the real name is
  // "payment_intent.refunded", which the guess would have missed entirely
  // and this match caught anyway. Kept as a substring match rather than
  // narrowed to the now-known name — it costs nothing and it is the reason
  // this path didn't silently break.
  if (eventType.toLowerCase().includes("refund")) {
    handlePaidRefund(eventType, obj);
    sendJSON(res, 200, { received: true, event: eventType, handled: true });
    return;
  }

  // Checkout that started and did not finish. No tier change is correct here —
  // nobody paid — but silence is not, and that distinction has already cost us:
  // PAI'D reported 3-D Secure as a card DECLINE for a period, making any card
  // that needed authentication uncollectable, and two real $29 attempts failed
  // without producing a single signal on our side. An abandoned checkout looked
  // exactly like nobody trying. PAI'D has since fixed the 3DS bug (their
  // 77f333c2 + 3ce3f675), so this is not a workaround for that — it is the
  // missing instrument that would have surfaced it in days instead of weeks.
  //
  // Deliberately observability only: logged, never tier-changing, and read
  // defensively because the checkout.session.* envelope shape is still open on
  // TICKET-AXIS_TOOLBOX-checkout-webhook-envelope-20260727. Missing fields
  // degrade to undefined rather than throwing on a live payment webhook.
  if (eventType === "checkout.session.expired" || eventType === "checkout.session.abandoned") {
    log("warn", "paid_checkout_not_completed", {
      event: eventType,
      session_id: obj.id ?? obj.session_id,
      customer_email: obj.customer_email ?? obj.email,
      amount_total_minor: obj.amount_total_minor ?? obj.amount,
      currency: obj.currency,
    });
    sendJSON(res, 200, { received: true, event: eventType, handled: true, tier_change: false });
    return;
  }

  if (!HANDLED_PAID_EVENTS.has(eventType)) {
    sendJSON(res, 200, { received: true, event: eventType, handled: false });
    return;
  }

  const meta = (obj.metadata ?? {}) as Record<string, unknown>;

  // Credit-pack top-up fulfilment — a one-shot purchase, not a tier change.
  // Grant the credits exactly once (markPurchaseSucceeded is idempotent on the
  // session id, so a webhook retry returns null and re-grants nothing).
  if (eventType === "checkout.session.completed" && meta.type === "axis_credit_topup") {
    const sessionId =
      (typeof obj.id === "string" && obj.id) ||
      (typeof obj.session_id === "string" ? obj.session_id : "");
    const paymentIntentId = typeof obj.payment_intent === "string" ? obj.payment_intent : undefined;
    if (!sessionId) {
      sendJSON(res, 200, { received: true, event: eventType, handled: false, reason: "no_session_id" });
      return;
    }
    const granted = await markPurchaseSucceeded(sessionId, paymentIntentId);
    if (granted) {
      // H-Phase-A cycle 12: analytics-only, and NOT retry-safe like the rest
      // of this handler — markPurchaseSucceeded is idempotent and returns
      // null on a webhook retry for an already-granted purchase, so an
      // awaited trackEvent failure here would both false-fail this delivery
      // AND permanently lose the upgrade_completed event (a retry would
      // never re-enter this branch to try again).
      void trackEvent(granted.account_id, "upgrade_completed", "conversion", {
        kind: "credit_topup",
        pack_id: granted.pack_id,
        credits: String(granted.credits),
        price_cents: String(granted.price_cents),
        session_id: sessionId,
      }).catch(() => {});
    }
    sendJSON(res, 200, {
      received: true,
      event: eventType,
      handled: true,
      credit_topup: Boolean(granted),
      credits: granted?.credits ?? 0,
    });
    return;
  }

  // For hosted checkout the buyer email rides in metadata.user_email; for
  // subscription events it's customer_email/email on the object.
  const customerEmail = (meta.user_email ?? obj.customer_email ?? obj.email) as string | undefined;
  const subscriptionId = (obj.subscription_id ?? obj.session_id ?? obj.id) as string | undefined;

  const targetTier = tierForPaidEvent(eventType, obj);
  if (!targetTier || !customerEmail) {
    // payment_intent.captured with no email, subscription.payment_failed
    // (deliberately non-deactivating), or events we don't tier-sync
    sendJSON(res, 200, { received: true, event: eventType, handled: true, tier_change: false });
    return;
  }

  const account = await getAccountByEmail(customerEmail);
  if (!account) {
    // A payment can land before/around signup. Returning 2xx here makes PAI'D
    // STOP retrying, permanently leaving a paid buyer on the free tier. Return a
    // retryable 503 so PAI'D redelivers until the account exists and can be tiered.
    log("warn", "PAID webhook for unknown account — requesting retry", { email: customerEmail, event: eventType });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "account not provisioned yet — retry");
    return;
  }

  const previousTier = account.tier;
  let changed = false;
  if (previousTier !== targetTier) {
    // Compare-and-set: only applies if the account is STILL at previousTier, so a
    // concurrent or redelivered tier webhook can't blind-overwrite (lost update)
    // or double-apply. `changed` is true only when this call made the move, so the
    // audit row + analytics fire exactly once.
    changed = await updateAccountTierIfCurrent(account.account_id, previousTier, targetTier);
  }
  if (changed) {
    await logTierChange(account.account_id, previousTier, targetTier, "paid_webhook", {
      event: eventType,
      subscription_id: subscriptionId,
    });
    // Analytics is best-effort — never block or double-count the webhook on it.
    void trackEvent(
      account.account_id,
      targetTier === "free" ? "downgrade_completed" : "upgrade_completed",
      targetTier === "free" ? "signup" : "conversion",
      { from_tier: previousTier, to_tier: targetTier, source: "paid", event: eventType },
    ).catch(() => {});
  }

  // Runs independently of `changed`: Starter <-> Pro both collapse into the
  // same coarse "paid" tier, so a Starter->Pro upgrade never trips the
  // previousTier !== targetTier branch above even though the specific plan
  // DID change (H-Phase-A cycle 1).
  const marketedPlanId = marketedPlanIdForPaidEvent(eventType, obj);
  if (targetTier === "free") {
    await updateAccountPaidPlanId(account.account_id, null);
  } else if (marketedPlanId) {
    await updateAccountPaidPlanId(account.account_id, marketedPlanId);
  }

  sendJSON(res, 200, {
    received: true,
    event: eventType,
    handled: true,
    tier_change: changed,
    subscription_id: subscriptionId,
  });
}
