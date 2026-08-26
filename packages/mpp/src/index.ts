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
  /**
   * Optional premium "engineer" tier — the over-the-top, deep+novel mode for a
   * tool (X-Agent-Mode: engineer). Tools without it fall back to standard, so
   * sending the flag is always safe. See V1_ROI_CANDIDATES.md → Tier E.
   */
  engineer_cents?: number;
  engineer_description?: string;
}

/**
 * The x402 foundation's "Bazaar" discovery extension (specs/extensions/bazaar.md,
 * github.com/x402-foundation/x402) -- the REAL, spec-defined discovery mechanism.
 * Verified against the foundation's own TypeScript types
 * (typescript/packages/extensions/src/bazaar/mcp/types.ts): resource servers do
 * NOT host a well-known discovery path -- discovery info instead rides inside
 * the 402 response body itself, and facilitators catalog it from there. This
 * package stays dependency-free (see PRICING_TIERS's own comment below), so the
 * caller supplies the tool's real MCP catalog entry rather than this module
 * looking one up itself.
 */
export interface Build402BazaarInfo {
  /** The MCP tool name exactly as registered in tools/list. */
  toolName: string;
  description?: string;
  /** The tool's REAL JSON Schema (from its MCP_TOOLS catalog entry) -- required by the spec; never fabricate one. */
  inputSchema: Record<string, unknown>;
  example?: Record<string, unknown>;
  output?: { example?: unknown };
}

export interface Build402Options {
  message?: string;
  referral_token?: string | null;
  /** Omitted entirely when absent -- never emit a bazaar block with a fabricated inputSchema. */
  bazaar?: Build402BazaarInfo;
  /**
   * Override the tool's static PRICING_TIERS lookup with a dynamically
   * computed price (e.g. computeLargeBodySurchargeCents below) -- used for
   * standard AND lite (a per-call unlock has no natural "lite" discount to
   * offer). Omit to use the normal getPricingTier(tool) lookup.
   */
  priceOverrideCents?: number;
}

// ─── Pricing Registry ─────────────────────────────────────────────

