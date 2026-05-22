// ─── PAI'D Payment Processor Handlers ────────────────────────────
//
// HTTP routes that integrate the AXIS Iliad backend with the PAI'D
// payment processor.
//
//   POST /portal/api/subscribe         (frontend → backend → PAID)
//   POST /portal/api/paid/webhook      (PAID → backend, signed)
//
// The subscribe route never sees card data; PAID returns a Stripe
// `client_secret` that the frontend hands to Stripe Elements.
// The webhook upgrades / downgrades the AXIS account tier when
// PAID forwards Stripe subscription lifecycle events.

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import {
  createSubscription,
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
  markPurchaseSucceeded,
  getPackBySession,
} from "@axis/snapshots";

// ─── POST /portal/api/subscribe ─────────────────────────────────
//
// Body: { plan: "monthly" | "annual", email: string, idempotency_key?: string }
// Returns: { subscription_id, client_secret, status }

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
  const email = typeof body.email === "string" ? body.email.trim() : "";
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

  try {
    const sub = await createSubscription(
      {
        plan: plan as PaidPlan,
        customerEmail: email,
        idempotencyKey:
          typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
      },
      config,
    );
    trackEvent(account.account_id, "checkout_started", "conversion", {
      processor: "paid",
      plan,
      subscription_id: sub.subscription_id,
    });
    sendJSON(res, 200, {
      subscription_id: sub.subscription_id,
      client_secret: sub.client_secret,
      status: sub.status,
    });
  } catch (err) {
    if (err instanceof PaidError) {
      log("error", "PAI'D subscription create failed", {
        status: err.status,
        body: err.body.slice(0, 500),
      });
      sendError(res, 502, ErrorCode.UPSTREAM_ERROR, "Payment processor rejected request");
      return;
    }
    log("error", "PAI'D subscription create error", { error: (err as Error).message });
    sendError(res, 500, ErrorCode.INTERNAL_ERROR, "Subscription create failed");
  }
}

// ─── POST /portal/api/paid/webhook ──────────────────────────────
//
// Header: PAID-Signature: t=<unix>,v1=<hex>
// Body:   { type: string, data: { object: { customer_email?, … } } }

const HANDLED_PAID_EVENTS = new Set([
  "payment_intent.succeeded",
  "checkout.session.completed",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.deleted",
]);

function tierForPaidEvent(eventType: string): "free" | "paid" | null {
  if (eventType === "subscription.canceled" || eventType === "subscription.deleted") return "free";
  if (eventType === "subscription.created" || eventType === "subscription.updated") return "paid";
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
  const signatureHeader =
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
  const metadata = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const metaType = typeof metadata.type === "string" ? metadata.type : "";

  // ─── Credit topup completion ────────────────────────────────────
  // PAI'D forwards Stripe's checkout.session.completed for the topup
  // session we created in credit-pack-handlers.ts. The session_id is the
  // load-bearing identifier — we wrote it into credit_pack_purchases on
  // pending-row creation.
  if (eventType === "checkout.session.completed" && metaType === "axis_credit_topup") {
    const sessionId = typeof obj.id === "string" ? obj.id : "";
    const paymentIntentId =
      typeof obj.payment_intent === "string" ? obj.payment_intent : undefined;

    if (!sessionId) {
      log("warn", "PAID credit topup webhook missing session id", { metadata });
      sendJSON(res, 200, { received: true, event: eventType, handled: false, reason: "no_session_id" });
      return;
    }

    const pack = markPurchaseSucceeded(sessionId, paymentIntentId);
    if (!pack) {
      // Unknown session — could be a replay attack or a session from a different env.
      log("warn", "PAID credit topup webhook for unknown session", { session_id: sessionId });
      sendJSON(res, 200, { received: true, event: eventType, handled: false, reason: "unknown_session" });
      return;
    }

    trackEvent(
      pack.account_id,
      "upgrade_completed",
      "conversion",
      {
        kind: "credit_topup",
        pack_id: pack.pack_id,
        credits: String(pack.credits_purchased),
        price_cents: String(pack.price_cents),
        session_id: sessionId,
      },
    );

    sendJSON(res, 200, {
      received: true,
      event: eventType,
      handled: true,
      kind: "credit_topup",
      purchase_id: pack.purchase_id,
      credits_granted: pack.credits_purchased,
      status: pack.status,
    });
    return;
  }

  // payment_intent.succeeded for a credit topup is also forwarded but we use
  // checkout.session.completed as the canonical grant trigger. Skip duplicate.
  if (eventType === "payment_intent.succeeded" && metaType === "axis_credit_topup") {
    // Still surface the existing pack record for observability.
    const sessionId = typeof metadata.session_id === "string" ? metadata.session_id : "";
    const existing = sessionId ? getPackBySession(sessionId) : null;
    sendJSON(res, 200, {
      received: true,
      event: eventType,
      handled: true,
      kind: "credit_topup_pi_observed",
      purchase_id: existing?.purchase_id ?? null,
    });
    return;
  }

  const customerEmail = (obj.customer_email ?? obj.email) as string | undefined;
  const subscriptionId = (obj.subscription_id ?? obj.id) as string | undefined;

  const targetTier = tierForPaidEvent(eventType);
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
