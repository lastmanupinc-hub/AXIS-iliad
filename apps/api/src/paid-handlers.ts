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
  PaidError,
  type PaidPlan,
} from "./paid-client.js";
import {
  getAccountByEmail,
  updateAccountTier,
  logTierChange,
  trackEvent,
  PLAN_CATALOG,
} from "@axis/snapshots";

// PAI'D currently processes the Starter tier for AXIS Iliad; Pro/Growth stay
// on the Stripe-direct path (apps/api/src/stripe.ts). To route those through
// PAI'D too, generalize the plan_id below and lift the starter gate in
// PlansPage — createCheckoutSession is already tier-generic.
const PAID_PLAN_ID = "starter" as const;

/** Resolve the authoritative price (minor units) for a plan + cycle. */
function planPriceCents(planId: string, cycle: PaidPlan): number | null {
  const plan = PLAN_CATALOG.find((p) => p.id === planId);
  if (!plan) return null;
  const cents = cycle === "annual" ? plan.price_annual_cents : plan.price_monthly_cents;
  return cents > 0 ? cents : null;
}

/** Build the hosted-checkout return URLs from the caller's origin. */
function checkoutReturnUrls(req: IncomingMessage): { successUrl: string; cancelUrl: string } {
  const origin =
    (typeof req.headers.origin === "string" && req.headers.origin) ||
    process.env.PAID_PUBLIC_APP_URL ||
    "https://axis-iliad.onrender.com";
  const base = origin.replace(/\/+$/, "");
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
  let body: { plan?: unknown; email?: unknown; idempotency_key?: unknown };
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

  const account = getAccountByEmail(email);
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

  const amountCents = planPriceCents(PAID_PLAN_ID, plan as PaidPlan);
  if (amountCents === null) {
    log("error", "PAI'D plan price unavailable", { plan_id: PAID_PLAN_ID, cycle: plan });
    sendError(res, 503, ErrorCode.INTERNAL_ERROR, "Plan price unavailable");
    return;
  }
  const { successUrl, cancelUrl } = checkoutReturnUrls(req);

  try {
    const session = await createCheckoutSession(
      {
        planId: PAID_PLAN_ID,
        cycle: plan as PaidPlan,
        amountCents,
        description: `AXIS Iliad ${PAID_PLAN_ID} (${plan})`,
        // Use the stored account email (canonical lowercase) so the
        // user_email PAI'D echoes back in the webhook maps onto the same
        // account, even for legacy mixed-case rows.
        customerEmail: account.email,
        successUrl,
        cancelUrl,
        idempotencyKey:
          typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
      },
      config,
    );
    trackEvent(account.account_id, "checkout_started", "conversion", {
      processor: "paid",
      plan,
      session_id: session.id,
    });
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
  const configured =
    Boolean(env.PAID_API_BASE_URL) &&
    Boolean(env.PAID_MERCHANT_ID || env.PAID_ACCOUNT_ID) &&
    Boolean(env.PAID_API_KEY);
  sendJSON(res, 200, { configured });
}

// ─── POST /portal/api/paid/webhook ──────────────────────────────
//
// Header: PAID-Signature: t=<unix>,v1=<hex>
// Body:   { type: string, data: { object: { customer_email?, … } } }

const HANDLED_PAID_EVENTS = new Set([
  "checkout.session.completed", // hosted-checkout fulfilment (the live path)
  "payment_intent.succeeded",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.deleted",
]);

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
  if (eventType === "subscription.canceled" || eventType === "subscription.deleted") return "free";
  if (eventType === "subscription.created" || eventType === "subscription.updated") {
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

export async function handlePaidWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const signingKey = process.env.PAID_WEBHOOK_SIGNING_KEY;
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
  if (!HANDLED_PAID_EVENTS.has(eventType)) {
    sendJSON(res, 200, { received: true, event: eventType, handled: false });
    return;
  }

  const obj = event.data?.object ?? {};
  const meta = (obj.metadata ?? {}) as Record<string, unknown>;
  // For hosted checkout the buyer email rides in metadata.user_email; for
  // subscription events it's customer_email/email on the object.
  const customerEmail = (meta.user_email ?? obj.customer_email ?? obj.email) as string | undefined;
  const subscriptionId = (obj.subscription_id ?? obj.session_id ?? obj.id) as string | undefined;

  const targetTier = tierForPaidEvent(eventType, obj);
  if (!targetTier || !customerEmail) {
    // payment_intent.succeeded with no email, or events we don't tier-sync
    sendJSON(res, 200, { received: true, event: eventType, handled: true, tier_change: false });
    return;
  }

  const account = getAccountByEmail(customerEmail);
  if (!account) {
    log("warn", "PAID webhook for unknown account", { email: customerEmail, event: eventType });
    sendJSON(res, 200, { received: true, event: eventType, handled: false, reason: "no_account" });
    return;
  }

  const previousTier = account.tier;
  if (previousTier !== targetTier) {
    updateAccountTier(account.account_id, targetTier);
    logTierChange(account.account_id, previousTier, targetTier, "paid_webhook", {
      event: eventType,
      subscription_id: subscriptionId,
    });
    trackEvent(
      account.account_id,
      targetTier === "free" ? "downgrade_completed" : "upgrade_completed",
      targetTier === "free" ? "signup" : "conversion",
      { from_tier: previousTier, to_tier: targetTier, source: "paid", event: eventType },
    );
  }

  sendJSON(res, 200, {
    received: true,
    event: eventType,
    handled: true,
    tier_change: previousTier !== targetTier,
    subscription_id: subscriptionId,
  });
}
