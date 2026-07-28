import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";

// H1 — in-band settlement on the MCP tool-call surface. These tests prove the seam
// without a live server or Stripe: the flag gates it, the per-request "settled" marker
// threads through authorize/capture (so a paid call is neither rejected nor double-
// charged), and the shared cash tail (settleOverageCash) behaves like the REST cashier.
//
// WO-02 (Phase 2) extends this suite to decideInbandGate, the sole gate-scope authority
// that replaces the 3-tool Set with a pure classification of all 17 metered MCP tools.

// @axis/snapshots keeps its REAL exports — decideInbandGate's module graph (via
// mcp-tool-impls.ts AND handlers.ts) reads `TIER_LIMITS.free.programs` at module-load
// time, so a bare stub would crash on import. Only the 5 functions this suite drives
// directly are overridden.
vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    previewUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    consumeUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    consumeFreeCall: vi.fn(async () => false),
    recordPaidCall: vi.fn(async () => undefined),
    // WO-19: settleOverageCash persists a payment_receipts row on a chargeMpp 200 —
    // stub it out here (the real DB-backed behaviour is covered by
    // cashier-settled-payment.test.ts and payment-receipts-store.test.ts).
    recordSettledPayment: vi.fn(async () => undefined),
    createReferralCode: vi.fn(async () => ({ code: "ref-test" })),
    // Idempotency-replay seam (the gate + dispatch both consult it) — default: no
    // cached result. The replay response also reads balance/summary; stub both so
    // the handleMcpPost tests below never touch a real DB.
    getIdempotentResult: vi.fn(async () => null),
    // H2.6: gateIdempotency's claim step, exercised whenever a test's req
    // carries an Idempotency-Key and getIdempotentResult finds nothing cached.
    // Default: claim always wins (no concurrent racer in these single-request
    // tests) so existing behavior is unchanged unless a test overrides it.
    claimIdempotencyKey: vi.fn(async () => true),
    completeIdempotencyKey: vi.fn(async () => undefined),
    releaseIdempotencyKey: vi.fn(async () => undefined),
    getPersistenceBalance: vi.fn(async () => 0),
    getUsageCreditSummary: vi.fn(async () => ({ plan_id: "free", monthly_allowance: 0 })),
    // H2.2: the settled-then-error producer writes here — spy, no real DB.
    recordCompensationOwed: vi.fn(async (input: Record<string, unknown>) => ({
      ...input,
      entry_id: "ce_test_1",
      status: "owed",
      attempts: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      resolved_at: null,
    })),
    // H2.4: the compensator runs on EVERY successful _usage build (both
    // dispatch success paths) — stub its whole call graph so this suite's
    // handleMcpPost tests stay DB-free. Default: nothing owed, nothing to do.
    getAccount: vi.fn(async () => ({ account_id: "acc-1", name: "t", email: "t@x.com", tier: "paid", created_at: "2026-01-01T00:00:00.000Z" })),
    listOwedCompensationForAccount: vi.fn(async () => []),
    claimCompensationForCredit: vi.fn(async () => null),
    grantUsageCredits: vi.fn(async () => 0),
    getCompensationSummary: vi.fn(async () => ({ owed_cents: 0, credited_cents: 0 })),
  };
});

