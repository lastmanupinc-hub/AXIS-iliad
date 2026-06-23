// ─── @axis/paid-client — generic PAI'D payment-processor client ─────
//
// Shared across AXIS merchant apps. App-specific plan/tier mapping does NOT live
// here — each app builds its own `metadata` and calls createPaidCheckoutSession.
//
// Wire format (verified against the live PAI'D Go backend):
//   - Auth: `Authorization: Bearer <PAID_API_KEY>` (no request HMAC).
//   - POST {base}/checkout/sessions → a HOSTED checkout session; PAI'D hosts the
//     payment page and returns `url`. No Stripe client_secret / inline Elements.
//   - Webhooks: Standard-Webhooks style, `Webhook-Signature: t=<unix>,v1=<hex>`
//     over "{timestamp}.{rawBody}" keyed by the webhook signing secret.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_BASE_URL = "https://axis-pai-paid-api-main.onrender.com/v1";
// PAI'D runs on Render; a cold free-tier instance can take a few seconds to wake.
const DEFAULT_TIMEOUT_MS = 15_000;

/** Billing cycle (apps that bill recurringly forward this in metadata). */
export type PaidPlan = "monthly" | "annual";

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

/**
 * Resolve PAI'D's base URL, tolerating the three names the estate uses for it:
 * PAI'D server reads `PAID_API_URL`, Iliad `PAID_API_BASE_URL`, Avatar `PAID_BASE_URL`.
 */
export function resolvePaidBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.PAID_API_BASE_URL ?? env.PAID_API_URL ?? env.PAID_BASE_URL;
}

/**
 * Resolve the PAI'D webhook secret. PAI'D **signs** with `PAID_WEBHOOK_SECRET`; merchant
 * apps historically **verified** with `PAID_WEBHOOK_SIGNING_KEY`. Accept either so a name
 * mismatch can't silently reject fulfilment webhooks (payment ok, grant never applied).
 */
export function resolvePaidWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.PAID_WEBHOOK_SIGNING_KEY ?? env.PAID_WEBHOOK_SECRET;
}

/** True when PAI'D can be reached as a merchant — tolerant of the base-URL name variants. */
export function isPaidConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    resolvePaidBaseUrl(env) &&
    (env.PAID_MERCHANT_ID || env.PAID_ACCOUNT_ID) &&
    env.PAID_API_KEY,
  );
}

export function loadPaidConfig(env: NodeJS.ProcessEnv = process.env): PaidConfig {
  const apiKey = env.PAID_API_KEY;
  const merchantId = env.PAID_MERCHANT_ID ?? env.PAID_ACCOUNT_ID;
  if (!apiKey) throw new Error("PAID_API_KEY is not set");
  if (!merchantId) throw new Error("PAID_MERCHANT_ID is not set");
  return {
    apiBaseUrl: (resolvePaidBaseUrl(env) ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey,
    merchantId,
    webhookSigningKey: resolvePaidWebhookSecret(env),
  };
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

export interface CreatePaidCheckoutInput {
  /** Authoritative price in minor units (cents), resolved server-side. */
  amountCents: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  /** Forwarded to PAI'D → Stripe → the webhook. The app puts tier/plan_id/kind here. */
  metadata: Record<string, string>;
  customerEmail?: string;
  idempotencyKey?: string;
}

/**
 * Create a PAI'D HOSTED checkout session for a one-time charge and return it.
 * The caller redirects the buyer to `session.url`; fulfilment happens async via
 * the checkout.session.completed webhook keyed off `metadata`.
 *
 * mode="payment" (one-time): PAI'D gates mode="subscription" (501) until recurring
 * billing is enabled, so apps charge once and the webhook activates the tier.
 * amount_total_minor matches the single ad-hoc line item so the backend drift guard passes.
 */
export async function createPaidCheckoutSession(
  input: CreatePaidCheckoutInput,
  config: PaidConfig = loadPaidConfig(),
): Promise<CheckoutSession> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("amountCents must be a positive integer (cents)");
  }
  if (!input.successUrl || !input.cancelUrl) {
    throw new Error("successUrl and cancelUrl are required");
  }
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
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      metadata: input.metadata,
    },
    config,
    idem,
  );
}

// ─── Webhook signature verification ──────────────────────────────
//
// PAI'D signs payloads with HMAC-SHA256 keyed by the merchant's webhook secret.
// Signature header: `Webhook-Signature: t=<unix>,v1=<hex>` over `{t}.{rawBody}`.

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
