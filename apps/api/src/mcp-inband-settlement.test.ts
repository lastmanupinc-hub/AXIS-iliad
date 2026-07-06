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
  type MeteredMcpTool,
} from "./mcp-runtime.js";
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
    markInbandSettled(a);
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
    markInbandSettled(req); // gate already collected the cash
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

describe("captureMcpToolCredits never double-charges a settled call", () => {
  it("settled charge -> plan credits are NOT debited", async () => {
    await captureMcpToolCredits(account, { tool: "analyze_repo", amountCents: 50, settled: true });
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
  });
  it("normal charge -> plan credits ARE debited", async () => {
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
    "FIRECRAWL_API_KEY",
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
    // have one — pin AXIS_LLM_MODEL_PATH at a definitely-absent file instead of merely
    // deleting the env var.
    process.env.AXIS_LLM_MODEL_PATH = missingModelPath;
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

  it("iliad_embeddings: not_provisioned unset, settle:true set", async () => {
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.OPENAI_API_KEY = "sk-test";
    expect(await decideInbandGate("iliad_embeddings", { input: "hi" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_embeddings",
    });
  });

  it("iliad_web_research: not_provisioned unset, settle:true set", async () => {
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

  it("iliad_web_research_crawl: not_provisioned unset, settle:true set", async () => {
    expect(await decideInbandGate("iliad_web_research_crawl", { url: "https://example.com" }, "standard")).toEqual({
      settle: false,
      reason: "not_provisioned",
    });
    process.env.FIRECRAWL_API_KEY = "fc-test";
    expect(await decideInbandGate("iliad_web_research_crawl", { url: "https://example.com" }, "standard")).toEqual({
      settle: true,
      tool: "iliad_web_research_crawl",
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

describe("decideInbandGate — total-classification invariant (all 17 MeteredMcpTool names)", () => {
  // A Record keyed by the FULL MeteredMcpTool union — TypeScript enforces exhaustiveness
  // here (a missing or extra key is a compile error), so this list can't silently drift
  // from mcp-runtime.ts's union the way a hand-maintained array could.
  const ALL_METERED_TOOLS: Record<MeteredMcpTool, true> = {
    analyze_files: true,
    analyze_repo: true,
    prepare_agentic_purchasing: true,
    iliad_object_storage: true,
    iliad_vector_database: true,
    iliad_embeddings: true,
    iliad_transactional_email: true,
    iliad_analytics: true,
    iliad_llm_inference: true,
    iliad_code_sandbox: true,
    iliad_speech_to_text: true,
    iliad_text_to_speech: true,
    iliad_web_search: true,
    iliad_document_parsing: true,
    iliad_hygiene: true,
    iliad_web_research: true,
    iliad_web_research_crawl: true,
  };

  // Representative BILLABLE arg shape per tool (matches each runX's own billable branch).
  const BILLABLE_ARGS: Record<MeteredMcpTool, Record<string, unknown>> = {
    analyze_files: {},
    analyze_repo: {},
    prepare_agentic_purchasing: {},
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
    "FIRECRAWL_API_KEY",
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
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(original)) process.env[k as (typeof ENV_KEYS)[number]] = v;
    for (const k of ENV_KEYS) delete original[k];
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exactly 13 of 17 tools settle:true and the other 4 resolve runtime_metered — no tool falls through", async () => {
    const toolNames = Object.keys(ALL_METERED_TOOLS) as MeteredMcpTool[];
    expect(toolNames.length).toBe(17); // proves the invariant covers the full union, not a stale subset

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
    expect(settleTrueCount).toBe(13);
    expect(runtimeMeteredCount).toBe(4);
  });
});

describe("No-double-charge, real dispatch — the REAL runWebSearch honors the settled marker", () => {
  it("settled request: search settles (consumeUsageCredits NOT called) and index stays free either way", async () => {
    const req = { headers: {} } as unknown as IncomingMessage;
    markInbandSettled(req); // gate already collected the cash for this request
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue(overagePreview as never);

    // search is the billable op — authorize/capture run, but the settled marker means
    // captureMcpToolCredits must NOT debit plan credits (no double charge).
    const searchResult = await runWebSearch({ operation: "search", query: "x" }, req);
    expect(typeof searchResult).toBe("string");
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();

    // index is a free op — runWebSearch never calls authorizeMcpToolCredits for it, so
    // it must stay free even on the SAME settled request (the marker isn't a blanket
    // "charge nothing" flag; it only suppresses the plan-credit debit at an actual charge).
    const indexResult = await runWebSearch({ operation: "index", document: { doc_id: "d1", content: "hello world" } }, req);
    expect(typeof indexResult).toBe("string");
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
  });
});

describe("Source guard — INBAND_METERED_TOOLS has zero remaining references", () => {
  it("decideInbandGate is the sole gate-scope authority (grep-clean apps/api/src)", async () => {
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