// H2.2: a dispatchable settle:true tool that FAILS after the gate collected cash —
// the real runAnalyzeFiles would hit the DB; every handleMcpPost test in this suite
// either replays from cache or is halted by the gate, so a throwing default is safe.
vi.mock("./mcp-tool-impls.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp-tool-impls.js")>();
  return {
    ...actual,
    runAnalyzeFiles: vi.fn(async () => {
      throw new Error("boom: synthetic tool failure after settlement");
    }),
  };
});
vi.mock("./mpp.js", () => ({
  chargeMpp: vi.fn(async () => null),
  getPricingTier: vi.fn(() => ({ standard_cents: 50, lite_cents: 15 })),
  priceForMode: vi.fn(() => 50),
  resolveAgentMode: vi.fn(() => "standard"),
  build402NegotiationBody: vi.fn(() => ({ error: "payment_required" })),
  parseAgentBudget: vi.fn(() => undefined),
  // Unused by decideInbandGate's call graph but imported (unused) by handlers.ts — kept
  // so that import doesn't resolve to undefined for no reason.
  negotiatePrice: vi.fn(),
}));
// Real-dispatch proof only (see "No-double-charge, real dispatch" below): give
// runWebSearch an authenticated account without a real API-key/DB round trip, and
// swap the Postgres-backed search store for an in-memory-free fake. This proves the
// authorize/capture WIRING inside runWebSearch, not the storage layer itself (that's
// web-search.test.ts's job) — exactly the extra mocking the WO-02 spec's verify
// verdict flagged as missing ("mock resolveAuth + search store").
vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return {
    ...actual,
    resolveAuth: vi.fn(async () => ({ account: { account_id: "acc-1", tier: "paid" as const } })),
  };
});
vi.mock("./web-search.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./web-search.js")>();
  return {
    ...actual,
    addDocument: vi.fn(async () => undefined),
    addDocuments: vi.fn(async () => 0),
    searchDocuments: vi.fn(async () => []),
    deleteSearchNamespace: vi.fn(async () => 0),
    deleteDocument: vi.fn(async () => true),
    countSearchDocuments: vi.fn(async () => 0),
  };
});

import {
  inbandSettlementEnabled,
  markInbandSettled,
  isInbandSettled,
  authorizeMcpToolCredits,
  captureMcpToolCredits,
  hashToolRequest,
  METERED_MCP_TOOLS,
  type MeteredMcpTool,
} from "./mcp-runtime.js";
import { handleMcpPost } from "./mcp-server.js";
import { settleOverageCash } from "./cashier.js";
import { decideInbandGate, runWebSearch } from "./mcp-tool-impls.js";
import * as snapshots from "@axis/snapshots";
import * as mpp from "./mpp.js";

const account = { account_id: "acc-1", tier: "paid" as const };
const fakeReq = () => ({ headers: {} }) as unknown as IncomingMessage;
const res = {} as ServerResponse;

// A preview object that reports an overage (the "would be rejected" case).
const overagePreview = {
  effective_overage_cents: 50,
  credits_required: 1,
  included_credits_applied: 0,
  overage_credits: 1,
  plan_id: "pro",
  monthly_allowance: 100,
  included_credits_used: 100,
  included_credits_remaining: 0,
  overage_credits_this_month: 1,
};

