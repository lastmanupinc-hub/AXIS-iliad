// ─── PAI'D client — Iliad app adapter ───────────────────────────────
//
// The generic PAI'D HTTP client lives in the shared, publish-ready
// `@axis/paid-client` package. This adapter adds Iliad's plan→tier model and the
// subscription-metadata wrapper, and re-exports the shared surface so existing
// importers (paid-handlers, credit-pack-handlers) don't change.

import { createHmac } from "node:crypto";
import {
  createPaidCheckoutSession,
  PaidError,
  loadPaidConfig,
  resolvePaidBaseUrl,
  resolvePaidWebhookSecret,
  isPaidConfigured,
  verifyPaidWebhookSignature,
  getPaidWallet,
  debitPaidWallet,
} from "@axis/paid-client";
import type {
  PaidConfig, PaidPlan, CheckoutSession, CreatePaidCheckoutInput, VerifyWebhookOptions,
  CreditWallet, DebitResult, DebitWalletInput, CreditTransaction, InsufficientCreditsBody,
} from "@axis/paid-client";

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
  getPaidWallet,
  debitPaidWallet,
};
export type {
  PaidConfig,
  PaidPlan,
  CheckoutSession,
  CreatePaidCheckoutInput,
  CreatePaidCheckoutInput as CreateTopupCheckoutInput,
  VerifyWebhookOptions,
  CreditWallet,
  DebitResult,
  DebitWalletInput,
  CreditTransaction,
  InsufficientCreditsBody,
};

/**
 * Rollout gate for the PAI'D Fabric-Credit wallet integration on the per-call
 * agentic settlement rail (WO-04). Wired into `settleOverageCash` (cashier.ts) —
 * the single cash-collection tail shared by BOTH the REST cashier and the MCP
 * in-band settlement gate — NOT into `captureMcpToolCredits` as originally
 * sketched in docs/MCP_PAID_ACCESS_DESIGN.md's Phase 0 draft.
 * - off     (default): no wallet calls; behaviour unchanged (mppx-direct).
 * - read   : read the FC wallet balance and log it; still falls through to mppx.
 * - shadow : compute + LOG what would be debited (FC amount, cents drift); still
 *            falls through to mppx — behaviour identical, drift observable.
 * - enforce: debit the wallet as the collection rail; success -> paid, mppx
 *            skipped; 402 insufficient_credits -> top-up challenge, mppx skipped.
 * Ship dark (off), then advance per the phased plan after dogfooding live PAI'D.
 */
export type PaidWalletMode = "off" | "read" | "shadow" | "enforce";
export function paidWalletMode(env: NodeJS.ProcessEnv = process.env): PaidWalletMode {
  const m = (env.PAID_WALLET_MODE ?? "off").toLowerCase();
  return m === "read" || m === "shadow" || m === "enforce" ? m : "off";
}

/**
 * A stable idempotency key so a client RETRY (network timeout, reload,
 * double-submit) reuses the SAME PAI'D checkout session instead of creating a
 * second charge. Derived from a per-account seed + scope + a short time bucket:
 * rapid retries collapse to one key, while a deliberate re-purchase after the
 * window gets a fresh key. The account id is HMAC'd, never sent to PAI'D raw.
 */
export function checkoutIdempotencyKey(accountSeed: string, scope: string, windowMs = 120_000): string {
  const bucket = Math.floor(Date.now() / windowMs);
  return createHmac("sha256", accountSeed).update(`${scope}:${bucket}`).digest("hex").slice(0, 32);
}

/**
 * H2.6 (red-team fix, WAVE-0 findings #2+#5) — a STABLE idempotency key for
 * the FC-wallet debit rail, derived from the caller's OWN Idempotency-Key.
 * Unlike checkoutIdempotencyKey, this has NO time bucket: the same
 * (accountId, tool, callerKey) always derives the SAME wallet-debit key, so a
 * genuine client retry of the exact same logical call — after our own 15s
 * abort, or after the ambiguous-failure 402 that abort produces — reuses the
 * key and lets PAI'D's own idempotency handling dedupe it, instead of every
 * retry minting a fresh key and becoming a second real debit. A DIFFERENT
 * call (different tool, or no shared caller key) derives a different key —
 * this is per-logical-call identity, not H0.1's 120s-bucket mistake (which
 * collapsed genuinely distinct calls together). The account id is HMAC'd,
 * never sent to PAI'D raw.
 */
export function walletDebitIdempotencyKey(accountSeed: string, tool: string, callerKey: string): string {
  return createHmac("sha256", accountSeed).update(`wallet-debit:${tool}:${callerKey}`).digest("hex").slice(0, 32);
}

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
