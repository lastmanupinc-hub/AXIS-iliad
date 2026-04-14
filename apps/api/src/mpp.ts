/**
 * Machine Payments Protocol (MPP) — mppx integration.
 *
 * Supports two payment methods:
 *   - Stripe SPT (shared payment tokens — cards, wallets, Link)
 *   - Tempo/crypto (USDC stablecoin on-chain settlement)
 *
 * When quota is exceeded, call chargeMpp() instead of returning 429.
 * The mppx library handles challenge generation (402) and credential
 * validation (200) — bridged to Node.js HTTP via Mppx.toNodeListener().
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

// ─── Public API ───────────────────────────────────────────────────

export type ChargeOptions = {
  /** Amount in smallest currency unit as a string, e.g. "50" for $0.50 USD, "3900" for $39.00 USD.
   *  Stripe receives this as Number(amount) — must be a non-zero positive integer (cents for USD). */
  amount: string;
  /** ISO 4217 currency code, e.g. "usd". */
  currency: string;
  /** Decimal precision for display (2 for USD). */
  decimals: number;
  /** Human-readable payment description shown to the payer. */
  description?: string;
  /** Server-defined metadata embedded in the challenge. Clients MUST NOT modify. */
  meta?: Record<string, string>;
};

export type MppResult = { status: 402 | 200 };

// ─── Budget Negotiation ───────────────────────────────────────────

export interface AgentBudget {
  budget_per_run_cents?: number;
  spending_window?: "per_call" | "hourly" | "daily" | "monthly";
  max_monthly_cents?: number;
  wallet_id?: string;
  agent_type?: string;
}

export interface PricingTier {
  tool: string;
  standard_cents: number;
  lite_cents: number;
  lite_description: string;
}

const PRICING_TIERS: Record<string, PricingTier> = {
  prepare_for_agentic_purchasing: {
    tool: "prepare_for_agentic_purchasing",
    standard_cents: 50,
    lite_cents: 25,
    lite_description: "Lite mode: purchasing readiness score + top 3 gaps only (no full artifact bundle)",
  },
  analyze_repo: {
    tool: "analyze_repo",
    standard_cents: 50,
    lite_cents: 15,
    lite_description: "Lite mode: search/skills/debug programs only (3 of 18 programs)",
  },
  analyze_files: {
    tool: "analyze_files",
    standard_cents: 50,
    lite_cents: 15,
    lite_description: "Lite mode: search/skills/debug programs only (3 of 18 programs)",
  },
  improve_my_agent_with_axis: {
    tool: "improve_my_agent_with_axis",
    standard_cents: 50,
    lite_cents: 20,
    lite_description: "Lite mode: improvement plan only (no full artifact generation)",
  },
  default: {
    tool: "default",
    standard_cents: 50,
    lite_cents: 25,
    lite_description: "Lite mode: reduced output scope",
  },
};

export function getPricingTier(tool: string): PricingTier {
  return PRICING_TIERS[tool] ?? PRICING_TIERS.default;
}

export function negotiatePrice(
  budget: AgentBudget,
  tool: string,
): { amount_cents: number; mode: "standard" | "lite"; accepted: boolean; reason: string } {
  const tier = getPricingTier(tool);

  if (!budget.budget_per_run_cents && budget.budget_per_run_cents !== 0) {
    return { amount_cents: tier.standard_cents, mode: "standard", accepted: true, reason: "No budget constraint — standard pricing." };
  }

  if (budget.budget_per_run_cents >= tier.standard_cents) {
    return { amount_cents: tier.standard_cents, mode: "standard", accepted: true, reason: "Budget meets standard price." };
  }

  if (budget.budget_per_run_cents >= tier.lite_cents) {
    return { amount_cents: tier.lite_cents, mode: "lite", accepted: true, reason: tier.lite_description };
  }

  return {
    amount_cents: tier.lite_cents,
    mode: "lite",
    accepted: false,
    reason: `Minimum price is $${(tier.lite_cents / 100).toFixed(2)} (lite). Budget of $${(budget.budget_per_run_cents / 100).toFixed(2)} is below minimum.`,
  };
}

