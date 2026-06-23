// ─── PAI'D client — Iliad app adapter ───────────────────────────────
//
// The generic PAI'D HTTP client lives in the shared, publish-ready
// `@axis/paid-client` package. This adapter adds Iliad's plan→tier model and the
// subscription-metadata wrapper, and re-exports the shared surface so existing
// importers (paid-handlers, credit-pack-handlers) don't change.

import {
  createPaidCheckoutSession,
  PaidError,
  loadPaidConfig,
  resolvePaidBaseUrl,
  resolvePaidWebhookSecret,
  isPaidConfigured,
  verifyPaidWebhookSignature,
} from "@axis/paid-client";
import type { PaidConfig, PaidPlan, CheckoutSession, CreatePaidCheckoutInput, VerifyWebhookOptions } from "@axis/paid-client";

// Re-export the shared surface (credit-pack top-ups use the generic one-shot
// checkout directly under its old name).
export {
  createPaidCheckoutSession,
  createPaidCheckoutSession as createTopupCheckoutSession,
  PaidError,
  loadPaidConfig,
  resolvePaidBaseUrl,
  resolvePaidWebhookSecret,
  isPaidConfigured,
  verifyPaidWebhookSignature,
};
export type {
  PaidConfig,
  PaidPlan,
  CheckoutSession,
  CreatePaidCheckoutInput,
  CreatePaidCheckoutInput as CreateTopupCheckoutInput,
  VerifyWebhookOptions,
};

/** AXIS plan tiers that route through PAI'D (free/enterprise do not). */
export type CheckoutPlanId = "starter" | "pro" | "growth";

/** Map an AXIS plan tier to the PAI'D-side billing tier the webhook activates. */
export function tierForPlan(planId: CheckoutPlanId): "paid" | "suite" {
  return planId === "growth" ? "suite" : "paid";
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

/**
 * Subscription checkout — builds Iliad's tier/plan metadata, then delegates to the
 * shared generic client. PAI'D bills once; the webhook activates the tier.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
  config?: PaidConfig,
): Promise<CheckoutSession> {
  if (!input.customerEmail) throw new Error("customerEmail is required");
  return createPaidCheckoutSession(
    {
      amountCents: input.amountCents,
      description: input.description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      customerEmail: input.customerEmail,
      metadata: {
        user_email: input.customerEmail,
        plan_id: input.planId,
        tier: tierForPlan(input.planId),
        cycle: input.cycle,
        kind: "subscription",
      },
      idempotencyKey: input.idempotencyKey,
    },
    config,
  );
}
