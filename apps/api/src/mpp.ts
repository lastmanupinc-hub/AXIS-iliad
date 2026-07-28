/**
 * Machine Payments Protocol (MPP) — mppx integration.
 *
 * Supports two payment methods (token rail listed/offered first when
 * configured — on-chain USDC is the server-preferred rail):
 *   - Tempo/crypto (USDC stablecoin on-chain settlement)
 *   - Stripe SPT (shared payment tokens — cards, wallets, Link)
 *
 * Pure protocol utilities (types, negotiation, 402 body building) are
 * re-exported from the publishable `@axis/mpp` package. This file adds
 * the server-side `chargeMpp` runtime that depends on `mppx`.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY      — required for any MPP; fallback to 429 if absent
 *   MPP_SECRET_KEY         — HMAC secret for challenge binding (generate once in prod)
 *   TEMPO_RECIPIENT_ADDRESS — hex 0x address; enables crypto payments when set
 *   TEMPO_TESTNET          — "true" to use testnet USDC contract address
 *
 * On MPP retry: agents should send their AXIS API key in X-Axis-Key header
 * since Authorization is taken by the MPP credential.
 */

import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Mppx, stripe, tempo } from "mppx/server";
import { shouldEmitRuntimeLogs } from "./logger.js";

// Re-export all pure protocol utilities from the OSS @axis/mpp package.
export type { ChargeOptions, MppResult, AgentBudget, PricingTier, Build402Options, AgentMode } from "@axis/mpp";
export {
  getPricingTier,
  formatCents,
  negotiatePrice,
  build402NegotiationBody,
  parseAgentBudget,
  resolveAgentMode,
  priceForMode,
  PRICING_TIERS,
  LEGACY_TOOL_ALIASES,
  computeLargeBodySurchargeCents,
  LARGE_BODY_SURCHARGE_FREE_CAP_BYTES,
  LARGE_BODY_SURCHARGE_HARD_CEILING_BYTES,
} from "@axis/mpp";
import type { ChargeOptions, MppResult } from "@axis/mpp";
import { LARGE_BODY_SURCHARGE_FREE_CAP_BYTES, LARGE_BODY_SURCHARGE_HARD_CEILING_BYTES } from "@axis/mpp";

/**
 * Env-overridable large-body-surcharge thresholds (mirrors router.ts's own
 * MAX_BODY_BYTES override pattern) -- lets tests exercise the free-cap/
 * hard-ceiling boundaries with small real payloads instead of transferring
 * tens of MB. Unset in production; the @axis/mpp package constants are the
 * real defaults.
 */
export function getLargeBodySurchargeFreeCapBytes(): number {
  const v = process.env.AXIS_LARGE_BODY_FREE_CAP_BYTES;
  return v ? parseInt(v, 10) : LARGE_BODY_SURCHARGE_FREE_CAP_BYTES;
}
export function getLargeBodySurchargeHardCeilingBytes(): number {
  const v = process.env.AXIS_LARGE_BODY_HARD_CEILING_BYTES;
  return v ? parseInt(v, 10) : LARGE_BODY_SURCHARGE_HARD_CEILING_BYTES;
}

/**
 * H2.5 — the canonical field set every payment/quota-required response
 * carries, across REST (`sendError`) and MCP (`buildMcpPaymentRequiredError`).
 * This does NOT replace older sibling field names already on the wire
 * (`payment_url`, `checkout_url`, `go_pro_url`, `checkout_endpoint`,
 * `plans_url`, `topup_url`) — `error_code` and response shapes are stable API
 * surface (this repo's public-API compatibility law), so nothing already
 * shipped is removed or renamed. New call sites, and the contract test in
 * `payment-required-contract.test.ts`, measure against this canonical set;
 * older field names keep working for whatever already reads them.
 */
export interface PaymentRequiredCanonicalFields {
  /** Machine-checkable error identity — an ErrorCode value (logger.ts). */
  error_code: string;
  /** Human-readable, call-specific explanation. Never a generic constant. */
  message: string;
  /** Where to go to pay/upgrade. Always PAI'D-hosted — never the dead legacy /v1/checkout. */
  upgrade_url: string;
  /**
   * Present when an authenticated account's credit standing is meaningful to
   * this response (a UsageCreditSummary); null/absent for anonymous callers
   * and for gates that aren't about credit balance (e.g. tier eligibility,
   * external rate limits).
   */
  usage_credits?: unknown;
}

// USDC on Tempo network. Mainnet matches mppx's own `tokens.usdc` default.
// DISCLOSED, NOT FIXED: the testnet address below matches mppx's
// `tokens.pathUsd` default (chainId 42431), not `tokens.usdc` — Tempo's
// testnet may simply not have a USDC deployment and pathUSD is the sensible
// default, but that's inferred from address matching, not confirmed against
// a live testnet. The negotiation body's `asset` field is unconditionally
// "USDC" regardless of testnet/mainnet, so an agent testing the crypto rail
// today is told "USDC" while this constant may actually settle pathUSD.
// Needs verification against mppx's real testnet behavior before relabeling
// either the constant or the negotiation body's asset field.
const TEMPO_USDC_MAINNET = "0x20c000000000000000000000b9537d11c60e8b50";
const TEMPO_USDC_TESTNET = "0x20c0000000000000000000000000000000000000";

// ─── Instance cache ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMppx = any;

