/**
 * @axis/mpp — Machine Payments Protocol (MPP) utilities
 *
 * Pure-protocol layer for x402/MPP budget negotiation. Drop this into any
 * Node.js HTTP server to speak the Axis agent-commerce protocol:
 *
 *   1. Parse incoming X-Agent-Budget / X-Agent-Mode headers
 *   2. Negotiate a price the agent can afford
 *   3. Build a 402 body the agent can parse and act on
 *
 * For Stripe/crypto charging, use the server-side `chargeMpp()` in `@axis/api`
 * (which depends on the `mppx` runtime library).
 *
 * @example
 * ```ts
 * import { parseAgentBudget, negotiatePrice, build402NegotiationBody } from "@axis/mpp";
 *
 * const budget = parseAgentBudget(req);
 * const { amount_cents, mode, accepted } = negotiatePrice(budget ?? {}, "analyze_repo");
 * if (!accepted) {
 *   res.writeHead(402, { "Content-Type": "application/json" });
 *   res.end(JSON.stringify(build402NegotiationBody("analyze_repo", budget)));
 * }
 * ```
 */

import type { IncomingMessage } from "node:http";

// ─── Types ────────────────────────────────────────────────────────

export type ChargeOptions = {
  /** Amount in smallest currency unit as a string, e.g. "50" for $0.50 USD. */
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

export interface Build402Options {
  message?: string;
  referral_token?: string | null;
}

// ─── Pricing Registry ─────────────────────────────────────────────

export const PRICING_TIERS: Record<string, PricingTier> = {
  prepare_agentic_purchasing: {
    tool: "prepare_agentic_purchasing",
    standard_cents: 50,
    lite_cents: 25,
    lite_description: "Lite mode: purchasing readiness score + top 3 gaps only (no full artifact bundle)",
  },
  analyze_repo: {
    tool: "analyze_repo",
    standard_cents: 50,
    lite_cents: 15,
    lite_description: "Lite mode: search/skills/debug programs only (3 of 19 programs)",
  },
  analyze_files: {
    tool: "analyze_files",
    standard_cents: 50,
    lite_cents: 15,
    lite_description: "Lite mode: search/skills/debug programs only (3 of 19 programs)",
  },
  improve_my_agent_with_axis: {
    tool: "improve_my_agent_with_axis",
    standard_cents: 50,
    lite_cents: 20,
    lite_description: "Lite mode: improvement plan only (no full artifact generation)",
  },
  // Strategy 1: x402/MCP Gateway (agent-to-agent commerce infrastructure)
  mcp_gateway_snapshot: {
    tool: "mcp_gateway_snapshot",
    standard_cents: 15,
    lite_cents: 9,
    lite_description: "Lite mode: gateway routing + auth only (no call logs, no analytics)",
  },
  // Strategy 2: Codebase Intelligence API (per-push CI snapshot)
  ci_snapshot: {
    tool: "ci_snapshot",
    standard_cents: 50,
    lite_cents: 25,
    lite_description: "Lite mode: compliance grade + AGENTS.md + CLAUDE.md only (no full 18-program bundle)",
  },
  // Strategy 3: Compliance Artifact Compiler (fintech CI gate)
  compliance_check: {
    tool: "compliance_check",
    standard_cents: 50,
    lite_cents: 15,
    lite_description: "Lite mode: compliance grade (A/B/C/D) + top 3 SCA exemptions + CE 3.0 score only",
  },
  // Phase 1: Firecrawl web research proxy (per-page pricing)
  iliad_web_research: {
    tool: "iliad_web_research",
    standard_cents: 10,
    lite_cents: 5,
    lite_description: "Lite mode: markdown only (no structured data extraction)",
  },
  iliad_web_research_crawl: {
    tool: "iliad_web_research_crawl",
    standard_cents: 25,
    lite_cents: 12,
    lite_description: "Lite mode: crawl up to 5 pages (standard allows up to 100)",
  },
  // ─── AXIS-owned iliad_* tools ───────────────────────────────
  // Marginal compute cost is near-zero (HMAC signing, in-process
  // SQLite). Pricing reflects operational overhead + quota
  // amortization, not per-call infra. Lite tier is free so RAG
  // pipelines that chain embeddings → vector_database → object_storage
  // stay cheap end-to-end.
  iliad_object_storage: {
    tool: "iliad_object_storage",
    standard_cents: 1,
    lite_cents: 0,
    lite_description: "Free tier: signed URL with 1h TTL cap (standard allows up to 24h).",
  },
  iliad_vector_database: {
    tool: "iliad_vector_database",
    standard_cents: 1,
    lite_cents: 0,
    lite_description: "Free tier: top_k capped at 10 + 1k vectors per namespace (standard allows top_k 100 / 10k vectors).",
  },
  // ─── AXIS-branded proxies (real provider cost upstream) ─────
  // OpenAI embeddings: $0.02 per 1M tokens for text-embedding-3-small.
  // Typical agent batch (10-100 short strings ≈ 1k tokens) → real
  // cost ~$0.00002/call. AXIS markup absorbs the auth + rate-limit
  // surface so customers don't manage OPENAI_API_KEY directly.
  iliad_embeddings: {
    tool: "iliad_embeddings",
    standard_cents: 5,
    lite_cents: 2,
    lite_description: "Lite mode: single-string input only (standard allows batches up to 2048).",
  },
  // Resend transactional: $0.0004/email beyond free 3k/mo tier.
  // AXIS markup covers DKIM/SPF setup + suppression-list management
  // + the From-address verification cycle.
  iliad_transactional_email: {
    tool: "iliad_transactional_email",
    standard_cents: 2,
    lite_cents: 1,
    lite_description: "Lite mode: single recipient + plaintext body only (standard allows up to 50 recipients + HTML).",
  },
  // AXIS-owned analytics: pure SQLite on the existing snapshot DB, so
  // marginal cost per call is the index lookup + JSON serialization.
  // Standard price covers the storage amortization; lite mode is free
  // so high-volume capture pipelines stay cheap end-to-end.
  iliad_analytics: {
    tool: "iliad_analytics",
    standard_cents: 1,
    lite_cents: 0,
    lite_description: "Free tier: capture batch capped at 50 + query limit capped at 25 (standard allows batch 500 + limit 1000).",
  },
  default: {
    tool: "default",
    standard_cents: 50,
    lite_cents: 25,
    lite_description: "Lite mode: reduced output scope",
  },
};

export const LEGACY_TOOL_ALIASES: Record<string, string> = {
  prepare_for_agentic_purchasing: "prepare_agentic_purchasing",
  mcp_gateway: "mcp_gateway_snapshot",
  gateway_snapshot: "mcp_gateway_snapshot",
  snapshot: "ci_snapshot",
  push_snapshot: "ci_snapshot",
  compliance: "compliance_check",
  compliance_gate: "compliance_check",
  compliance_audit: "compliance_check",
};

// ─── Core Functions ───────────────────────────────────────────────

/** Look up the canonical pricing tier for a tool name, resolving legacy aliases. */
export function getPricingTier(tool: string): PricingTier {
  const canonicalTool = LEGACY_TOOL_ALIASES[tool] ?? tool;
  return PRICING_TIERS[canonicalTool] ?? PRICING_TIERS.default;
}

/** Compute the best price given an agent budget and tool. Returns accepted=false when budget is below minimum. */
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

/**
 * Build the 402 Payment Required response body for an agent to parse.
 * Includes full x402 negotiation block, pricing, Visa compliance value
 * description, and next-step guidance.
 *
 * `options.referral_token` — pass the referral token from your account to
 * enable micro-discount earning for the caller.
 */
export function build402NegotiationBody(
  tool: string,
  budget?: AgentBudget,
  options: Build402Options = {},
): Record<string, unknown> {
  const tier = getPricingTier(tool);
  const negotiation = budget ? negotiatePrice(budget, tool) : null;
  const paymentRecipient = process.env.TEMPO_RECIPIENT_ADDRESS ?? null;
  const paymentNetwork = process.env.TEMPO_TESTNET === "true" ? "base-sepolia" : "base";
  const acceptedPaymentSchemes = [
    "mppx/stripe",
    ...(paymentRecipient ? ["mppx/tempo", `x402/usdc/${paymentNetwork}`] : []),
  ];
  const friendlyMessage = options.message ?? `${tool} requires $${(tier.standard_cents / 100).toFixed(2)} MPP credit (or Pro tier) to continue.`;

  return {
    error: "Payment Required",
    message: friendlyMessage,
    price: (tier.standard_cents / 100).toFixed(2),
    currency: "USD",
    lite_price: (tier.lite_cents / 100).toFixed(2),
    action: "Upgrade or add credits to continue",
    accepted_payment_schemes: acceptedPaymentSchemes,
    referral_token: options.referral_token ?? null,
    // Direct links for agents to surface to the user or use autonomously
    payment_url: `${process.env.WEB_BASE_URL ?? "https://axis-iliad.jonathanarvay.com"}/billing`,
    checkout_url: `${process.env.WEB_BASE_URL ?? "https://axis-iliad.jonathanarvay.com"}/billing#checkout-paid`,
    go_pro_url: "https://axis-iliad.jonathanarvay.com/billing",
    retry_after_payment: "After payment completes, re-send the original request with your API key in Authorization: Bearer <key>. No additional steps required — the server processes it immediately.",
    x402: {
      amount: String(tier.standard_cents * 10_000),
      asset: "USDC",
      network: paymentNetwork,
      payTo: paymentRecipient,
    },
    agent_message: "AXIS can complete this request after payment. Retry with an MPP credential, switch to lite mode, or stay on the free discovery tools first.",
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
      get_free: "Call discover_commerce_tools or discover_agentic_purchasing_needs (no auth, no cost)",
    },
    next_step: {
      immediate: `Pay $${(tier.standard_cents / 100).toFixed(2)} for the full ${tool} run, or switch to lite at $${(tier.lite_cents / 100).toFixed(2)} if the budget is tighter.`,
      retry_headers: {
        budget: 'X-Agent-Budget: {"budget_per_run_cents":25,"spending_window":"per_call"}',
        lite: "X-Agent-Mode: lite",
      },
      upgrade_path: "Upgrade to Pro for unlimited full-bundle calls at $29/month.",
    },
    free_alternatives: [
      "list_programs — enumerate all 18 programs",
      "search_and_discover_tools — keyword search (no auth)",
      "discover_commerce_tools — full ecosystem overview (no auth)",
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
        applies_to: "token_usage",
        reward_millicents_per_unique_share: 1,
        max_token_usage_reduction_rate: 0.0002,
        reset_basis: "billing_cycle",
        how: "Include referral_token in prepare_agentic_purchasing args",
      },
      onboarding: {
        fifth_paid_call_free: true,
      },
    },
    conversion_hint: "Every paid AXIS response returns a referral_token. Share it with other agents to earn credits on future paid calls.",
  };
}

/**
 * Parse the X-Agent-Budget header from an incoming Node.js request.
 * Returns undefined if the header is absent or malformed.
 */
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

/** Read X-Agent-Mode header. Returns "lite" or "standard". */
export function resolveAgentMode(req: IncomingMessage): "standard" | "lite" {
  const mode = req.headers["x-agent-mode"];
  return mode === "lite" ? "lite" : "standard";
}
