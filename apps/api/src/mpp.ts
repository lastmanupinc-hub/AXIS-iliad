/**
 * Machine Payments Protocol (MPP) — mppx integration.
 *
 * Supports two payment methods:
 *   - Stripe SPT (shared payment tokens — cards, wallets, Link)
 *   - Tempo/crypto (USDC stablecoin on-chain settlement)
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
  negotiatePrice,
  build402NegotiationBody,
  parseAgentBudget,
  resolveAgentMode,
  priceForMode,
  PRICING_TIERS,
  LEGACY_TOOL_ALIASES,
} from "@axis/mpp";
import type { ChargeOptions, MppResult } from "@axis/mpp";

// USDC on Tempo network
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

  const inst = tempoRecipient
    ? Mppx.create({
        methods: [stripeMethod, tempo.charge({ testnet })] as const,
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
    // Both SPT and crypto methods — compose them so client can choose
    handler = inst.compose(
      [inst.stripe.charge, {
        amount: options.amount,
        currency: options.currency,
        decimals: options.decimals,
        description: safeDescription,
        meta: safeMeta,
      }],
      [inst.tempo.charge, {
        amount: options.amount,
        currency: tempoCurrency,
        decimals: 6,          // USDC uses 6 decimals
        recipient: tempoRecipient,
        description: safeDescription,
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