type CacheKey = { stripeKey: string; tempoRecipient: string };
let _cache: { key: CacheKey; inst: AnyMppx } | null = null;

function getMppx(): AnyMppx | null {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return null;

  const tempoRecipient = process.env.TEMPO_RECIPIENT_ADDRESS ?? "";

  if (
    _cache?.key.stripeKey === stripeKey &&
    _cache?.key.tempoRecipient === tempoRecipient
  ) {
    return _cache.inst;
  }

  // Use MPP_SECRET_KEY in production for challenge survival across restarts.
  const secretKey =
    process.env.MPP_SECRET_KEY ??
    crypto.randomBytes(32).toString("base64");

  const stripeMethod = stripe.charge({
    secretKey: stripeKey,
    networkId: "internal",
    paymentMethodTypes: ["card", "link"],
  });

  const testnet = process.env.TEMPO_TESTNET === "true";

  // Tempo/USDC registered first: mppx compose() appends WWW-Authenticate
  // challenges in handler order, so this makes the token rail the first offer
  // an agent sees (a client Accept-Payment header still overrides). Stripe
  // remains the always-available fallback.
  const inst = tempoRecipient
    ? Mppx.create({
        methods: [tempo.charge({ testnet }), stripeMethod] as const,
        secretKey,
      })
    : Mppx.create({ methods: [stripeMethod] as const, secretKey });

  _cache = { key: { stripeKey, tempoRecipient }, inst };
  return inst;
}

/** Strip non-ASCII characters that break HTTP ByteString headers (undici). */
function toAscii(str: string): string {
  return str.replace(/[–—]/g, "-").replace(/[""'']/g, '"').replace(/…/g, "...");
}

/**
 * Runs the MPP charge flow (mppx) on a quota-exceeded request.
 *
 * Returns:
 *   - `{status: 402}` — MPP challenge written to res. Caller MUST return immediately.
 *   - `{status: 200}` — Payment validated; Payment-Receipt header set on res.
 *                        Caller continues processing normally.
 *   - `null`          — MPP not configured (no STRIPE_SECRET_KEY).
 *                        Caller should fall back to HTTP 429.
 */
export async function chargeMpp(
  req: IncomingMessage,
  res: ServerResponse,
  options: ChargeOptions,
): Promise<MppResult | null> {
  const inst = getMppx();
  if (!inst) {
    if (shouldEmitRuntimeLogs()) {
      console.warn(`[MPP] not configured (STRIPE_SECRET_KEY absent) - ${options.description ?? "AXIS API credit"}`);
    }
    return null;
  }

  // Sanitise all string fields — mppx embeds these into HTTP headers
  // which require ASCII-only ByteString values.
  const safeDescription = options.description ? toAscii(options.description) : undefined;
  const safeMeta = options.meta
    ? Object.fromEntries(Object.entries(options.meta).map(([k, v]) => [k, toAscii(v)]))
    : undefined;

  const tempoRecipient = process.env.TEMPO_RECIPIENT_ADDRESS;
  const testnet = process.env.TEMPO_TESTNET === "true";
  const tempoCurrency = testnet ? TEMPO_USDC_TESTNET : TEMPO_USDC_MAINNET;

  let handler: (req: globalThis.Request) => Promise<MppResult>;

  if (tempoRecipient && inst.tempo) {
    // Both rails composed so the client can choose. USDC/Tempo listed FIRST —
    // compose() emits WWW-Authenticate challenges in this order, making the
    // token rail the server-preferred offer (faster, deterministic on-chain
    // settlement, no card intermediaries). Same price on both rails; a client
    // Accept-Payment ranking still overrides per protocol.
    handler = inst.compose(
      [inst.tempo.charge, {
        amount: options.amount,
        currency: tempoCurrency,
        decimals: 6,          // USDC uses 6 decimals
        recipient: tempoRecipient,
        description: safeDescription,
      }],
      [inst.stripe.charge, {
        amount: options.amount,
        currency: options.currency,
        decimals: options.decimals,
        description: safeDescription,
        meta: safeMeta,
      }],
    ) as (req: globalThis.Request) => Promise<MppResult>;
  } else {
    handler = inst["stripe/charge"]({
      amount: options.amount,
      currency: options.currency,
      decimals: options.decimals,
      description: safeDescription,
      meta: safeMeta,
    }) as (req: globalThis.Request) => Promise<MppResult>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: MppResult;
  try {
    result = await (Mppx.toNodeListener(handler as any)(req, res) as Promise<MppResult>);
  } catch (err) {
    if (shouldEmitRuntimeLogs()) {
      console.error(`[MPP] charge failed - ${safeDescription ?? "AXIS API credit"}:`, err);
    }
    return null;          // treat MPP failure as "not configured" so caller sends 402
  }
  /* v8 ignore next 6 */
  if (result.status === 402) {
    if (shouldEmitRuntimeLogs()) {
      console.log(`[MPP] 402 challenge issued - ${safeDescription ?? "AXIS API credit"}`);
    }
  } else if (result.status === 200) {
    if (shouldEmitRuntimeLogs()) {
      console.log(`[MPP] 200 payment validated - ${safeDescription ?? "AXIS API credit"}`);
    }
  }
  return result;
}

/** Resets the cached mppx instance. Call in tests after changing env vars. */
export function resetMppxCache(): void {
  _cache = null;
}
