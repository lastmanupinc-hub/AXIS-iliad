// ─── PAI'D Payment Processor Client ──────────────────────────────
//
// Thin client over the PAI'D External API (default
// https://axis-pai-paid-api-main.onrender.com/v1). Reads PAID_API_KEY,
// PAID_MERCHANT_ID, PAID_API_BASE_URL, and PAID_WEBHOOK_SIGNING_KEY from
// process.env. Credentials live in .env.local (gitignored) and in Render
// env vars in production.
//
// Wire format (verified against the live PAI'D Go backend, NOT the stale
// PAID_EXTERNAL_API.md):
//   - Auth: `Authorization: Bearer <PAID_API_KEY>` (no request HMAC).
//   - POST {base}/checkout/sessions → a HOSTED checkout session; PAI'D hosts
//     the payment page and returns `url`. We redirect the buyer there. PAI'D
//     does NOT return a Stripe client_secret — there is no inline-Elements
//     flow on this processor.
//   - Webhook events delivered to /portal/api/paid/webhook, signed
//     Standard-Webhooks style (Webhook-Signature: t=<unix>,v1=<hex>) over
//     "{timestamp}.{rawBody}" keyed by PAID_WEBHOOK_SIGNING_KEY.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_BASE_URL = "https://axis-pai-paid-api-main.onrender.com/v1";

// PAI'D runs on Render; a cold free-tier instance can take a few seconds to
// wake. Cap the synchronous create call so a hung instance can't block the
// request thread indefinitely.
const DEFAULT_TIMEOUT_MS = 15_000;

/** Billing cycle. */
export type PaidPlan = "monthly" | "annual";

/** AXIS plan tiers that route through PAI'D (free/enterprise do not). */
export type CheckoutPlanId = "starter" | "pro" | "growth";

export interface PaidConfig {
  apiBaseUrl: string;
  apiKey: string;
  merchantId: string;
  webhookSigningKey?: string;
  timeoutMs?: number;
}

/** Hosted-checkout session as returned by POST /checkout/sessions. */
export interface CheckoutSession {
  id: string;
  url: string;
  status: string;
  [key: string]: unknown;
}

export interface CreateCheckoutInput {
  planId: CheckoutPlanId;
  cycle: PaidPlan;
  /** Authoritative price in minor units (cents), resolved server-side. */
  amountCents: number;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
}

export class PaidError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "PaidError";
  }
}

export function loadPaidConfig(env: NodeJS.ProcessEnv = process.env): PaidConfig {
  const apiKey = env.PAID_API_KEY;
  const merchantId = env.PAID_MERCHANT_ID ?? env.PAID_ACCOUNT_ID;
  if (!apiKey) throw new Error("PAID_API_KEY is not set (see .env.local)");
  if (!merchantId) throw new Error("PAID_MERCHANT_ID is not set (see .env.local)");
  return {
    apiBaseUrl: (env.PAID_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey,
    merchantId,
    webhookSigningKey: env.PAID_WEBHOOK_SIGNING_KEY,
  };
}

/** Map an AXIS plan tier to the PAI'D-side billing tier the webhook activates. */
export function tierForPlan(planId: CheckoutPlanId): "paid" | "suite" {
  return planId === "growth" ? "suite" : "paid";
}

async function paidPost<T>(
  path: string,
  body: unknown,
  config: PaidConfig,
  idempotencyKey: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PaidError(`PAI'D ${path} timed out after ${config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`, 504, "");
    }
    throw new PaidError(`PAI'D ${path} request failed: ${(err as Error).message}`, 0, "");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new PaidError(`PAI'D ${path} failed (${res.status})`, res.status, text);
  }
  return JSON.parse(text) as T;
}

/**
 * Create a PAI'D HOSTED checkout session for a one-time charge and return it.
 * The caller redirects the buyer to `session.url`; fulfilment (tier upgrade)
 * happens asynchronously via the checkout.session.completed webhook keyed off
 * the metadata we attach here.
 *
 * mode is "payment" (one-time): PAI'D gates mode="subscription" (501) until
 * the processor enables recurring billing, so we charge once and the webhook
 * activates the tier. amount_total_minor matches the single ad-hoc line item
 * so the backend's drift guard passes.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
  config: PaidConfig = loadPaidConfig(),
): Promise<CheckoutSession> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("amountCents must be a positive integer (cents)");
  }
  if (!input.customerEmail) throw new Error("customerEmail is required");
  const idem = input.idempotencyKey ?? randomUUID();
  return paidPost<CheckoutSession>(
    "/checkout/sessions",
    {
      mode: "payment",
      line_items: [
        {
          ad_hoc: { amount: input.amountCents, currency: "USD", description: input.description },
          quantity: 1,
        },
      ],
      payment_method_types: ["card"],
      amount_total_minor: input.amountCents,
      currency: "USD",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      metadata: {
        user_email: input.customerEmail,
        plan_id: input.planId,
        tier: tierForPlan(input.planId),
        cycle: input.cycle,
        kind: "subscription",
      },
    },
    config,
    idem,
  );
}

// ─── Webhook signature verification ──────────────────────────────
//
// PAI'D signs webhook payloads with HMAC-SHA256 using the merchant's
// PAID_WEBHOOK_SIGNING_KEY (whsec_…). The signature is delivered in the
// `Webhook-Signature` header as `t=<unix>,v1=<hex>`, over `{t}.{rawBody}`.

export interface VerifyWebhookOptions {
  rawBody: string;
  signatureHeader: string | undefined;
  signingKey: string;
  toleranceSeconds?: number;
}

export function verifyPaidWebhookSignature(opts: VerifyWebhookOptions): boolean {
  if (!opts.signatureHeader || !opts.signingKey) return false;
  const parts: Record<string, string> = {};
  for (const piece of opts.signatureHeader.split(",")) {
    const idx = piece.indexOf("=");
    if (idx > 0) parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;

  const tolerance = opts.toleranceSeconds ?? 300;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) return false;

  const payload = `${timestamp}.${opts.rawBody}`;
  const expected = createHmac("sha256", opts.signingKey).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
