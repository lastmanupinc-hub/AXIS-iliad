/**
 * Tests for:
 *   - Budget negotiation (mpp.ts: getPricingTier, negotiatePrice, build402NegotiationBody, parseAgentBudget, resolveAgentMode)
 *   - Probe classification (mcp-server.ts: classifyProbe, captureIntent, getIntentLog)
 *   - Evidence scoring (handlers.ts: computePurchasingReadinessEvidence)
 *   - Probe-aware probe-intent endpoint (handlers.ts: handleProbeIntent with probe_class)
 *   - Budget-aware /for-agents endpoint (handlers.ts: handleForAgents with budget_negotiation)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { IncomingMessage } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import {
  getPricingTier,
  negotiatePrice,
  build402NegotiationBody,
  parseAgentBudget,
  resolveAgentMode,
} from "./mpp.js";
import {
  classifyProbe,
  captureIntent,
  getIntentLog,
} from "./intent.js";
import {
  computePurchasingReadinessEvidence,
  handleForAgents,
  handleProbeIntent,
} from "./handlers.js";

// ─── HTTP helper ─────────────────────────────────────────────────

let server: Server;
let TEST_PORT: number;

async function postReq(
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...extraHeaders,
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end(data);
  });
}

async function getReq(
  path: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method: "GET",
        headers: extraHeaders,
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ─── Server setup ─────────────────────────────────────────────────

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/for-agents", handleForAgents);
  router.post("/probe-intent", handleProbeIntent);
  server = createServer((r, res) => router.handle(r, res));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  TEST_PORT = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — getPricingTier
// ═════════════════════════════════════════════════════════════════

describe("getPricingTier", () => {
  it("returns correct tier for prepare_agentic_purchasing", async () => {
    const tier = getPricingTier("prepare_agentic_purchasing");
    expect(tier.tool).toBe("prepare_agentic_purchasing");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(25);
  });

  it("returns correct tier for analyze_repo", async () => {
    const tier = getPricingTier("analyze_repo");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(15);
  });

  it("returns correct tier for analyze_files", async () => {
    const tier = getPricingTier("analyze_files");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(15);
  });

  it("returns correct tier for improve_my_agent_with_axis", async () => {
    const tier = getPricingTier("improve_my_agent_with_axis");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(20);
  });

  it("returns default tier for unknown tool", async () => {
    const tier = getPricingTier("random_tool_xyz");
    expect(tier.tool).toBe("default");
    expect(tier.standard_cents).toBe(50);
    expect(tier.lite_cents).toBe(25);
  });

  // ─── Tier coverage for the 4 new iliad_* tools landed sessions 105-108 ─
  // (V1_ROI_CANDIDATES Tier-1 #3.) Confirms the pricing surface no longer
  // falls through to default for the AXIS-owned and live-proxy tools.

  it("returns near-free tier for iliad_object_storage (owned, signing is essentially free)", async () => {
    const tier = getPricingTier("iliad_object_storage");
    expect(tier.tool).toBe("iliad_object_storage");
    expect(tier.standard_cents).toBe(1);
    expect(tier.lite_cents).toBe(0);
    expect(tier.lite_description).toMatch(/1h|24h|quota|free/i);
  });

  it("returns near-free tier for iliad_vector_database (owned, sub-ms cosine in SQLite)", async () => {
    const tier = getPricingTier("iliad_vector_database");
    expect(tier.tool).toBe("iliad_vector_database");
    expect(tier.standard_cents).toBe(1);
    expect(tier.lite_cents).toBe(0);
    expect(tier.lite_description).toMatch(/top_k|namespace|free/i);
  });

  it("returns the iliad_embeddings tier (AXIS-owned in-process by default; OpenAI optional behind a flag)", async () => {
    const tier = getPricingTier("iliad_embeddings");
    expect(tier.tool).toBe("iliad_embeddings");
    expect(tier.standard_cents).toBe(5);
    expect(tier.lite_cents).toBe(2);
    expect(tier.lite_description).toMatch(/single-string|batch/i);
  });

  it("returns markup-over-Resend tier for iliad_transactional_email (proxy, real provider cost upstream)", async () => {
    const tier = getPricingTier("iliad_transactional_email");
    expect(tier.tool).toBe("iliad_transactional_email");
    expect(tier.standard_cents).toBe(2);
    expect(tier.lite_cents).toBe(1);
    expect(tier.lite_description).toMatch(/recipient|plaintext|HTML/i);
  });

  it("returns near-free tier for iliad_analytics (owned, SQLite events + aggregations)", async () => {
    const tier = getPricingTier("iliad_analytics");
    expect(tier.tool).toBe("iliad_analytics");
    expect(tier.standard_cents).toBe(1);
    expect(tier.lite_cents).toBe(0);
    expect(tier.lite_description).toMatch(/batch|limit|free/i);
  });

  it("returns low-markup tier for iliad_llm_inference (in-process inference, CPU-bound)", async () => {
    const tier = getPricingTier("iliad_llm_inference");
    expect(tier.tool).toBe("iliad_llm_inference");
    expect(tier.standard_cents).toBe(2);
    expect(tier.lite_cents).toBe(1);
    expect(tier.lite_description).toMatch(/max_tokens|temperature|deterministic/i);
  });

  it("returns container-spawn tier for iliad_code_sandbox (ephemeral Docker per call)", async () => {
    const tier = getPricingTier("iliad_code_sandbox");
    expect(tier.tool).toBe("iliad_code_sandbox");
    expect(tier.standard_cents).toBe(5);
    expect(tier.lite_cents).toBe(2);
    expect(tier.lite_description).toMatch(/timeout|seconds|python|bash/i);
  });

  it("returns mid tier for iliad_speech_to_text (CPU-bound whisper.cpp)", async () => {
    const tier = getPricingTier("iliad_speech_to_text");
    expect(tier.tool).toBe("iliad_speech_to_text");
    expect(tier.standard_cents).toBe(3);
    expect(tier.lite_cents).toBe(1);
    expect(tier.lite_description).toMatch(/seconds|audio|word_timestamps/i);
  });

  it("returns near-free tier for iliad_text_to_speech (Piper is fast on CPU)", async () => {
    const tier = getPricingTier("iliad_text_to_speech");
    expect(tier.tool).toBe("iliad_text_to_speech");
    expect(tier.standard_cents).toBe(2);
    expect(tier.lite_cents).toBe(1);
    expect(tier.lite_description).toMatch(/text|chars|wav|format/i);
  });

  it("returns near-free tier for iliad_web_search (BM25 over SQLite, no external API)", async () => {
    const tier = getPricingTier("iliad_web_search");
    expect(tier.tool).toBe("iliad_web_search");
    expect(tier.standard_cents).toBe(1);
    expect(tier.lite_cents).toBe(0);
    expect(tier.lite_description).toMatch(/max_results|indexing|free/i);
  });

  it("returns near-free tier for iliad_document_parsing (pure JS pdfjs + mammoth)", async () => {
    const tier = getPricingTier("iliad_document_parsing");
    expect(tier.tool).toBe("iliad_document_parsing");
    expect(tier.standard_cents).toBe(2);
    expect(tier.lite_cents).toBe(1);
    expect(tier.lite_description).toMatch(/MiB|markdown|capped/i);
  });

  it("returns cheap tier for iliad_hygiene (pure in-process analysis; scan is free)", async () => {
    const tier = getPricingTier("iliad_hygiene");
    expect(tier.tool).toBe("iliad_hygiene");
    expect(tier.standard_cents).toBe(5);
    expect(tier.lite_cents).toBe(2);
    expect(tier.lite_description).toMatch(/scan|free|remediation/i);
  });

  it("all tiers have lite_cents <= standard_cents (including the iliad_* entries)", async () => {
    for (const tool of [
      "prepare_agentic_purchasing",
      "analyze_repo",
      "analyze_files",
      "improve_my_agent_with_axis",
      "iliad_web_research",
      "iliad_web_research_crawl",
      "iliad_object_storage",
      "iliad_vector_database",
      "iliad_embeddings",
      "iliad_transactional_email",
      "iliad_analytics",
      "iliad_llm_inference",
      "iliad_code_sandbox",
      "iliad_speech_to_text",
      "iliad_text_to_speech",
      "iliad_web_search",
      "iliad_document_parsing",
      "iliad_hygiene",
      "default",
    ]) {
      const tier = getPricingTier(tool);
      expect(tier.lite_cents, `${tool}.lite_cents > ${tool}.standard_cents`).toBeLessThanOrEqual(tier.standard_cents);
    }
  });

  it("all tiers have non-empty lite_description (including the iliad_* entries)", async () => {
    for (const tool of [
      "prepare_agentic_purchasing",
      "analyze_repo",
      "improve_my_agent_with_axis",
      "iliad_object_storage",
      "iliad_vector_database",
      "iliad_embeddings",
      "iliad_transactional_email",
      "iliad_analytics",
      "iliad_llm_inference",
      "iliad_code_sandbox",
      "iliad_speech_to_text",
      "iliad_text_to_speech",
      "iliad_web_search",
      "iliad_document_parsing",
      "iliad_hygiene",
    ]) {
      const tier = getPricingTier(tool);
      expect(tier.lite_description.length, `${tool}.lite_description is empty`).toBeGreaterThan(0);
    }
  });

  it("no iliad_* tool falls back to the default tier", async () => {
    // Honest pricing means every iliad_* tool has its own entry. If a new
    // iliad_* tool ships without a PRICING_TIERS row, this test catches it
    // before the MPP 402 surface starts charging the default $0.50.
    const iliadTools = [
      "iliad_web_research",
      "iliad_web_research_crawl",
      "iliad_object_storage",
      "iliad_vector_database",
      "iliad_embeddings",
      "iliad_transactional_email",
      "iliad_analytics",
      "iliad_llm_inference",
      "iliad_code_sandbox",
      "iliad_speech_to_text",
      "iliad_text_to_speech",
      "iliad_web_search",
      "iliad_document_parsing",
      "iliad_hygiene",
    ];
    for (const tool of iliadTools) {
      const tier = getPricingTier(tool);
      expect(tier.tool, `${tool} fell through to default tier`).toBe(tool);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — negotiatePrice
// ═════════════════════════════════════════════════════════════════

describe("negotiatePrice", () => {
  it("returns standard pricing when no budget_per_run_cents set", async () => {
    const result = negotiatePrice({}, "analyze_repo");
    expect(result.amount_cents).toBe(50);
    expect(result.mode).toBe("standard");
    expect(result.accepted).toBe(true);
  });

  it("returns standard when budget >= standard price", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 100 }, "analyze_repo");
    expect(result.amount_cents).toBe(50);
    expect(result.mode).toBe("standard");
    expect(result.accepted).toBe(true);
  });

  it("returns standard when budget exactly equals standard price", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 50 }, "analyze_repo");
    expect(result.amount_cents).toBe(50);
    expect(result.mode).toBe("standard");
    expect(result.accepted).toBe(true);
  });

  it("returns lite when budget is between lite and standard", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 30 }, "analyze_repo");
    expect(result.amount_cents).toBe(15);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });

  it("returns lite exactly at lite price", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 15 }, "analyze_repo");
    expect(result.amount_cents).toBe(15);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });

  it("rejects when budget below lite price", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 5 }, "analyze_repo");
    expect(result.accepted).toBe(false);
    expect(result.mode).toBe("lite");
    expect(result.amount_cents).toBe(15);
    expect(result.reason).toContain("Minimum price");
  });

  it("rejects zero budget", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 0 }, "analyze_repo");
    expect(result.accepted).toBe(false);
  });

  it("uses tool-specific lite pricing for prepare_agentic_purchasing", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 30 }, "prepare_agentic_purchasing");
    expect(result.amount_cents).toBe(25);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });

  it("uses default pricing for unknown tool", async () => {
    const result = negotiatePrice({ budget_per_run_cents: 30 }, "some_unknown_tool");
    expect(result.amount_cents).toBe(25);
    expect(result.mode).toBe("lite");
    expect(result.accepted).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — build402NegotiationBody
// ═════════════════════════════════════════════════════════════════

describe("build402NegotiationBody", () => {
  it("returns pricing tiers for tool without budget", async () => {
    const body = build402NegotiationBody("analyze_repo");
    expect(body.pricing).toBeDefined();
    const pricing = body.pricing as Record<string, unknown>;
    const standard = pricing.standard as Record<string, unknown>;
    const lite = pricing.lite as Record<string, unknown>;
    expect(standard.amount_cents).toBe(50);
    expect(lite.amount_cents).toBe(15);
  });

  it("returns default negotiation when no budget provided", async () => {
    const body = build402NegotiationBody("analyze_repo");
    const negotiation = body.negotiation as Record<string, unknown>;
    expect(negotiation.amount_cents).toBe(50);
    expect(negotiation.mode).toBe("standard");
    expect(negotiation.accepted).toBe(true);
  });

  it("returns negotiated result when budget provided", async () => {
    const body = build402NegotiationBody("analyze_repo", { budget_per_run_cents: 20 });
    const negotiation = body.negotiation as Record<string, unknown>;
    expect(negotiation.amount_cents).toBe(15);
    expect(negotiation.mode).toBe("lite");
    expect(negotiation.accepted).toBe(true);
  });

  it("returns rejection when budget too low", async () => {
    const body = build402NegotiationBody("analyze_repo", { budget_per_run_cents: 5 });
    const negotiation = body.negotiation as Record<string, unknown>;
    expect(negotiation.accepted).toBe(false);
  });

  it("includes actions with accept, counter, switch_lite, get_free", async () => {
    const body = build402NegotiationBody("analyze_repo");
    const actions = body.actions as Record<string, string>;
    expect(actions.accept).toBeDefined();
    expect(actions.counter).toBeDefined();
    expect(actions.switch_lite).toBeDefined();
    expect(actions.get_free).toBeDefined();
  });

  it("includes free_alternatives array", async () => {
    const body = build402NegotiationBody("analyze_repo");
    const free = body.free_alternatives as string[];
    expect(Array.isArray(free)).toBe(true);
    expect(free.length).toBeGreaterThan(0);
    expect(free.some(f => f.includes("list_programs"))).toBe(true);
    expect(free.some(f => f.includes("search_and_discover_tools"))).toBe(true);
    expect(free.some(f => f.includes("probe-intent"))).toBe(true);
  });

  it("includes agent_message and actionable next_step guidance", async () => {
    const body = build402NegotiationBody("prepare_agentic_purchasing");
    expect(String(body.agent_message)).toContain("Retry with an MPP credential");
    const nextStep = body.next_step as Record<string, unknown>;
    expect(String(nextStep.immediate)).toContain("Pay $0.50");
    // H-Phase-A cycle 5: Pro grants a finite 300,000 monthly credit
    // allowance, billed as metered overage beyond that — never "unlimited."
    expect(String(nextStep.upgrade_path)).not.toContain("unlimited");
    expect(String(nextStep.upgrade_path)).toContain("300,000");
    // H-Phase-A cycle 9: PAI'D's checkout is a one-time charge (no recurring
    // billing exists yet) — Pro costs $99 once, never phrased as "$99/month".
    expect(String(nextStep.upgrade_path)).toContain("$99");
    expect(String(nextStep.upgrade_path)).not.toContain("$99/month");
    expect(String(nextStep.upgrade_path)).toContain("one-time");
  });

  it("includes x402-compatible top-level payment fields", async () => {
    const body = build402NegotiationBody("analyze_repo", undefined, {
      message: "Paid full-bundle analyze required",
      referral_token: "ref_test_123",
    });
    expect(body.error).toBe("Payment Required");
    expect(body.message).toBe("Paid full-bundle analyze required");
    expect(body.price).toBe("0.50");
    expect(body.currency).toBe("USD");
    expect(Array.isArray(body.accepted_payment_schemes)).toBe(true);
    expect(body.referral_token).toBe("ref_test_123");
    const x402 = body.x402 as Record<string, unknown>;
    expect(x402.asset).toBe("USDC");
    expect(x402.amount).toBe("500000");
  });

  it("switch_lite action contains dollar amount", async () => {
    const body = build402NegotiationBody("prepare_agentic_purchasing");
    const actions = body.actions as Record<string, string>;
    expect(actions.switch_lite).toContain("$0.25");
  });

  // ─── Token-first rail ordering + explicit per-rail economics ─────
  // The token/USDC rail leads when TEMPO_RECIPIENT_ADDRESS is configured:
  // first in accepted_payment_schemes, named in preferred_payment_scheme,
  // and first in the payment_rails economics block — so an agent evaluating
  // rails autonomously lands on the on-chain option without human help.

  it("leads with the USDC rail and states per-rail economics when a Tempo recipient is configured", async () => {
    const prev = process.env.TEMPO_RECIPIENT_ADDRESS;
    process.env.TEMPO_RECIPIENT_ADDRESS = "0x20c000000000000000000000b9537d11c60e8b50";
    try {
      const body = build402NegotiationBody("analyze_repo");
      const schemes = body.accepted_payment_schemes as string[];
      expect(schemes[0]).toBe("x402/usdc/base");
      expect(schemes).toContain("mppx/tempo");
      expect(schemes[schemes.length - 1]).toBe("mppx/stripe");
      expect(body.preferred_payment_scheme).toBe("x402/usdc/base");

      const rails = body.payment_rails as Array<Record<string, unknown>>;
      expect(rails[0]!.asset).toBe("USDC");
      expect(rails[0]!.preferred).toBe(true);
      expect(rails[0]!.price_usd).toBe("0.50");
      expect(rails[0]!.lite_price_usd).toBe("0.15");
      expect(String(rails[0]!.summary)).toBe("USDC on base @ $0.50 per analyze_repo call ($0.15 lite)");
      expect(String(rails[0]!.chargeback_exposure)).toContain("none");

      const stripeRail = rails.find(r => r.scheme === "mppx/stripe")!;
      expect(stripeRail.preferred).toBe(false);
      // same all-in AGENT price on both rails — the economics block is factual, not promotional
      expect(stripeRail.price_usd).toBe(rails[0]!.price_usd);
      // fee-handling asymmetry stated explicitly: card overhead is Stripe's
      // PUBLISHED standard rate (attributed, not measured); USDC is gas-only.
      expect(String(stripeRail.processing_overhead)).toContain("2.9% + $0.30");
      expect(String(stripeRail.processing_overhead)).toContain("published");
      expect(String(rails[0]!.processing_overhead)).toContain("network gas only");
      expect(String(rails[0]!.why_preferred)).toContain("no card-processing fee overhead");
    } finally {
      if (prev === undefined) delete process.env.TEMPO_RECIPIENT_ADDRESS;
      else process.env.TEMPO_RECIPIENT_ADDRESS = prev;
    }
  });

  it("falls back to Stripe-preferred with a single rail when no Tempo recipient is configured", async () => {
    const prev = process.env.TEMPO_RECIPIENT_ADDRESS;
    delete process.env.TEMPO_RECIPIENT_ADDRESS;
    try {
      const body = build402NegotiationBody("analyze_repo");
      expect(body.accepted_payment_schemes).toEqual(["mppx/stripe"]);
      expect(body.preferred_payment_scheme).toBe("mppx/stripe");
      const rails = body.payment_rails as Array<Record<string, unknown>>;
      expect(rails).toHaveLength(1);
      expect(rails[0]!.scheme).toBe("mppx/stripe");
      expect(rails[0]!.preferred).toBe(true);
    } finally {
      if (prev !== undefined) process.env.TEMPO_RECIPIENT_ADDRESS = prev;
    }
  });

  it("uses the testnet network name in scheme, rails, and x402 block when TEMPO_TESTNET is set", async () => {
    const prevRecipient = process.env.TEMPO_RECIPIENT_ADDRESS;
    const prevTestnet = process.env.TEMPO_TESTNET;
    process.env.TEMPO_RECIPIENT_ADDRESS = "0x20c0000000000000000000000000000000000000";
    process.env.TEMPO_TESTNET = "true";
    try {
      const body = build402NegotiationBody("analyze_repo");
      const schemes = body.accepted_payment_schemes as string[];
      expect(schemes[0]).toBe("x402/usdc/base-sepolia");
      expect(body.preferred_payment_scheme).toBe("x402/usdc/base-sepolia");
      const rails = body.payment_rails as Array<Record<string, unknown>>;
      expect(rails[0]!.network).toBe("base-sepolia");
      const x402 = body.x402 as Record<string, unknown>;
      expect(x402.network).toBe("base-sepolia");
    } finally {
      if (prevRecipient === undefined) delete process.env.TEMPO_RECIPIENT_ADDRESS;
      else process.env.TEMPO_RECIPIENT_ADDRESS = prevRecipient;
      if (prevTestnet === undefined) delete process.env.TEMPO_TESTNET;
      else process.env.TEMPO_TESTNET = prevTestnet;
    }
  });

  it("includes compliance_value with CE 3.0 evidence checklist and methodology note", async () => {
    const body = build402NegotiationBody("prepare_agentic_purchasing");
    const cv = body.compliance_value as Record<string, unknown>;
    expect(cv).toBeDefined();
    expect(cv.what_you_get).toContain("readiness kit");
    expect(cv.what_you_get).not.toContain("Visa-grade");
    const includes = cv.includes as string[];
    expect(includes.some(s => s.includes("CE 3.0"))).toBe(true);
    expect(includes.some(s => s.includes("SCA exemption"))).toBe(true);
    expect(includes.some(s => s.includes("TAP"))).toBe(true);
    expect(includes.some(s => s.includes("Win probability"))).toBe(false);
    expect(cv.methodology_note).toContain("not a certification");
    expect(cv.vs_visa_ic_pilot).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — parseAgentBudget
// ═════════════════════════════════════════════════════════════════

describe("parseAgentBudget", () => {
  function makeReq(headers: Record<string, string | string[] | undefined>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  it("returns undefined when header missing", async () => {
    expect(parseAgentBudget(makeReq({}))).toBeUndefined();
  });

  it("returns undefined for non-string header", async () => {
    expect(parseAgentBudget(makeReq({ "x-agent-budget": undefined }))).toBeUndefined();
  });

  it("returns undefined for invalid JSON", async () => {
    expect(parseAgentBudget(makeReq({ "x-agent-budget": "not{json" }))).toBeUndefined();
  });

  it("parses budget_per_run_cents", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":25}' }));
    expect(budget).toBeDefined();
    expect(budget!.budget_per_run_cents).toBe(25);
  });

  it("floors budget_per_run_cents to integer", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":25.7}' }));
    expect(budget!.budget_per_run_cents).toBe(25);
  });

  it("rejects negative budget_per_run_cents", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":-5}' }));
    expect(budget).toBeDefined();
    expect(budget!.budget_per_run_cents).toBeUndefined();
  });

  it("parses valid spending_window values", async () => {
    for (const window of ["per_call", "hourly", "daily", "monthly"]) {
      const budget = parseAgentBudget(makeReq({ "x-agent-budget": `{"spending_window":"${window}"}` }));
      expect(budget!.spending_window).toBe(window);
    }
  });

  it("rejects invalid spending_window", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"spending_window":"weekly"}' }));
    expect(budget!.spending_window).toBeUndefined();
  });

  it("parses max_monthly_cents", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"max_monthly_cents":5000}' }));
    expect(budget!.max_monthly_cents).toBe(5000);
  });

  it("rejects negative max_monthly_cents", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"max_monthly_cents":-100}' }));
    expect(budget!.max_monthly_cents).toBeUndefined();
  });

  it("parses wallet_id up to 200 chars", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"wallet_id":"org_abc123"}' }));
    expect(budget!.wallet_id).toBe("org_abc123");
  });

  it("rejects wallet_id over 200 chars", async () => {
    const longId = "a".repeat(201);
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": `{"wallet_id":"${longId}"}` }));
    expect(budget!.wallet_id).toBeUndefined();
  });

  it("parses agent_type up to 100 chars", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"agent_type":"claude"}' }));
    expect(budget!.agent_type).toBe("claude");
  });

  it("rejects agent_type over 100 chars", async () => {
    const longType = "x".repeat(101);
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": `{"agent_type":"${longType}"}` }));
    expect(budget!.agent_type).toBeUndefined();
  });

  it("accepts budget_per_run_cents of 0 (zero budget)", async () => {
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": '{"budget_per_run_cents":0}' }));
    expect(budget!.budget_per_run_cents).toBe(0);
  });

  it("parses combined fields", async () => {
    const header = JSON.stringify({
      budget_per_run_cents: 25,
      spending_window: "per_call",
      max_monthly_cents: 1000,
      wallet_id: "org_test",
      agent_type: "cursor",
    });
    const budget = parseAgentBudget(makeReq({ "x-agent-budget": header }));
    expect(budget!.budget_per_run_cents).toBe(25);
    expect(budget!.spending_window).toBe("per_call");
    expect(budget!.max_monthly_cents).toBe(1000);
    expect(budget!.wallet_id).toBe("org_test");
    expect(budget!.agent_type).toBe("cursor");
  });
});

// ═════════════════════════════════════════════════════════════════
// BUDGET NEGOTIATION — resolveAgentMode
// ═════════════════════════════════════════════════════════════════

describe("resolveAgentMode", () => {
  function makeReq(headers: Record<string, string | string[] | undefined>): IncomingMessage {
    return { headers } as unknown as IncomingMessage;
  }

  it("returns standard when no header", async () => {
    expect(resolveAgentMode(makeReq({}))).toBe("standard");
  });

  it("returns lite when header is lite", async () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "lite" }))).toBe("lite");
  });

  it("returns standard when header is standard", async () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "standard" }))).toBe("standard");
  });

  it("returns standard for invalid mode value", async () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "ultra" }))).toBe("standard");
  });

  it("returns standard for empty string", async () => {
    expect(resolveAgentMode(makeReq({ "x-agent-mode": "" }))).toBe("standard");
  });
});

// ═════════════════════════════════════════════════════════════════
// PROBE CLASSIFICATION — classifyProbe
// ═════════════════════════════════════════════════════════════════

describe("classifyProbe", () => {
  it("classifies Chiark as quality-agent", async () => {
    expect(classifyProbe("Chiark/1.0")).toBe("quality-agent");
  });

  it("classifies quality-index as quality-agent", async () => {
    expect(classifyProbe("quality-index-bot/2.1")).toBe("quality-agent");
  });

  it("classifies qci-agent as quality-agent", async () => {
    expect(classifyProbe("qci-agent")).toBe("quality-agent");
  });

  it("classifies Smithery as registry-crawler", async () => {
    expect(classifyProbe("Smithery-Crawler/1.0")).toBe("registry-crawler");
  });

  it("classifies Glama as registry-crawler", async () => {
    expect(classifyProbe("Glama-Bot/2.0")).toBe("registry-crawler");
  });

  it("classifies mcp-registry as registry-crawler", async () => {
    expect(classifyProbe("mcp-registry-scanner")).toBe("registry-crawler");
  });

  it("classifies AWS as registry-crawler", async () => {
    expect(classifyProbe("aws-sdk-nodejs/3.0")).toBe("registry-crawler");
  });

  it("classifies Amazon as registry-crawler", async () => {
    expect(classifyProbe("Amazon CloudFront")).toBe("registry-crawler");
  });

  it("classifies purchasing-agent as purchasing-agent", async () => {
    expect(classifyProbe("purchasing-agent/1.0")).toBe("purchasing-agent");
  });

  it("classifies 402.ad as purchasing-agent", async () => {
    expect(classifyProbe("402.ad-crawler")).toBe("purchasing-agent");
  });

  it("classifies commerce-bot as purchasing-agent", async () => {
    expect(classifyProbe("commerce-bot/1.2")).toBe("purchasing-agent");
  });

  it("classifies Cursor as dev-tool", async () => {
    expect(classifyProbe("Cursor/0.40")).toBe("dev-tool");
  });

  it("classifies Copilot as dev-tool", async () => {
    expect(classifyProbe("GitHub-Copilot")).toBe("dev-tool");
  });

  it("classifies Claude as dev-tool", async () => {
    expect(classifyProbe("Claude-Desktop/1.0")).toBe("dev-tool");
  });

  it("classifies Windsurf as dev-tool", async () => {
    expect(classifyProbe("Windsurf-IDE")).toBe("dev-tool");
  });

  it("classifies Cline as dev-tool", async () => {
    expect(classifyProbe("Cline-Agent/1.0")).toBe("dev-tool");
  });

  it("classifies Continue as dev-tool", async () => {
    expect(classifyProbe("Continue-Extension")).toBe("dev-tool");
  });

  it("classifies Aider as dev-tool", async () => {
    expect(classifyProbe("Aider/0.50.1")).toBe("dev-tool");
  });

  it("returns unknown for unrecognized user-agent", async () => {
    expect(classifyProbe("Mozilla/5.0")).toBe("unknown");
  });

  it("returns unknown for empty string", async () => {
    expect(classifyProbe("")).toBe("unknown");
  });

  it("is case-insensitive", async () => {
    expect(classifyProbe("CHIARK")).toBe("quality-agent");
    expect(classifyProbe("SMITHERY")).toBe("registry-crawler");
    expect(classifyProbe("CURSOR")).toBe("dev-tool");
  });
});

// ═════════════════════════════════════════════════════════════════
// PROBE CLASSIFICATION — captureIntent / getIntentLog
// ═════════════════════════════════════════════════════════════════

describe("captureIntent + getIntentLog", () => {
  it("captures an intent entry", async () => {
    const before = getIntentLog().length;
    captureIntent("test_tool", "test intent", "Cursor/1.0");
    const after = getIntentLog().length;
    expect(after).toBe(before + 1);
  });

  it("captured entry has correct fields", async () => {
    captureIntent("analyze_repo", "analyze my code", "Claude-Desktop/1.0");
    const log = getIntentLog();
    const last = log[log.length - 1];
    expect(last.tool).toBe("analyze_repo");
    expect(last.intent).toBe("analyze my code");
    expect(last.probe_class).toBe("dev-tool");
    expect(last.user_agent).toBe("Claude-Desktop/1.0");
    expect(typeof last.timestamp).toBe("string");
  });

  it("classifies probe correctly in captured entry", async () => {
    captureIntent("probe_intent", "testing", "Smithery-Crawler");
    const log = getIntentLog();
    const last = log[log.length - 1];
    expect(last.probe_class).toBe("registry-crawler");
  });

  it("handles null intent", async () => {
    captureIntent("list_programs", null, "Mozilla/5.0");
    const log = getIntentLog();
    const last = log[log.length - 1];
    expect(last.intent).toBeNull();
    expect(last.probe_class).toBe("unknown");
  });

  it("returns a copy of the log (immutable)", async () => {
    const log1 = getIntentLog();
    captureIntent("test_mutation", "x", "Agent/1.0");
    const log2 = getIntentLog();
    expect(log2.length).toBe(log1.length + 1);
    // Mutating log1 should not affect log2
    log1.push({ tool: "fake", intent: "fake", probe_class: "unknown", user_agent: "", timestamp: "" });
    expect(getIntentLog().length).toBe(log2.length);
  });
});

// ═════════════════════════════════════════════════════════════════
// EVIDENCE SCORING — computePurchasingReadinessEvidence
// ═════════════════════════════════════════════════════════════════

describe("computePurchasingReadinessEvidence", () => {
  it("returns empty artifacts_found when no paths match", async () => {
    const result = computePurchasingReadinessEvidence([]);
    expect(result.evidence.length).toBeGreaterThan(0);
    for (const e of result.evidence) {
      expect(e.found).toBe(false);
    }
    for (const cat of Object.values(result.category_scores)) {
      expect(cat.earned).toBe(0);
      expect(cat.artifacts_found).toHaveLength(0);
    }
  });

  it("detects AGENTS.md in onboarding_docs", async () => {
    const result = computePurchasingReadinessEvidence(["AGENTS.md"]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding).toBeDefined();
    expect(onboarding.earned).toBeGreaterThan(0);
    expect(onboarding.artifacts_found).toContain("AGENTS.md");
  });

  it("detects CLAUDE.md in onboarding_docs", async () => {
    const result = computePurchasingReadinessEvidence(["CLAUDE.md"]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding.artifacts_found).toContain("CLAUDE.md");
  });

  it("detects .cursorrules in onboarding_docs", async () => {
    const result = computePurchasingReadinessEvidence([".cursorrules"]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding.artifacts_found).toContain(".cursorrules");
  });

  it("detects agent-purchasing-playbook in commerce_artifacts", async () => {
    const result = computePurchasingReadinessEvidence(["agent-purchasing-playbook.md"]);
    const commerce = result.category_scores.commerce_artifacts;
    expect(commerce.earned).toBeGreaterThan(0);
    expect(commerce.artifacts_found).toContain("Agent purchasing playbook");
  });

  it("detects mcp-config in mcp_configs", async () => {
    const result = computePurchasingReadinessEvidence(["mcp-config.json"]);
    const mcp = result.category_scores.mcp_configs;
    expect(mcp.earned).toBeGreaterThan(0);
    expect(mcp.artifacts_found).toContain("MCP configuration");
  });

  it("detects negotiation-rules in compliance_checklist", async () => {
    const result = computePurchasingReadinessEvidence(["negotiation-rules.md"]);
    const compliance = result.category_scores.compliance_checklist;
    expect(compliance.earned).toBeGreaterThan(0);
  });

  it("detects negotiation-rules in negotiation_playbook", async () => {
    const result = computePurchasingReadinessEvidence(["negotiation-rules.md"]);
    const neg = result.category_scores.negotiation_playbook;
    expect(neg.earned).toBeGreaterThan(0);
  });

  it("detects debug-playbook in debug_playbook", async () => {
    const result = computePurchasingReadinessEvidence(["debug-playbook.md"]);
    const dbg = result.category_scores.debug_playbook;
    expect(dbg.earned).toBeGreaterThan(0);
  });

  it("detects optimization-rules in optimization_rules", async () => {
    const result = computePurchasingReadinessEvidence(["optimization-rules.md"]);
    const opt = result.category_scores.optimization_rules;
    expect(opt.earned).toBeGreaterThan(0);
  });

  it("multiple artifacts increase artifacts_found but not earned weight beyond cap", async () => {
    const result = computePurchasingReadinessEvidence([
      "AGENTS.md", "CLAUDE.md", ".cursorrules",
    ]);
    const onboarding = result.category_scores.onboarding_docs;
    expect(onboarding.artifacts_found).toHaveLength(3);
    // Weight is still the same regardless of how many sub-checks match
    expect(onboarding.earned).toBe(onboarding.weight);
  });

  it("evidence array contains entries for all sub-checks", async () => {
    const result = computePurchasingReadinessEvidence(["AGENTS.md"]);
    // Should have entries from all categories
    const categories = new Set(result.evidence.map(e => e.category));
    expect(categories.has("commerce_artifacts")).toBe(true);
    expect(categories.has("mcp_configs")).toBe(true);
    expect(categories.has("onboarding_docs")).toBe(true);
    expect(categories.has("debug_playbook")).toBe(true);
    expect(categories.has("optimization_rules")).toBe(true);
  });

  it("detects full artifact suite", async () => {
    const paths = [
      "agent-purchasing-playbook.md",
      "commerce-registry.json",
      "product-schema.json",
      "checkout-flow.md",
      "mcp-config.json",
      "capability-registry.json",
      "mcp-playbook.md",
      "negotiation-rules.md",
      "debug-playbook.md",
      "optimization-rules.md",
      "AGENTS.md",
      "CLAUDE.md",
      ".cursorrules",
    ];
    const result = computePurchasingReadinessEvidence(paths);
    for (const cat of Object.values(result.category_scores)) {
      expect(cat.earned).toBe(cat.weight);
      expect(cat.artifacts_found.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// PROBE-AWARE ENDPOINTS — POST /probe-intent returns probe_class
// ═════════════════════════════════════════════════════════════════

describe("POST /probe-intent — probe classification", () => {
  it("returns probe_class in response", async () => {
    const r = await postReq("/probe-intent", { description: "test purchasing readiness" }, {
      "User-Agent": "Chiark/1.0",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("quality-agent");
  });

  it("classifies registry crawler correctly", async () => {
    const r = await postReq("/probe-intent", { description: "listing available tools" }, {
      "User-Agent": "Smithery-Crawler/2.0",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("registry-crawler");
  });

  it("classifies dev tools correctly", async () => {
    const r = await postReq("/probe-intent", { description: "analyze my code" }, {
      "User-Agent": "Cursor/0.40.1",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("dev-tool");
  });

  it("returns unknown for standard browser", async () => {
    const r = await postReq("/probe-intent", { description: "what does AXIS do" }, {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("unknown");
  });

  it("still returns recommendations alongside probe_class", async () => {
    const r = await postReq("/probe-intent", { description: "purchasing compliance" }, {
      "User-Agent": "purchasing-agent/1.0",
    });
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.probe_class).toBe("purchasing-agent");
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBeGreaterThan(0);
    expect(data.call_next).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// /for-agents — budget_negotiation section
// ═════════════════════════════════════════════════════════════════

describe("GET /for-agents — budget negotiation", () => {
  it("includes budget_negotiation in payment section", async () => {
    const r = await getReq("/for-agents");
    expect(r.status).toBe(200);
    const data = JSON.parse(r.body);
    expect(data.payment).toBeDefined();
    const payment = data.payment as Record<string, unknown>;
    expect(payment.budget_negotiation).toBeDefined();
  });

  it("budget_negotiation has header, schema, modes", async () => {
    const r = await getReq("/for-agents");
    const data = JSON.parse(r.body);
    const bn = (data.payment as Record<string, unknown>).budget_negotiation as Record<string, unknown>;
    expect(bn.header).toBe("X-Agent-Budget");
    expect(bn.schema).toBeDefined();
    expect(bn.modes).toBeDefined();
    const modes = bn.modes as Record<string, unknown>;
    expect(modes.standard).toBeDefined();
    expect(modes.lite).toBeDefined();
  });

  it("budget_negotiation includes mode_header", async () => {
    const r = await getReq("/for-agents");
    const data = JSON.parse(r.body);
    const bn = (data.payment as Record<string, unknown>).budget_negotiation as Record<string, unknown>;
    expect(typeof bn.mode_header).toBe("string");
    expect(String(bn.mode_header)).toContain("X-Agent-Mode");
  });

  it("budget_negotiation includes example curl", async () => {
    const r = await getReq("/for-agents");
    const data = JSON.parse(r.body);
    const bn = (data.payment as Record<string, unknown>).budget_negotiation as Record<string, unknown>;
    expect(typeof bn.example).toBe("string");
    expect(String(bn.example)).toContain("X-Agent-Budget");
  });
});