// Program totals in lite_description copy ("N of M programs") are pinned — this
// package is dependency-free by design, so it must not import
// @axis/generator-core. apps/api's count-honesty.test.ts parses this file and
// fails CI if they drift from TOTAL_PROGRAMS.
export const PRICING_TIERS: Record<string, PricingTier> = {
  prepare_agentic_purchasing: {
    tool: "prepare_agentic_purchasing",
    standard_cents: 300,
    lite_cents: 100,
    lite_description: "Lite mode: purchasing readiness score + top 3 gaps only (no full artifact bundle)",
    engineer_cents: 25000,
    engineer_description: "Engineer mode (Commerce Integration): a deployable x402/AP2/PAI'D endpoint + runnable sandbox test + schema-validatable CE 3.0 pack + transparent dispute-readiness score — a working integration, not just a score.",
  },
  analyze_repo: {
    tool: "analyze_repo",
    standard_cents: 300,
    lite_cents: 0,
    lite_description: "Lite mode is RETIRED — it now returns exactly the free artifact set at no charge. Use the free tier instead; it delivers more than lite ever did.",
    engineer_cents: 2500,
    engineer_description: "Engineer mode (Living Architecture): a verified LLM specificity pass — every architectural claim is grounded in the repo's extracted facts or dropped (analyze_repo additionally gets push-triggered PR drift mode).",
  },
  analyze_files: {
    tool: "analyze_files",
    standard_cents: 300,
    lite_cents: 0,
    lite_description: "Lite mode is RETIRED — it now returns exactly the free artifact set at no charge. Use the free tier instead; it delivers more than lite ever did.",
    engineer_cents: 2500,
    engineer_description: "Engineer mode (Living Architecture): a verified LLM specificity pass — every architectural claim is grounded in the repo's extracted facts or dropped (analyze_repo additionally gets push-triggered PR drift mode).",
  },
  closer: {
    tool: "closer",
    standard_cents: 100,
    lite_cents: 100,
    lite_description: "Lite mode offers no discount here: the packaging bundle is identical in both modes, so a lower lite price would just be a standing coupon. Priced the same as standard.",
  },
  deploy: {
    tool: "deploy",
    standard_cents: 100,
    lite_cents: 100,
    lite_description: "Lite mode offers no discount here: the deploy bundle is identical in both modes, so a lower lite price would just be a standing coupon. Priced the same as standard.",
  },
  // H-Phase-A cycle 10: removed a dead improve_my_agent_with_axis entry here
  // (standard_cents: 50, lite_cents: 20) — that tool is unconditionally free
  // (not in METERED_MCP_TOOL_SET; runImproveMyAgent never calls a charge
  // function or reads a PRICING_TIERS row for its own name), so the entry
  // was inert: no live code path ever read it. Flagged by this cycle's own
  // audit as "structurally identical to the seed data that produced 3 of
  // the last 9 cycles' bugs" — deleted outright rather than left as bait.
  // WO-08 dispute lifecycle: CE 3.0 qualification over the caller's supplied
  // transaction history + Stripe representment-evidence assembly + state-machine
  // bookkeeping. Priced like the other high-value commerce calls; assembly is
  // pure compute, the optional Stripe submission is the caller's own account.
  assemble_representment: {
    tool: "assemble_representment",
    standard_cents: 100,
    lite_cents: 50,
    lite_description: "Lite mode: CE 3.0 qualification + evidence hash only (no auto-submit to the Stripe disputes API)",
  },
  // Phase 1: Firecrawl web research proxy (per-page pricing)
  iliad_web_research: {
    tool: "iliad_web_research",
    standard_cents: 10,
    lite_cents: 10,
    lite_description: "Lite mode offers no discount here: the markdown output is identical in both modes (no enforced cap in lite-caps.ts), so a lower lite price would just be a standing coupon. Priced the same as standard.",
  },
  iliad_web_research_crawl: {
    tool: "iliad_web_research_crawl",
    // 1¢/page floor — billed only for pages beyond the 100/month free pool
    // (account_free_scrape_pool). Undercuts Firecrawl-direct to pull crawl
    // traffic onto AXIS, where the 24h shared cache further bounds wholesale cost.
    standard_cents: 1,
    lite_cents: 1,
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
    engineer_cents: 5,
    engineer_description: "Engineer mode (Managed Bucket): full lifecycle (list/copy/delete) + content-addressed dedup keys + mint-time content-type/size policy.",
  },
  iliad_vector_database: {
    tool: "iliad_vector_database",
    standard_cents: 1,
    lite_cents: 0,
    lite_description: "Free tier: top_k capped at 10 + 1k vectors per namespace (standard allows top_k 100 / 10k vectors).",
    engineer_cents: 5,
    engineer_description: "Engineer mode (Managed Memory): pgvector/HNSW ANN + recency-decay reranking (managed forgetting) + RRF hybrid fusion + semantic-dedup on upsert.",
  },
  // AXIS-owned embeddings (WO-11): in-process inference via
  // node-llama-cpp + an embedding-capable GGUF (default backend) — no
  // upstream per-token API fee on the local path; real marginal cost is
  // CPU milliseconds per input. The optional OpenAI backend
  // (AXIS_EMBEDDING_BACKEND=openai) costs ~$0.00002/call upstream
  // (text-embedding-3-small, typical 1k-token batch). Standard price
  // covers compute amortization + the batch surface either way.
  iliad_embeddings: {
    tool: "iliad_embeddings",
    standard_cents: 5,
    lite_cents: 2,
    lite_description: "Lite mode: single-string input only (standard allows batches up to 2048).",
    engineer_cents: 8,
    engineer_description: "Engineer mode (Domain Embeddings): Matryoshka dimension truncation (cheaper/smaller vectors) + a per-corpus mean-centering adapter that sharpens retrieval on the caller's own data — returns the fitted mean for query alignment. Engineer vectors are L2-normalized (standard returns raw backend vectors).",
  },
  // ─── AXIS-branded proxies (real provider cost upstream) ─────
  // Resend transactional: $0.0004/email beyond free 3k/mo tier.
  // AXIS markup covers DKIM/SPF setup + suppression-list management
  // + the From-address verification cycle.
  iliad_transactional_email: {
    tool: "iliad_transactional_email",
    standard_cents: 2,
    lite_cents: 1,
    lite_description: "Lite mode: single recipient + plaintext body only (standard allows up to 50 recipients + HTML).",
    engineer_cents: 50,
    engineer_description: "Engineer mode (Deliverability): pass a `domain` to generate a full SPF/DKIM/DMARC setup (with a fresh DKIM keypair) + sender warmup schedule + verification checklist — deliverability engineering, not just a send.",
  },
  // AXIS-owned analytics: pure SQLite on the existing snapshot DB, so
  // marginal cost per call is the index lookup + JSON serialization.
  // Standard price covers the storage amortization; lite mode is free
  // so high-volume capture pipelines stay cheap end-to-end.
  iliad_analytics: {
    tool: "iliad_analytics",
    standard_cents: 1,
    lite_cents: 0,
    lite_description: "Free tier: capture batches above 50 are rejected + query limit capped at 25 (standard allows batch 500 + limit 1000).",
  },
  // AXIS-hosted LLM: in-process inference via node-llama-cpp + a
  // small GGUF model. Real marginal cost is CPU seconds (2-15s per
  // 100 tokens on the recommended picks), not a per-token API fee.
  // Standard price covers compute amortization; lite tier caps
  // max_tokens at 256 to keep per-call CPU time bounded.
  iliad_llm_inference: {
    tool: "iliad_llm_inference",
    standard_cents: 2,
    lite_cents: 1,
    lite_description: "Lite mode: max_tokens capped at 256 + temperature locked at 0 for cheaper, more deterministic output.",
    engineer_cents: 10,
    engineer_description: "Engineer mode (Constrained Inference): decoding is grammar-constrained to your json_schema AND the output is validated against it — guaranteed-valid structured output, in-process.",
  },
  // AXIS-owned code sandbox: ephemeral Docker container per call.
  // Real marginal cost is the spawn/teardown overhead (1-2s cold)
  // plus the wall-clock the user's code runs. Higher tier than
  // llm_inference because every call materializes a full container
  // rather than amortizing a long-loaded model. Lite tier caps
  // timeout at 10s so cheap probes can't tie up a worker for the
  // full 600s ceiling.
  iliad_code_sandbox: {
    tool: "iliad_code_sandbox",
    standard_cents: 5,
    lite_cents: 2,
    lite_description: "Lite mode: timeout_seconds capped at 10 (standard allows up to 600) + python/bash only (no node).",
    engineer_cents: 25,
    engineer_description: "Engineer mode (Verified Exec): an Ed25519-signed attestation binding code-hash → output-hash + a per-account hash-chain entry, so another agent that pins AXIS's published key can verify the result without re-running it.",
  },
  // AXIS-owned audio transcription via whisper.cpp + ffmpeg-static.
  // CPU-bound inference but throughput is reasonable (base.en runs
  // ~1× realtime on a modern CPU). Standard covers the resample +
  // model-load + transcription chain; lite tier caps audio at 60s
  // so cheap probes can't tie up a worker on a long podcast.
  iliad_speech_to_text: {
    tool: "iliad_speech_to_text",
    standard_cents: 3,
    lite_cents: 1,
    lite_description: "Lite mode: audio capped at 60 seconds (standard allows up to 30 minutes) + word_timestamps disabled.",
    engineer_cents: 10,
    engineer_description: "Engineer mode (Diarization): groups the transcript into speaker turns by inter-segment pause gaps (pause-based turn segmentation).",
  },
  // AXIS-owned voice synthesis via Piper + ffmpeg-static. Piper is
  // fast on CPU (~10× realtime for medium voices), so per-call cost
  // is dominated by the spawn + WAV write + optional transcode
  // rather than the synthesis itself. Lite tier locks to WAV (no
  // ffmpeg) + caps text at 500 chars to keep wall-clock bounded.
  iliad_text_to_speech: {
    tool: "iliad_text_to_speech",
    standard_cents: 2,
    lite_cents: 1,
    lite_description: "Lite mode: text capped at 500 chars + format locked to wav (standard allows up to 5000 chars + mp3/opus transcode).",
    engineer_cents: 10,
    engineer_description: "Engineer mode (Brand Voice): auto-derives a voice persona (Piper voice + sentence pacing) from a brand / voice-and-tone artifact and synthesizes in it.",
  },
  // AXIS-owned BM25 search over the account's indexed corpus. Pure
  // SQLite + JS — no external API call, no provider fee. Per-query
  // cost is dominated by the table scan + BM25 math (~sub-ms for
  // ≤1k docs, single-digit ms for ≤10k). Indexing is free; only
  // search ops are priced. Lite tier caps max_results at 10.
  iliad_web_search: {
    tool: "iliad_web_search",
    standard_cents: 1,
    lite_cents: 0,
    lite_description: "Free tier: max_results capped at 10 (standard allows up to 100). Indexing is always free.",
    engineer_cents: 25,
    engineer_description: "Engineer mode (Answer Engine): returns a grounded extractive answer with [n] citation spans over your corpus, lexically reranked, refusing on weak evidence — a private Perplexity over the documents you indexed.",
  },
  // AXIS-owned document parser: pdfjs-dist for PDF + mammoth for
  // DOCX + pure JS for HTML/text/markdown. All parsing happens
  // in-process — no external API, no per-page fee. Lite tier caps
  // input at 5 MiB to keep CPU bounded; standard goes up to 50 MiB.
  iliad_document_parsing: {
    tool: "iliad_document_parsing",
    standard_cents: 2,
    lite_cents: 1,
    lite_description: "Lite mode: input capped at 5 MiB (standard allows up to 50 MiB) + markdown output capped at 256 KiB (standard caps at 1 MiB).",
    engineer_cents: 10,
    engineer_description: "Engineer mode (Document Intelligence): retrieval chunking + extract-to-caller-schema (grammar-constrained + validated) + image OCR — typed data, not just markdown.",
  },
  // AXIS-owned workspace hygiene grader. scan mode is FREE (always); only the
  // fix mode (remediation plan) is metered. Cheap — pure in-process analysis.
  iliad_hygiene: {
    tool: "iliad_hygiene",
    standard_cents: 5,
    lite_cents: 2,
    lite_description: "Lite mode: remediation plan returns ordered steps + .gitignore additions only (standard adds full per-finding detail). Scan mode is always free.",
    engineer_cents: 500,
    engineer_description: "Engineer mode (Security Engineer): the fix as a git-applyable unified-diff patch (.gitignore auto-fixes) + a SARIF 2.1.0 log of all findings for CI code-scanning gates.",
  },
  // x402 onboarding program, Phase 1: a free, zero-risk payment-flow probe.
  // Exercises the REAL 402 challenge -> retry-with-credential -> success loop,
  // so an agent (or a human with curl) learns the exact vocabulary it will reuse
  // for every real paid tool at real prices.
  //
  // Priced at one cent (2026-07-28), not $0. It was free, and free made an
  // unauthenticated endpoint that costs us per call something anyone could run
  // up without limit. A nominal price makes each call carry its own weight
  // while staying far below any tool worth abusing it to avoid.
  //
  // This was shipped at 0.5 (half a cent) first and reverted the same day: the
  // charge path (settleOverageCash -> ... -> the funnel-event insert in
  // runPingPayment, apps/api/src/mcp-tool-impls.ts) writes this value into
  // Postgres columns declared `amount_cents INTEGER NOT NULL`
  // (packages/snapshots/src/pg-schema.ts). Postgres rejects a fractional cent
  // outright: `invalid input syntax for type integer: "0.5"`. Every real call
  // to ping_payment was failing that insert in production before this system
  // as a whole was ever designed to carry sub-cent money. See
  // PRICING_TIERS_ARE_WHOLE_CENTS below — that invariant is what should catch
  // this before merge next time, not a full-regression CI run after.
  ping_payment: {
    tool: "ping_payment",
    standard_cents: 1,
    lite_cents: 1,
    lite_description: "One cent on both tiers — a nominal-cost payment-flow probe, priced the same in lite mode.",
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
};

// ─── Core Functions ───────────────────────────────────────────────

/** Look up the canonical pricing tier for a tool name, resolving legacy aliases. */
export function getPricingTier(tool: string): PricingTier {
  const canonicalTool = LEGACY_TOOL_ALIASES[tool] ?? tool;
  return PRICING_TIERS[canonicalTool] ?? PRICING_TIERS.default;
}

/**
 * Render a cents amount as a dollar string, without lying about sub-cent prices.
 *
 * The codebase formatted every price as `(cents / 100).toFixed(2)`, which is
 * correct for whole cents and wrong the moment one isn't: ping_payment's 0.5
 * cents becomes `(0.005).toFixed(2)` === "0.01", advertising a half-cent tool at
 * twice its price. Two decimals cannot represent a fraction of a cent, so this
 * widens to three ONLY when the amount actually needs it — every existing whole-
 * cent price formats byte-identically to before.
 */
export function formatCents(cents: number): string {
  return Number.isInteger(cents) ? (cents / 100).toFixed(2) : (cents / 100).toFixed(3);
}

/**
 * Compute the best price given an agent budget and tool. Returns accepted=false
 * when budget is below minimum. `tierOverride` lets a caller who already
 * resolved a dynamically-priced tier (e.g. build402NegotiationBody's
 * priceOverrideCents) skip the normal PRICING_TIERS registry lookup so the
 * negotiation math uses the SAME price it's about to display, rather than
 * silently re-deriving a different (likely PRICING_TIERS.default) one for an
 * unregistered synthetic tool name.
 */
export function negotiatePrice(
  budget: AgentBudget,
  tool: string,
  tierOverride?: PricingTier,
): { amount_cents: number; mode: "standard" | "lite"; accepted: boolean; reason: string } {
  const tier = tierOverride ?? getPricingTier(tool);

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
  const tier: PricingTier = options.priceOverrideCents !== undefined
    ? {
        tool,
        standard_cents: options.priceOverrideCents,
        lite_cents: options.priceOverrideCents,
        lite_description: `${tool} (no lite discount available)`,
      }
    : getPricingTier(tool);
  const negotiation = budget ? negotiatePrice(budget, tool, tier) : null;
  const paymentRecipient = process.env.TEMPO_RECIPIENT_ADDRESS ?? null;
  // Settlement is on the Tempo chain (chainId 4217 mainnet / 42431 testnet,
  // rpc.tempo.xyz / rpc.moderato.tempo.xyz per mppx's own defaults) — NOT
  // Base. This used to be mislabeled "base"/"base-sepolia" with a
  // "x402/usdc/base" scheme name, which would tell an agent holding real
  // Base-chain USDC to pay an address that chargeMpp only ever verifies
  // against Tempo — see docs/x402/STRATEGY.md §7 defect 5.
  const paymentNetwork = process.env.TEMPO_TESTNET === "true" ? "tempo-testnet" : "tempo";
  // Token rail leads when configured: on-chain USDC settles in seconds with no
  // card-network intermediaries and no chargeback exposure, so it is the rail
  // AXIS prefers agents to pick. Order here mirrors the wire-level challenge
  // order chargeMpp emits (mppx compose lists tempo first); a client
  // Accept-Payment header still overrides server preference per protocol.
  // "mppx/tempo" (not "x402/...") because this rail does not speak the
  // x402.org wire protocol (no facilitator, no CAIP-2 network id) — it is
  // mppx's own protocol, honestly labeled as such.
  const usdcScheme = "mppx/tempo";
  const acceptedPaymentSchemes = paymentRecipient
    ? [usdcScheme, "mppx/stripe"]
    : ["mppx/stripe"];
  const preferredPaymentScheme = paymentRecipient ? usdcScheme : "mppx/stripe";
  const standardUsd = (tier.standard_cents / 100).toFixed(2);

  const liteUsd = (tier.lite_cents / 100).toFixed(2);
  // A lite price of 0 means lite is RETIRED for this tool (it returns the free
  // artifact set), and lite == standard means lite carries no discount. Neither
  // should render as "($0.00 lite)" — that advertises a paid tier costing nothing.
  const liteSuffix =
    tier.lite_cents === 0
      ? " (lite retired — returns the free artifact set at no charge)"
      : tier.lite_cents === tier.standard_cents
        ? " (lite priced the same — identical output)"
        : ` ($${liteUsd} lite)`;
  // Per-rail economics, stated explicitly so an agent can evaluate rails
  // without human help. The AGENT-FACING price is identical on every rail
  // (the listed price is all-in — AXIS adds no per-rail surcharge, and per
  // card-network steering rules any future differential must be framed as a
  // token-rail DISCOUNT, never a card surcharge). The rails differ in
  // settlement mechanics and processing overhead — card processing carries a
  // percentage + fixed fee (Stripe's published standard card rate is
  // 2.9% + $0.30, which at micro-transaction scale consumes the majority of
  // a $0.50 payment), while an on-chain USDC transfer carries network gas
  // only. That fee asymmetry is WHY the token rail is preferred and what
  // keeps list prices at these levels. Prices derive from the pricing
  // registry above; the card-fee figure is Stripe's published standard rate,
  // attributed as such — nothing here is estimated or invented.
  const paymentRails = [
    ...(paymentRecipient
      ? [
          {
            scheme: usdcScheme,
            asset: "USDC",
            network: paymentNetwork,
            price_usd: standardUsd,
            lite_price_usd: liteUsd,
            summary: `USDC on ${paymentNetwork} @ $${standardUsd} per ${tool} call${liteSuffix}`,
            settlement: "on-chain, deterministic finality in seconds",
            intermediaries: "none — direct to recipient address",
            chargeback_exposure: "none (on-chain settlement is final)",
            surcharge: "none — listed price is the full cost",
            processing_overhead: "network gas only — no percentage fee, no fixed fee",
            why_preferred: "no card-processing fee overhead — at micro-transaction scale this is the economically efficient rail, and it is what keeps these list prices low",
            preferred: true,
          },
        ]
      : []),
    {
      scheme: "mppx/stripe",
      asset: "USD",
      network: "card",
      price_usd: standardUsd,
      lite_price_usd: liteUsd,
      summary: `Card/Link via Stripe @ $${standardUsd} per ${tool} call${liteSuffix}`,
      settlement: "card-network authorization + capture",
      intermediaries: "card network + issuing bank",
      chargeback_exposure: "standard card-network dispute rules apply",
      surcharge: "none — listed price is the full cost",
      processing_overhead: "percentage + fixed fee per card transaction (Stripe's published standard card rate: 2.9% + $0.30)",
      preferred: !paymentRecipient,
    },
  ];
  const friendlyMessage = options.message ?? `${tool} requires $${standardUsd} MPP credit (or Pro tier) to continue.`;

  return {
    error: "Payment Required",
    message: friendlyMessage,
    price: standardUsd,
    currency: "USD",
    lite_price: liteUsd,
    action: "Upgrade or add credits to continue",
    // Token/USDC first when configured — see paymentRails above for why.
    accepted_payment_schemes: acceptedPaymentSchemes,
    preferred_payment_scheme: preferredPaymentScheme,
    payment_rails: paymentRails,
    x402: {
      amount: String(tier.standard_cents * 10_000),
      asset: "USDC",
      network: paymentNetwork,
      payTo: paymentRecipient,
    },
    referral_token: options.referral_token ?? null,
    // Direct links for agents to surface to the user or use autonomously.
    // H2.5: `upgrade_url` is the CANONICAL pointer name — every payment/quota
    // surface across REST and MCP includes it (some also keep older sibling
    // names below for back-compat; none of those are removed or renamed).
    payment_url: `${process.env.WEB_BASE_URL ?? "https://iliad.trustfabric.ai"}/billing`,
    checkout_url: `${process.env.WEB_BASE_URL ?? "https://iliad.trustfabric.ai"}/billing#checkout-paid`,
    go_pro_url: "https://iliad.trustfabric.ai/billing",
    upgrade_url: `${process.env.WEB_BASE_URL ?? "https://iliad.trustfabric.ai"}/billing`,
    retry_after_payment: "After payment completes, re-send the original request with your API key in Authorization: Bearer <key>. No additional steps required — the server processes it immediately.",
    agent_message: "AXIS can complete this request after payment. Retry with an MPP credential, switch to lite mode, or stay on the free discovery tools first.",
    pricing: {
      standard: { amount_cents: tier.standard_cents, currency: "usd", description: `Full ${tool} run with all artifacts` },
      lite: { amount_cents: tier.lite_cents, currency: "usd", description: tier.lite_description },
      // Premium "over-the-top" tier — advertised only for tools that define it.
      ...(tier.engineer_cents !== undefined
        ? {
            engineer: {
              amount_cents: tier.engineer_cents,
              currency: "usd",
              description: tier.engineer_description ?? `Engineer mode: deep + novel ${tool}`,
              how: "Send X-Agent-Mode: engineer",
            },
          }
        : {}),
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
      // A tool whose lite price is 0 has RETIRED lite (analyze_repo/analyze_files:
      // lite now returns the free artifact set). Advertising "pay $0.00" as a
      // payment option is incoherent — point at the free tier instead, which is
      // what the caller actually gets.
      switch_lite:
        tier.lite_cents === 0
          ? "Lite mode is retired for this tool — re-send with X-Agent-Mode: lite to receive the FREE artifact set at no charge"
          : tier.lite_cents === tier.standard_cents
            ? "Lite mode carries no discount for this tool — the output is identical to standard"
            : `Re-send with X-Agent-Mode: lite to get reduced output at $${(tier.lite_cents / 100).toFixed(2)}`,
      get_free: "Call discover_commerce_tools or discover_agentic_purchasing_needs (no auth, no cost)",
    },
    next_step: {
      immediate:
        tier.lite_cents === 0
          ? `Pay $${(tier.standard_cents / 100).toFixed(2)} for the full ${tool} run, or send X-Agent-Mode: lite for the free artifact set at no charge.`
          : tier.lite_cents === tier.standard_cents
            ? `Pay $${(tier.standard_cents / 100).toFixed(2)} for the ${tool} run — lite is priced the same for this tool.`
            : `Pay $${(tier.standard_cents / 100).toFixed(2)} for the full ${tool} run, or switch to lite at $${(tier.lite_cents / 100).toFixed(2)} if the budget is tighter.`,
      retry_headers: {
        budget: 'X-Agent-Budget: {"budget_per_run_cents":25,"spending_window":"per_call"}',
        lite: "X-Agent-Mode: lite",
      },
      // H-Phase-A cycle 5: was "unlimited full-bundle calls" — Pro grants a
      // finite 300,000 monthly credit allowance (packages/snapshots/src/
      // pricing-constants.ts's MARKETED_TIERS), billed as metered overage via
      // consumeUsageCredits once exhausted, not unlimited. An agent that
      // upgraded expecting "unlimited" and burned past 300k credits/month
      // would be billed overage it was told wouldn't happen.
      // H-Phase-A cycle 9: "$99/month" was also misleading a different way —
      // PAI'D's checkout only supports a single one-time charge (no recurring
      // billing exists at all yet), so a Pro upgrade costs $99 ONCE, not $99
      // billed repeatedly. This is the universal 402 body for every metered
      // tool (MCP and REST alike) — see TermsPage.tsx's own corrected §4.3
      // wording for the phrasing this mirrors.
      upgrade_path: "Upgrade to Pro for 300,000 monthly credits covering full-bundle calls — a one-time $99 charge, not a recurring subscription (overage billed per-call beyond that).",
    },
    free_alternatives: [
      "list_programs — enumerate all 21 programs",
      "search_and_discover_tools — keyword search (no auth)",
      "discover_commerce_tools — full ecosystem overview (no auth)",
      "discover_agentic_purchasing_needs — intent-based tool matching (no auth)",
      "POST /probe-intent — REST intent probe (no auth)",
    ],
    compliance_value: {
      what_you_get: "Single-call agentic commerce readiness kit — deterministic artifacts generated from your repo, no PCI scope, no runtime API calls",
      includes: [
        "CE 3.0 (Compelling Evidence) dispute evidence checklist — qualified data elements and prior-transaction requirements",
        "SCA exemption decision tree — prioritized exemption paths (low-value, TRA, MIT, trusted beneficiary)",
        "TAP (Token Action Protocol) lifecycle — provisioning, lifecycle management, domain control",
        "AP2/UCP/Visa IC readiness checklist — autonomous checkout preparation",
        "VROL/RDR/CDRN pre-dispute deflection paths",
      ],
      methodology_note: "Artifacts are generated from a keyword-signal scan of your repository. They are a checklist starting point, not a certification, audit, or legal/compliance advice.",
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
    // The x402 foundation's real, spec-defined discovery mechanism (Bazaar
    // extension) -- see Build402BazaarInfo's docs above. Only present when the
    // caller supplied the tool's real MCP catalog entry; never fabricated.
    ...(options.bazaar
      ? {
          bazaar: {
            key: "bazaar",
            info: {
              input: {
                type: "mcp" as const,
                toolName: options.bazaar.toolName,
                ...(options.bazaar.description ? { description: options.bazaar.description } : {}),
                inputSchema: options.bazaar.inputSchema,
                ...(options.bazaar.example ? { example: options.bazaar.example } : {}),
              },
              ...(options.bazaar.output ? { output: options.bazaar.output } : {}),
            },
            schema: {
              $schema: "https://json-schema.org/draft/2020-12/schema" as const,
              type: "object" as const,
              properties: {
                input: {
                  type: "object" as const,
                  properties: {
                    type: { type: "string" as const, const: "mcp" as const },
                    toolName: { type: "string" as const },
                    description: { type: "string" as const },
                    inputSchema: { type: "object" as const },
                    example: { type: "object" as const },
                  },
                  required: ["type", "toolName", "inputSchema"],
                },
              },
              required: ["input"],
            },
          },
        }
      : {}),
  };
}

// ─── Large-body x402 surcharge ─────────────────────────────────────

// A per-call, size-scaled unlock for requests whose raw JSON body exceeds
// the free cap (apps/api/src/router.ts's MAX_BODY_BYTES, default 50MB) --
// previously a flat 413 with zero payable path forward, even for an account
// that would happily pay to process THIS one oversized call. Deliberately
// NOT a tier upgrade: raising an account's PERSISTED TIER_LIMITS with a
// one-time per-call charge doesn't make sense (see handlers.ts's
// findAccommodatingTier docblock -- an x402-aware client that paid this way
// would still get rejected on retry, since a per-call charge can't change a
// persisted account property). Unlocking a bigger ceiling for exactly this
// one request IS a genuine per-call payable item, consistent with every
// other mppx charge in this system.
export const LARGE_BODY_SURCHARGE_FREE_CAP_BYTES = 52428800; // 50MB -- mirrors router.ts's DEFAULT_MAX_BODY_BYTES
export const LARGE_BODY_SURCHARGE_HARD_CEILING_BYTES = 150 * 1024 * 1024; // 3x -- beyond this, no payment unlocks it
const LARGE_BODY_SURCHARGE_CENTS_PER_MB = 2;

/**
 * Cents to unlock a request body of exactly `declaredBytes`. Returns 0 when
 * no surcharge is needed (within the free cap) and null when NO amount
 * unlocks it (beyond the hard ceiling -- a resource-protection limit, not a
 * pricing gap; mirrors findAccommodatingTier's own "no tier fits -> stay a
 * flat 413" philosophy of never offering a payment that can't actually be
 * honored). `freeCapBytes`/`hardCeilingBytes` default to the constants above
 * but are overridable so tests can exercise the free-cap/hard-ceiling
 * boundaries with small payloads instead of transferring real tens-of-MB
 * bodies (mirrors router.ts's own MAX_BODY_BYTES override pattern).
 */
export function computeLargeBodySurchargeCents(
  declaredBytes: number,
  freeCapBytes: number = LARGE_BODY_SURCHARGE_FREE_CAP_BYTES,
  hardCeilingBytes: number = LARGE_BODY_SURCHARGE_HARD_CEILING_BYTES,
): number | null {
  if (declaredBytes <= freeCapBytes) return 0;
  if (declaredBytes > hardCeilingBytes) return null;
  const overMb = (declaredBytes - freeCapBytes) / (1024 * 1024);
  return Math.max(1, Math.ceil(overMb) * LARGE_BODY_SURCHARGE_CENTS_PER_MB);
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
export type AgentMode = "standard" | "lite" | "engineer";

export function resolveAgentMode(req: IncomingMessage): AgentMode {
  // Node folds a duplicated header into a string[]; normalize so a paying
  // engineer caller isn't silently downgraded to standard by a repeated header.
  const raw = req.headers["x-agent-mode"];
  const mode = Array.isArray(raw) ? raw[0] : raw;
  if (mode === "lite") return "lite";
  if (mode === "engineer") return "engineer";
  return "standard";
}

/**
 * One door for mode → price (cents). `engineer` is the premium tier; tools that
 * don't define an engineer price fall back to standard so the flag is always
 * safe to send and never under-charges.
 */
export function priceForMode(tier: PricingTier, mode: AgentMode): number {
  if (mode === "engineer") return tier.engineer_cents ?? tier.standard_cents;
  if (mode === "lite") return tier.lite_cents;
  return tier.standard_cents;
}