beforeEach(() => {
  vi.clearAllMocks(); // reset call history…
  // …then re-establish default implementations (clearAllMocks does NOT reset these).
  vi.mocked(snapshots.previewUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
  vi.mocked(snapshots.consumeUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
  vi.mocked(snapshots.consumeFreeCall).mockResolvedValue(false);
  vi.mocked(snapshots.recordPaidCall).mockResolvedValue(undefined as never);
  vi.mocked(snapshots.createReferralCode).mockResolvedValue({ code: "ref-test" } as never);
  vi.mocked(mpp.chargeMpp).mockResolvedValue(null);
});
afterEach(() => {
  delete process.env.AXIS_MCP_INBAND_SETTLEMENT;
});

describe("H1 feature flag", () => {
  it("defaults OFF when the env var is unset", () => {
    expect(inbandSettlementEnabled()).toBe(false);
  });
  it("enables on 'true' or '1', stays off otherwise", () => {
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "true";
    expect(inbandSettlementEnabled()).toBe(true);
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "1";
    expect(inbandSettlementEnabled()).toBe(true);
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "false";
    expect(inbandSettlementEnabled()).toBe(false);
  });
});

describe("H1 settled marker (per-request, no signature threading)", () => {
  it("is scoped to the exact request object", () => {
    const a = fakeReq();
    const b = fakeReq();
    expect(isInbandSettled(a)).toBe(false);
    markInbandSettled(a, 50);
    expect(isInbandSettled(a)).toBe(true);
    expect(isInbandSettled(b)).toBe(false); // a different request is untouched
  });
});

describe("authorizeMcpToolCredits honors the in-band marker", () => {
  beforeEach(() => {
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue(overagePreview as never);
  });

  it("overage + settled request -> returns a settled charge, does NOT throw", async () => {
    const req = fakeReq();
    markInbandSettled(req, 50); // gate already collected the cash
    const charge = await authorizeMcpToolCredits(req, account, "analyze_repo");
    expect(charge.tool).toBe("analyze_repo");
    expect(charge.settled).toBe(true);
  });

  it("overage + un-settled request -> still throws 402 (unchanged behavior)", async () => {
    const req = fakeReq();
    await expect(
      authorizeMcpToolCredits(req, account, "analyze_repo"),
    ).rejects.toThrow();
  });
});

describe("captureMcpToolCredits records usage for settled AND normal charges", () => {
  // consumeUsageCredits never collects money — it draws down included credits and
  // writes the usage ledger row. The old behavior (skip on settled) meant a
  // partially-covered call never depleted its included credits (the same allowance
  // re-applied every call all month) and stayed invisible to usage analytics. The
  // cash itself is recorded once, in payment_receipts, by the gate — so consuming
  // here cannot double-charge.
  it("settled charge -> usage is still recorded (included credits draw down)", async () => {
    await captureMcpToolCredits(account, { tool: "analyze_repo", amountCents: 50, settled: true });
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledOnce();
  });
  it("normal charge -> usage recorded exactly the same way", async () => {
    await captureMcpToolCredits(account, { tool: "analyze_repo", amountCents: 50 });
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledOnce();
  });
});

describe("settleOverageCash — the shared cash tail", () => {
  const opts = { currency: "usd", decimals: 2 };

  it("nothing owed (overage <= 0) -> 200, never touches the rail", async () => {
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 0, opts);
    expect(r).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
  });

  it("5th-call-free consumed -> 200, never touches the rail", async () => {
    vi.mocked(snapshots.consumeFreeCall).mockResolvedValue(true);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toEqual({ status: 200 });
    expect(mpp.chargeMpp).not.toHaveBeenCalled();
  });

  it("cash paid (chargeMpp 200) -> 200 and the paid call is recorded", async () => {
    vi.mocked(mpp.chargeMpp).mockResolvedValue({ status: 200 } as never);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toEqual({ status: 200 });
    expect(snapshots.recordPaidCall).toHaveBeenCalledWith("acc-1");
  });

  it("challenge issued (chargeMpp 402) -> 402 and NO paid-call record", async () => {
    vi.mocked(mpp.chargeMpp).mockResolvedValue({ status: 402 } as never);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toEqual({ status: 402 });
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
  });

  it("MPP not configured (chargeMpp null) -> null (caller falls back)", async () => {
    vi.mocked(mpp.chargeMpp).mockResolvedValue(null);
    const r = await settleOverageCash(fakeReq(), res, "acc-1", 50, opts);
    expect(r).toBeNull();
    expect(snapshots.recordPaidCall).not.toHaveBeenCalled();
  });
});

// ─── WO-02 (Phase 2): decideInbandGate — the sole gate-scope authority ───────────
//
// Pure classification function: no DB, no HTTP server. Env-var toggling proves the
// config-gate branches (readR2ConfigFromEnv / readEmbeddingsConfigFromEnv /
// readEmailConfigFromEnv / isLlmConfigured / isFirecrawlConfigured) without a live
// backend — exactly mirroring the runX handlers' own not-configured checks.

describe("decideInbandGate — per-op headline (iliad_web_search)", () => {
  it("operation=search settles", async () => {
    expect(await decideInbandGate("iliad_web_search", { operation: "search", query: "x" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_web_search",
    });
  });
  it("operation=index is a free op", async () => {
    expect(await decideInbandGate("iliad_web_search", { operation: "index", document: {} }, "standard")).toEqual({
      settle: false,
      reason: "free_op",
    });
  });
  it("operation=count is a free op", async () => {
    expect(await decideInbandGate("iliad_web_search", { operation: "count" }, "standard")).toEqual({
      settle: false,
      reason: "free_op",
    });
  });
  it("operation=delete is a free op", async () => {
    expect(await decideInbandGate("iliad_web_search", { operation: "delete", doc_id: "d" }, "standard")).toEqual({
      settle: false,
      reason: "free_op",
    });
  });
});

describe("decideInbandGate — per-mode (iliad_hygiene)", () => {
  it("mode=scan (standard) is a free op", async () => {
    expect(await decideInbandGate("iliad_hygiene", { mode: "scan" }, "standard")).toEqual({
      settle: false,
      reason: "free_op",
    });
  });
  it("mode=fix (standard) settles", async () => {
    expect(await decideInbandGate("iliad_hygiene", { mode: "fix" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_hygiene",
    });
  });
  it("engineer mode forces fix even with no mode arg", async () => {
    expect(await decideInbandGate("iliad_hygiene", {}, "engineer")).toEqual({
      settle: true,
      tool: "iliad_hygiene",
    });
  });
});

describe("decideInbandGate — config gate (env-driven)", () => {
  const ENV_KEYS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "OPENAI_API_KEY",
    "AXIS_EMBEDDING_BACKEND",
    "AXIS_EMBEDDING_MODEL_PATH",
    "FIRECRAWL_API_KEY",
    "AXIS_WEB_RESEARCH_BACKEND",
    "RESEND_API_KEY",
    "RESEND_FROM_ADDRESS",
    "AXIS_LLM_MODEL_PATH",
  ] as const;
  const original: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let tmpDir: string;
  let realModelPath: string;
  let missingModelPath: string;

  beforeEach(async () => {
    for (const k of ENV_KEYS) {
      const v = process.env[k];
      if (v !== undefined) original[k] = v;
      delete process.env[k];
    }
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-inband-gate-test-"));
    realModelPath = path.join(tmpDir, "fake.gguf");
    missingModelPath = path.join(tmpDir, "missing.gguf");
    await fs.writeFile(realModelPath, "fake gguf content");
    // Ensure the default model path (models/<...>.gguf at cwd) can't accidentally make
    // an "unset" assertion pass for the wrong reason on a dev machine that happens to
    // have one — pin AXIS_LLM_MODEL_PATH / AXIS_EMBEDDING_MODEL_PATH at definitely-absent
    // files instead of merely deleting the env vars.
    process.env.AXIS_LLM_MODEL_PATH = missingModelPath;
    process.env.AXIS_EMBEDDING_MODEL_PATH = missingModelPath;
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(original)) process.env[k as (typeof ENV_KEYS)[number]] = v;
    for (const k of ENV_KEYS) delete original[k];
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("iliad_object_storage: not_provisioned unset, settle:true set", async () => {
    expect(await decideInbandGate("iliad_object_storage", { operation: "put", key: "k" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET = "bucket";
    expect(await decideInbandGate("iliad_object_storage", { operation: "put", key: "k" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_object_storage",
    });
  });

  it("iliad_embeddings (default local backend): not_provisioned when the GGUF is absent, settle:true when present", async () => {
    // AXIS_EMBEDDING_MODEL_PATH points at missingModelPath from beforeEach.
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.AXIS_EMBEDDING_MODEL_PATH = realModelPath;
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_embeddings",
    });
  });

  it("iliad_embeddings (openai backend): OPENAI_API_KEY alone doesn't provision the default local backend; backend=openai needs the key", async () => {
    // Key set but backend still local (default) with no GGUF → not provisioned.
    process.env.OPENAI_API_KEY = "sk-test";
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    // Explicit openai backend + key → provisioned.
    process.env.AXIS_EMBEDDING_BACKEND = "openai";
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_embeddings",
    });
    // Explicit openai backend WITHOUT the key → not provisioned.
    delete process.env.OPENAI_API_KEY;
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
  });

  it("iliad_web_research: sovereign default settles with NO key; explicit firecrawl w/o key is not_provisioned", async () => {
    // WO-12: the owned sovereign backend is the default and needs no third-party key.
    expect(await decideInbandGate("iliad_web_research", { url: "https://example.com" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_web_research",
    });
    // Operator explicitly selects firecrawl without its key → runX returns
    // _not_configured without charging, so the gate must not pre-settle.
    process.env.AXIS_WEB_RESEARCH_BACKEND = "firecrawl";
    expect(await decideInbandGate("iliad_web_research", { url: "https://example.com" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.FIRECRAWL_API_KEY = "fc-test";
    expect(await decideInbandGate("iliad_web_research", { url: "https://example.com" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_web_research",
    });
  });

  // H-Phase-A cycle 24: iliad_web_research_crawl used to settle:true like its
  // iliad_web_research sibling above, but its PRICING_TIERS entry is a
  // PER-PAGE rate — previewMcpToolOverage has no way to know `limit` up
  // front, so it would only ever collect cash for ONE page regardless of how
  // many the crawl actually processed (up to 100), a live undercharge once
  // AXIS_MCP_INBAND_SETTLEMENT is on. Moved to runtime_metered (like the 4
  // tools below) so it steps aside for dispatch's own correct per-page
  // plan-credit metering (cycle 19) — backend-independent, unlike its sibling.
  it("iliad_web_research_crawl always resolves runtime_metered, regardless of backend config", async () => {
    expect(await decideInbandGate("iliad_web_research_crawl", { url: "https://example.com" }, "standard")).toEqual({
      settle: false,
      reason: "runtime_metered",
    });
    process.env.AXIS_WEB_RESEARCH_BACKEND = "firecrawl";
    expect(await decideInbandGate("iliad_web_research_crawl", { url: "https://example.com" }, "standard")).toEqual({
      settle: false,
      reason: "runtime_metered",
    });
    process.env.FIRECRAWL_API_KEY = "fc-test";
    expect(await decideInbandGate("iliad_web_research_crawl", { url: "https://example.com" }, "standard")).toEqual({
      settle: false,
      reason: "runtime_metered",
    });
  });

  it("iliad_llm_inference: not_provisioned when the GGUF file is absent, settle:true when present", async () => {
    // AXIS_LLM_MODEL_PATH already points at missingModelPath from beforeEach.
    expect(await decideInbandGate("iliad_llm_inference", { prompt: "hi" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.AXIS_LLM_MODEL_PATH = realModelPath;
    expect(await decideInbandGate("iliad_llm_inference", { prompt: "hi" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_llm_inference",
    });
  });

  it("iliad_transactional_email: {to,subject}+standard is not_provisioned w/o RESEND_*, settle:true with RESEND_*", async () => {
    expect(await decideInbandGate("iliad_transactional_email", { to: "a@b.com", subject: "s" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.RESEND_API_KEY = "re-test";
    process.env.RESEND_FROM_ADDRESS = "noreply@example.com";
    expect(await decideInbandGate("iliad_transactional_email", { to: "a@b.com", subject: "s" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_transactional_email",
    });
  });

  it("iliad_transactional_email: {domain}+engineer settles even w/o RESEND_* (pure-generation Deliverability path)", async () => {
    expect(await decideInbandGate("iliad_transactional_email", { domain: "x.com" }, "engineer")).toEqual({
      settle: true,
      tool: "iliad_transactional_email",
    });
  });
});

describe("decideInbandGate — always-billable local tools (no config gate)", () => {
  it("iliad_vector_database upsert/query settle regardless of env; invalid op is free_op", async () => {
    expect(
      await decideInbandGate("iliad_vector_database", { operation: "upsert", vectors: [{ id: "a", vector: [1] }] }, "standard"),
    ).toEqual({ settle: true, tool: "iliad_vector_database" });
    expect(await decideInbandGate("iliad_vector_database", { operation: "query", query: {} }, "standard")).toEqual({
      settle: true,
      tool: "iliad_vector_database",
    });
    expect(await decideInbandGate("iliad_vector_database", { operation: "nope" }, "standard")).toEqual({
      settle: false,
      reason: "free_op",
    });
  });

  it("iliad_analytics capture/query settle regardless of env; invalid op is free_op", async () => {
    expect(await decideInbandGate("iliad_analytics", { operation: "capture", event: {} }, "standard")).toEqual({
      settle: true,
      tool: "iliad_analytics",
    });
    expect(await decideInbandGate("iliad_analytics", { operation: "query", query: { kind: "count" } }, "standard")).toEqual({
      settle: true,
      tool: "iliad_analytics",
    });
    expect(await decideInbandGate("iliad_analytics", { operation: "nope" }, "standard")).toEqual({
      settle: false,
      reason: "free_op",
    });
  });
});

describe("decideInbandGate — Phase-1 regression (WO-01's original 3 tools)", () => {
  it.each(["analyze_files", "analyze_repo", "prepare_agentic_purchasing"] as const)(
    "%s always settles",
    async (tool) => {
      expect(await decideInbandGate(tool, {}, "standard")).toEqual({ settle: true, tool });
    },
  );
});

describe("decideInbandGate — excluded set (runtime-metered, unchanged behavior)", () => {
  it.each([
    "iliad_document_parsing",
    "iliad_code_sandbox",
    "iliad_speech_to_text",
    "iliad_text_to_speech",
    "iliad_web_research_crawl",
  ] as const)("%s resolves runtime_metered", async (tool) => {
    expect(await decideInbandGate(tool, {}, "standard")).toEqual({ settle: false, reason: "runtime_metered" });
  });
});

describe("decideInbandGate — out of scope", () => {
  it("a free/discovery tool name resolves not_in_scope", async () => {
    expect(await decideInbandGate("list_programs", {}, "standard")).toEqual({
      settle: false,
      reason: "not_in_scope",
    });
  });
  it("an unknown tool name resolves not_in_scope", async () => {
    expect(await decideInbandGate("totally_unknown_tool_xyz", {}, "standard")).toEqual({
      settle: false,
      reason: "not_in_scope",
    });
  });
});

describe("decideInbandGate — total-classification invariant (every MeteredMcpTool name)", () => {
  // H-Phase-A cycle 4: this used to be a hand-typed `Record<MeteredMcpTool, true>`
  // literal, on the theory that "TypeScript enforces exhaustiveness here." That's
  // true of the TYPE in isolation, but this is a `.test.ts` file, and
  // apps/api/tsconfig.json excludes `src/**/*.test.ts` from the tsc pass CI
  // actually runs — so a missing key here was never a build error in practice.
  // closer/deploy/assemble_representment silently fell out of this list for a
  // full cycle, undetected. METERED_MCP_TOOLS (imported from mcp-runtime.ts, a
  // real source file tsc always checks) is now the actual source of truth —
  // this test iterates it directly instead of re-declaring the tool list.
  const toolNames = METERED_MCP_TOOLS;

  // Representative BILLABLE arg shape per tool (matches each runX's own billable branch).
  // If a future tool is added to MeteredMcpTool without an entry here,
  // BILLABLE_ARGS[tool] is `undefined` and decideInbandGate throws on it (most
  // branches destructure `args`) — the test fails loudly rather than silently
  // skipping the new tool, even without compile-time exhaustiveness on this object.
  const BILLABLE_ARGS: Record<MeteredMcpTool, Record<string, unknown>> = {
    ping_payment: {},
    analyze_files: {},
    analyze_repo: {},
    prepare_agentic_purchasing: {},
    closer: { snapshot_id: "snap_x" },
    deploy: { snapshot_id: "snap_x" },
    assemble_representment: { dispute_id: "dp_x" },
    iliad_object_storage: { operation: "put", key: "k" },
    iliad_vector_database: { operation: "upsert", vectors: [{ id: "a", vector: [1] }] },
    iliad_embeddings: { input: "hello" },
    iliad_transactional_email: { to: "a@b.com", subject: "s" },
    iliad_analytics: { operation: "capture", event: {} },
    iliad_llm_inference: { prompt: "hi" },
    iliad_code_sandbox: { language: "python", code: "print(1)" },
    iliad_speech_to_text: {},
    iliad_text_to_speech: { text: "hi" },
    iliad_web_search: { operation: "search", query: "x" },
    iliad_document_parsing: {},
    iliad_hygiene: { mode: "fix", files: [{ path: "a.ts", content: "x" }] },
    iliad_web_research: { url: "https://example.com" },
    iliad_web_research_crawl: { url: "https://example.com" },
  };

  const ENV_KEYS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
    "OPENAI_API_KEY",
    "AXIS_EMBEDDING_BACKEND",
    "AXIS_EMBEDDING_MODEL_PATH",
    "FIRECRAWL_API_KEY",
    "AXIS_WEB_RESEARCH_BACKEND",
    "RESEND_API_KEY",
    "RESEND_FROM_ADDRESS",
    "AXIS_LLM_MODEL_PATH",
  ] as const;
  const original: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let tmpDir: string;

  beforeEach(async () => {
    for (const k of ENV_KEYS) {
      const v = process.env[k];
      if (v !== undefined) original[k] = v;
    }
    delete process.env.AXIS_EMBEDDING_BACKEND; // default (sovereign local) backend
    delete process.env.AXIS_WEB_RESEARCH_BACKEND; // default (sovereign) backend (WO-12)
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET = "bucket";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.FIRECRAWL_API_KEY = "fc-test";
    process.env.RESEND_API_KEY = "re-test";
    process.env.RESEND_FROM_ADDRESS = "noreply@example.com";
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-inband-total-test-"));
    const modelPath = path.join(tmpDir, "fake.gguf");
    await fs.writeFile(modelPath, "fake gguf content");
    process.env.AXIS_LLM_MODEL_PATH = modelPath;
    // WO-11: iliad_embeddings defaults to the sovereign local backend — provision
    // it the same way as iliad_llm_inference (a present GGUF file).
    process.env.AXIS_EMBEDDING_MODEL_PATH = modelPath;
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(original)) process.env[k as (typeof ENV_KEYS)[number]] = v;
    for (const k of ENV_KEYS) delete original[k];
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exactly 16 of 21 tools settle:true and the other 5 resolve runtime_metered — no tool falls through", async () => {
    expect(toolNames.length).toBe(21); // proves the invariant covers the full union, not a stale subset

    let settleTrueCount = 0;
    let runtimeMeteredCount = 0;
    for (const tool of toolNames) {
      const decision = await decideInbandGate(tool, BILLABLE_ARGS[tool], "standard");
      if (decision.settle) {
        settleTrueCount++;
      } else if (decision.reason === "runtime_metered") {
        runtimeMeteredCount++;
      } else {
        throw new Error(`${tool} classified as "${decision.reason}", expected settle:true or runtime_metered`);
      }
    }
    expect(settleTrueCount).toBe(16);
    expect(runtimeMeteredCount).toBe(5);
  });
});

describe("No-double-charge, real dispatch — the REAL runWebSearch honors the settled marker", () => {
  it("settled request: search records usage once (no 402) and index stays free either way", async () => {
    const req = { headers: {} } as unknown as IncomingMessage;
    markInbandSettled(req, 50); // gate already collected the cash for this request
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue(overagePreview as never);

    // search is the billable op — the settled marker means authorize does NOT throw
    // the 402, and capture records the usage (included-credit drawdown + ledger row)
    // exactly once. Recording usage is not a second charge: the cash lives solely
    // in payment_receipts, written by the gate.
    const searchResult = await runWebSearch({ operation: "search", query: "x" }, req);
    expect(typeof searchResult).toBe("string");
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledOnce();

    // index is a free op — runWebSearch never calls authorizeMcpToolCredits for it, so
    // it must stay free even on the SAME settled request (the marker isn't a blanket
    // flag; it only affects behavior at an actual charge site).
    const indexResult = await runWebSearch({ operation: "index", document: { doc_id: "d1", content: "hello world" } }, req);
    expect(typeof indexResult).toBe("string");
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledOnce(); // unchanged — still just the one search call
  });
});

// ─── Idempotent retries must REPLAY, never re-charge (the gate runs pre-dispatch) ──
//
// The in-band gate fires BEFORE dispatch's replay lookup, and a settled call's
// credits are consumed at capture — but its cash lives in payment_receipts, so the
// gate's re-preview on a retry may still show overage > 0. Without consulting the
// idempotency cache, the gate would challenge (or charge) the SAME logical call a
// second time for work that already ran. These drive the REAL handleMcpPost.
describe("in-band gate + Idempotency-Key: retry of a settled call never re-charges", () => {
  function fakeRes() {
    const res = {
      statusCode: 0,
      body: "",
      writeHead: vi.fn(function (this: { statusCode: number }, code: number) { (res as { statusCode: number }).statusCode = code; }),
      end: vi.fn(function (chunk?: string) { res.body = chunk ?? ""; }),
    };
    return res as unknown as ServerResponse & { statusCode: number; body: string };
  }
  // Empty args = full-suite request -> decideInbandGate classifies analyze_files
  // settle:true (mirrors BILLABLE_ARGS below; args naming only free programs would
  // classify free_op and the gate would never fire, vacuously passing these tests).
  const toolArgs = {};
  const msg = {
    jsonrpc: "2.0" as const,
    id: 1,
    method: "tools/call",
    params: { name: "analyze_files", arguments: toolArgs },
  };

  beforeEach(() => {
    process.env.AXIS_MCP_INBAND_SETTLEMENT = "1";
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue(overagePreview as never);
  });

  it("retry with a cached Idempotency-Key result: gate passes through, dispatch replays, zero rail contact", async () => {
    const req = { headers: { "idempotency-key": "K-1" }, socket: {} } as unknown as IncomingMessage;
    vi.mocked(snapshots.getIdempotentResult).mockResolvedValue({
      response: "cached result",
      request_hash: hashToolRequest("analyze_files", toolArgs),
    } as never);
    const res = fakeRes();

    await handleMcpPost(req, res, undefined, msg);

    const parsed = JSON.parse(res.body) as { result?: { _idempotent_replay?: boolean } };
    expect(parsed.result?._idempotent_replay).toBe(true);
    expect(res.statusCode).not.toBe(402);      // no fresh payment challenge
    expect(mpp.chargeMpp).not.toHaveBeenCalled();          // rail never touched
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled(); // no second debit
  });

  it("settled-then-error: a cash-settled call whose tool throws records an owed compensation entry (H2.2)", async () => {
    const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
    // The gate settles the 50c overage in-band (chargeMpp 200 = cash collected)…
    vi.mocked(mpp.chargeMpp).mockResolvedValueOnce({ status: 200 } as never);
    const res = fakeRes();

    await handleMcpPost(req, res, undefined, msg);

    // …the tool then failed (throwing runAnalyzeFiles mock): the customer paid
    // for work that never happened — the make-whole obligation must be durable.
    expect(snapshots.recordSettledPayment).toHaveBeenCalledTimes(1); // the receipt row (cash truth)
    expect(snapshots.recordCompensationOwed).toHaveBeenCalledTimes(1);
    expect(snapshots.recordCompensationOwed).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: "acc-1",
        tool: "analyze_files",
        amount_cents: 50,
        reason: "settled_then_error",
      }),
    );
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled(); // capture never reached

    // The agent SEES the make-good in the error envelope.
    const parsed = JSON.parse(res.body) as { result?: { isError?: boolean; _compensation?: { entry_id: string; status: string } } };
    expect(parsed.result?.isError).toBe(true);
    expect(parsed.result?._compensation).toMatchObject({ entry_id: "ce_test_1", status: "owed" });
  });

  it("an UNSETTLED failure records no compensation (nothing was collected)", async () => {
    const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
    // Default previews in the outer beforeEach show zero overage -> gate passthrough,
    // no cash moves; override the inner beforeEach's overage preview back to zero.
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
    const res = fakeRes();

    await handleMcpPost(req, res, undefined, msg);

    expect(snapshots.recordCompensationOwed).not.toHaveBeenCalled();
    const parsed = JSON.parse(res.body) as { result?: { isError?: boolean; _compensation?: unknown } };
    expect(parsed.result?.isError).toBe(true);
    expect(parsed.result?._compensation).toBeUndefined();
  });

  it("first call (no cached result): the gate still fires and halts dispatch", async () => {
    const req = { headers: { "idempotency-key": "K-2" }, socket: {} } as unknown as IncomingMessage;
    vi.mocked(snapshots.getIdempotentResult).mockResolvedValue(null as never);
    vi.mocked(mpp.chargeMpp).mockResolvedValue({ status: 402 } as never);
    const res = fakeRes();

    await handleMcpPost(req, res, undefined, msg);

    // The rail was engaged (the real chargeMpp writes the x402 challenge itself —
    // the mock only returns the status), and the gate stopped the request: no
    // JSON-RPC tool result was dispatched and no plan credits were consumed.
    expect(mpp.chargeMpp).toHaveBeenCalledOnce();
    expect(res.body).toBe("");
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
  });
});

describe("Source guard — INBAND_METERED_TOOLS has zero remaining references", () => {
  // Reads every .ts in apps/api/src — a filesystem scan, not a behavior test; on a
  // loaded Windows checkout it can brush past the 5s default (observed 5022ms).
  it("decideInbandGate is the sole gate-scope authority (grep-clean apps/api/src)", { timeout: 30_000 }, async () => {
    const dir = path.dirname(fileURLToPath(import.meta.url)); // apps/api/src
    const needle = "INBAND_METERED_TOOLS";
    const entries = await fs.readdir(dir);
    const offenders: string[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".ts") || entry === "mcp-inband-settlement.test.ts") continue;
      const content = await fs.readFile(path.join(dir, entry), "utf-8");
      if (content.includes(needle)) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });
});