export function build402NegotiationBody(tool: string, budget?: AgentBudget): Record<string, unknown> {
  const tier = getPricingTier(tool);
  const negotiation = budget ? negotiatePrice(budget, tool) : null;

  return {
    pricing: {
      standard: { amount_cents: tier.standard_cents, currency: "usd", description: `Full ${tool} run with all artifacts` },
      lite: { amount_cents: tier.lite_cents, currency: "usd", description: tier.lite_description },
    },
    negotiation: negotiation ?? {
      amount_cents: tier.standard_cents,
      mode: "standard",
      accepted: true,
      reason: "No budget provided — standard pricing applies. Pass budget_per_run_cents to negotiate.",
    },
    actions: {
      accept: "Retry with MPP payment credential at the negotiated amount",
      counter: "Re-send with X-Agent-Budget header: {budget_per_run_cents, spending_window}",
      switch_lite: `Re-send with X-Agent-Mode: lite to get reduced output at $${(tier.lite_cents / 100).toFixed(2)}`,
      get_free: "Call discover_agentic_commerce_tools or discover_agentic_purchasing_needs (no auth, no cost)",
    },
    free_alternatives: [
      "list_programs — enumerate all 18 programs",
      "search_and_discover_tools — keyword search (no auth)",
      "discover_agentic_commerce_tools — full ecosystem overview (no auth)",
      "discover_agentic_purchasing_needs — intent-based tool matching (no auth)",
      "POST /probe-intent — REST intent probe (no auth)",
    ],
    compliance_value: {
      what_you_get: "Single-call Visa-grade agentic compliance kit — deterministic, no PCI scope, no runtime API calls",
      includes: [
        "CE 3.0 (Compelling Evidence) auto-assembly — dispute win rates from 30% to 72% on CNP fraud",
        "Win probability model — per-reason-code Visa dispute optimization with agent decision matrix",
        "Lighter SCA exemption tree — 7-priority decision path, 0ms latency vs 200-800ms Visa IC pilot",
        "TAP (Token Action Protocol) lifecycle — provisioning, lifecycle management, domain control",
        "AP2/UCP/Visa IC compliance checklist — autonomous checkout readiness",
        "VROL/RDR/CDRN pre-dispute deflection paths",
      ],
      vs_visa_ic_pilot: {
        axis: { api_calls: 0, latency_ms: 0, pci_scope: "none", price: "$0.50/run (one-time)", output: "deterministic artifacts" },
        visa_ic: { api_calls: "3-5 per transaction", latency_ms: "200-800", pci_scope: "required", price: "per-call pricing", output: "runtime responses" },
      },
    },
    incentives: {
      referral: {
        enabled: true,
        earn_cents_per_unique_share: 0.1,
        cap_cents_per_call: 20,
        reset_days: 30,
        how: "Include referral_token in prepare_for_agentic_purchasing args",
      },
      onboarding: {
        fifth_paid_call_free: true,
      },
    },
  };
}

export function parseAgentBudget(req: IncomingMessage): AgentBudget | undefined {
  const budgetHeader = req.headers["x-agent-budget"];
  if (!budgetHeader || typeof budgetHeader !== "string") return undefined;
  try {
    const parsed = JSON.parse(budgetHeader) as Record<string, unknown>;
    const budget: AgentBudget = {};
    if (typeof parsed.budget_per_run_cents === "number" && parsed.budget_per_run_cents >= 0) {
      budget.budget_per_run_cents = Math.floor(parsed.budget_per_run_cents);
    }
    const validWindows = new Set(["per_call", "hourly", "daily", "monthly"]);
    if (typeof parsed.spending_window === "string" && validWindows.has(parsed.spending_window)) {
      budget.spending_window = parsed.spending_window as AgentBudget["spending_window"];
    }
    if (typeof parsed.max_monthly_cents === "number" && parsed.max_monthly_cents >= 0) {
      budget.max_monthly_cents = Math.floor(parsed.max_monthly_cents);
    }
    if (typeof parsed.wallet_id === "string" && parsed.wallet_id.length <= 200) {
      budget.wallet_id = parsed.wallet_id;
    }
    if (typeof parsed.agent_type === "string" && parsed.agent_type.length <= 100) {
      budget.agent_type = parsed.agent_type;
    }
    return budget;
  } catch {
    return undefined;
  }
}

export function resolveAgentMode(req: IncomingMessage): "standard" | "lite" {
  const mode = req.headers["x-agent-mode"];
  return mode === "lite" ? "lite" : "standard";
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
/** Strip non-ASCII characters that break HTTP ByteString headers (undici). */
function toAscii(str: string): string {
  return str.replace(/[–—]/g, "-").replace(/[""'']/g, '"').replace(/…/g, "...");
}

export async function chargeMpp(
  req: IncomingMessage,
  res: ServerResponse,
  options: ChargeOptions,
): Promise<MppResult | null> {
  const inst = getMppx();
  if (!inst) return null;

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
    console.error(`[MPP] charge failed - ${safeDescription ?? "AXIS API credit"}:`, err);
    return null;          // treat MPP failure as "not configured" so caller sends 402
  }
  /* v8 ignore next 6 */
  if (result.status === 402) {
    console.log(`[MPP] 402 challenge issued - ${safeDescription ?? "AXIS API credit"}`);
  } else if (result.status === 200) {
    console.log(`[MPP] 200 payment validated - ${safeDescription ?? "AXIS API credit"}`);
  }
  return result;
}

/** Resets the cached mppx instance. Call in tests after changing env vars. */
export function resetMppxCache(): void {
  _cache = null;
}
