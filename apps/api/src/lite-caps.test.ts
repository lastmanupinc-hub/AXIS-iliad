/**
 * lite-caps.test.ts — the lite-mode cap enforcement table (lite-caps.ts).
 *
 * Three layers:
 *  1. UNIT — every clamp/truncate/force/reject for the 10 pure input-transform
 *     tools, plus standard/engineer pass-through and caller-args non-mutation.
 *  2. CONTRACT — parses the numeric caps out of each tool's lite_description
 *     in @axis/mpp PRICING_TIERS (tolerating both "Lite mode:" and
 *     "Free tier:" prefixes by never anchoring on them) and asserts they equal
 *     the table's constants. A copy edit that changes a number without
 *     changing enforcement — or vice versa — fails here.
 *  3. E2E — lite behavior through the REAL MCP dispatch (mocked auth + credit
 *     fns, mirroring mcp-embeddings.test.ts): clamps reach the tool impl,
 *     rejects return isError without charging, standard mode is untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "node:http";

vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return {
    ...actual,
    resolveAuth: vi.fn(async () => ({ account: { account_id: "acc-lite", tier: "paid" as const } })),
  };
});

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    previewUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    consumeUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    recordMcpUsage: vi.fn(async () => undefined),
    getPersistenceBalance: vi.fn(async () => 0),
    getUsageCreditSummary: vi.fn(async () => ({ plan_id: "test-stub" })),
  };
});

vi.mock("./compensator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./compensator.js")>();
  return {
    ...actual,
    compensateAndSummarize: vi.fn(async () => null),
  };
});

vi.mock("./llm-inference.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm-inference.js")>();
  return {
    ...actual,
    isLlmConfigured: vi.fn(async () => true),
    runCompletion: vi.fn(async () => ({ backend: "local", model: "stub-gguf", text: "ok" })),
  };
});

vi.mock("./embeddings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./embeddings.js")>();
  return {
    ...actual,
    computeEmbeddings: vi.fn(async () => ({
      backend: "local",
      model: "stub-gguf",
      dimensions: 2,
      count: 2,
      vectors: [[0.25, -0.5], [0.5, 0.25]],
    })),
  };
});

vi.mock("./local-embeddings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./local-embeddings.js")>();
  return {
    ...actual,
    isLocalEmbeddingsConfigured: vi.fn(async () => true),
    getEmbeddingModelPath: vi.fn(() => "/fake/model.gguf"),
  };
});

import { applyLiteCaps, LITE_CAPS, LITE_CAPPED_TOOL_NAMES } from "./lite-caps.js";
import { LITE_CRAWL_MAX_PAGES } from "./handlers.js";
import { PRICING_TIERS } from "@axis/mpp";
import { dispatch } from "./mcp-server.js";
import { runCompletion } from "./llm-inference.js";
import { computeEmbeddings } from "./embeddings.js";
import * as snapshots from "@axis/snapshots";

// H-Phase-A cycle 5: LITE_CAPPED_TOOLS used to have no structural link to
// LITE_RULES (the real enforcement table in lite-caps.ts, which was entirely
// private) — a tool added there with real enforcement rules could ship
// completely untested if this list wasn't also updated by hand, with zero
// compile error and zero runtime canary. Kept as a literal `as const` tuple
// (OVER_CAP_ARGS below needs the specific per-tool literal keys for its own
// type safety, which a plain `readonly string[]` can't provide), but a
// canary test asserts its contents match the real, exported
// LITE_CAPPED_TOOL_NAMES exactly.
const LITE_CAPPED_TOOLS = [
  "iliad_object_storage",
  "iliad_vector_database",
  "iliad_embeddings",
  "iliad_transactional_email",
  "iliad_analytics",
  "iliad_llm_inference",
  "iliad_code_sandbox",
  "iliad_text_to_speech",
  "iliad_web_search",
  "iliad_web_research_crawl",
] as const;

describe("LITE_CAPPED_TOOLS — stays in sync with the real LITE_RULES table", () => {
  it("has exactly the same tool set as lite-caps.ts's own LITE_CAPPED_TOOL_NAMES", () => {
    expect([...LITE_CAPPED_TOOLS].sort()).toEqual([...LITE_CAPPED_TOOL_NAMES].sort());
  });
});

/** Over-cap args per tool — used by the pass-through tests. */
const OVER_CAP_ARGS: Record<(typeof LITE_CAPPED_TOOLS)[number], Record<string, unknown>> = {
  iliad_object_storage: { operation: "get", key: "k", ttl_seconds: 86400 },
  iliad_vector_database: { operation: "query", query: { vector: [1], top_k: 100 } },
  iliad_embeddings: { input: ["a", "b"] },
  iliad_transactional_email: { to: ["a@x.com", "b@x.com"], subject: "s", body_html: "<b>hi</b>" },
  iliad_analytics: { operation: "capture", events: new Array(60).fill({ event: "e" }) },
  iliad_llm_inference: { prompt: "p", max_tokens: 2048, temperature: 1.5 },
  iliad_code_sandbox: { language: "node", code: "1", timeout_seconds: 600 },
  iliad_text_to_speech: { text: "x".repeat(600), format: "mp3" },
  iliad_web_search: { operation: "search", query: "q", max_results: 100 },
  iliad_web_research_crawl: { url: "https://example.com", limit: 100 },
};

describe("applyLiteCaps — standard/engineer pass-through", () => {
  it("returns the caller's args untouched (same reference, no rejection) for every capped tool", () => {
    for (const tool of LITE_CAPPED_TOOLS) {
      for (const mode of ["standard", "engineer"] as const) {
        const args = { ...OVER_CAP_ARGS[tool] };
        const out = applyLiteCaps(tool, mode, args);
        expect(out.rejection, `${tool} (${mode}) must not reject`).toBeUndefined();
        expect(out.args, `${tool} (${mode}) must pass args through by reference`).toBe(args);
      }
    }
  });

  it("passes unknown tools through untouched even in lite mode", () => {
    const args = { anything: 999999 };
    const out = applyLiteCaps("analyze_repo", "lite", args);
    expect(out.rejection).toBeUndefined();
    expect(out.args).toBe(args);
  });
});

describe("applyLiteCaps — per-tool lite enforcement", () => {
  it("iliad_object_storage: clamps ttl_seconds to 3600; leaves within-cap, absent, and non-numeric values alone", () => {
    expect(
      applyLiteCaps("iliad_object_storage", "lite", { ttl_seconds: 86400 }).args.ttl_seconds,
    ).toBe(LITE_CAPS.OBJECT_STORAGE_MAX_TTL_SECONDS);
    expect(applyLiteCaps("iliad_object_storage", "lite", { ttl_seconds: 600 }).args.ttl_seconds).toBe(600);
    // Absent ttl defaults to 3600 in the handler (already the cap) — no fill.
    expect("ttl_seconds" in applyLiteCaps("iliad_object_storage", "lite", { key: "k" }).args).toBe(false);
    // Wrong types stay put so the handler's own validation still fires.
    expect(applyLiteCaps("iliad_object_storage", "lite", { ttl_seconds: "24h" }).args.ttl_seconds).toBe("24h");
    expect(applyLiteCaps("iliad_object_storage", "lite", { ttl_seconds: Infinity }).args.ttl_seconds).toBe(Infinity);
  });

  it("iliad_vector_database: clamps nested query.top_k to 10 without touching the caller's query object", () => {
    const query = { vector: [1, 2], top_k: 100 };
    const args = { operation: "query", query };
    const out = applyLiteCaps("iliad_vector_database", "lite", args);
    expect(out.rejection).toBeUndefined();
    expect((out.args.query as Record<string, unknown>).top_k).toBe(LITE_CAPS.VECTOR_QUERY_MAX_TOP_K);
    expect((out.args.query as Record<string, unknown>).vector).toBe(query.vector);
    expect(query.top_k).toBe(100); // caller's nested object never mutated
    expect(args.query).toBe(query);
    // Within-cap and missing-query shapes pass through for the handler to validate.
    const small = applyLiteCaps("iliad_vector_database", "lite", { operation: "query", query: { vector: [1], top_k: 5 } });
    expect((small.args.query as Record<string, unknown>).top_k).toBe(5);
    expect("query" in applyLiteCaps("iliad_vector_database", "lite", { operation: "query" }).args).toBe(false);
  });

  it("iliad_embeddings: rejects array input (even a 1-element array) naming the limit and the unlock header", () => {
    for (const input of [["a", "b"], ["solo"]]) {
      const out = applyLiteCaps("iliad_embeddings", "lite", { input });
      expect(out.rejection).toMatch(/single string/);
      expect(out.rejection).toMatch(/X-Agent-Mode: standard/);
    }
    expect(applyLiteCaps("iliad_embeddings", "lite", { input: "hello" }).rejection).toBeUndefined();
  });

  it("iliad_transactional_email: rejects >1 recipient and any body_html; single recipient plaintext passes", () => {
    const multi = applyLiteCaps("iliad_transactional_email", "lite", { to: ["a@x.com", "b@x.com"], subject: "s", body_text: "t" });
    expect(multi.rejection).toMatch(/single recipient/);
    expect(multi.rejection).toMatch(/X-Agent-Mode: standard/);

    const html = applyLiteCaps("iliad_transactional_email", "lite", { to: "a@x.com", subject: "s", body_html: "<b>hi</b>" });
    expect(html.rejection).toMatch(/plaintext/);
    expect(html.rejection).toMatch(/X-Agent-Mode: standard/);

    expect(applyLiteCaps("iliad_transactional_email", "lite", { to: "a@x.com", subject: "s", body_text: "t" }).rejection).toBeUndefined();
    expect(applyLiteCaps("iliad_transactional_email", "lite", { to: ["a@x.com"], subject: "s", body_text: "t" }).rejection).toBeUndefined();
  });

  it("iliad_analytics: rejects capture batches above 50; a 50-event batch passes", () => {
    const over = applyLiteCaps("iliad_analytics", "lite", {
      operation: "capture",
      events: new Array(LITE_CAPS.ANALYTICS_CAPTURE_MAX_BATCH + 1).fill({ event: "e" }),
    });
    expect(over.rejection).toMatch(/above 50/);
    expect(over.rejection).toMatch(/X-Agent-Mode: standard/);

    const at = applyLiteCaps("iliad_analytics", "lite", {
      operation: "capture",
      events: new Array(LITE_CAPS.ANALYTICS_CAPTURE_MAX_BATCH).fill({ event: "e" }),
    });
    expect(at.rejection).toBeUndefined();
  });

  it("iliad_analytics: clamps query.limit to 25, fills the absent default (100 > 25), never conjures a missing query object", () => {
    const clamped = applyLiteCaps("iliad_analytics", "lite", { operation: "query", query: { kind: "count_by_event", limit: 1000 } });
    expect((clamped.args.query as Record<string, unknown>).limit).toBe(LITE_CAPS.ANALYTICS_QUERY_MAX_LIMIT);

    const query = { kind: "count_by_event" };
    const filled = applyLiteCaps("iliad_analytics", "lite", { operation: "query", query });
    expect((filled.args.query as Record<string, unknown>).limit).toBe(LITE_CAPS.ANALYTICS_QUERY_MAX_LIMIT);
    expect("limit" in query).toBe(false); // caller's nested object never mutated

    expect((applyLiteCaps("iliad_analytics", "lite", { operation: "query", query: { kind: "count", limit: 10 } }).args.query as Record<string, unknown>).limit).toBe(10);
    expect("query" in applyLiteCaps("iliad_analytics", "lite", { operation: "query" }).args).toBe(false);
  });

  it("iliad_llm_inference: clamps max_tokens to 256 (filling the 512 default when absent) and locks temperature at 0", () => {
    const clamped = applyLiteCaps("iliad_llm_inference", "lite", { prompt: "p", max_tokens: 2048, temperature: 1.5 });
    expect(clamped.args.max_tokens).toBe(LITE_CAPS.LLM_MAX_TOKENS);
    expect(clamped.args.temperature).toBe(LITE_CAPS.LLM_TEMPERATURE);

    const filled = applyLiteCaps("iliad_llm_inference", "lite", { prompt: "p" });
    expect(filled.args.max_tokens).toBe(LITE_CAPS.LLM_MAX_TOKENS);
    expect(filled.args.temperature).toBe(LITE_CAPS.LLM_TEMPERATURE);

    const under = applyLiteCaps("iliad_llm_inference", "lite", { prompt: "p", max_tokens: 64, temperature: 0.2 });
    expect(under.args.max_tokens).toBe(64); // within cap — untouched
    expect(under.args.temperature).toBe(0); // locked regardless
  });

  it("iliad_code_sandbox: rejects node, clamps timeout_seconds to 10 (filling the 30s default when absent)", () => {
    const node = applyLiteCaps("iliad_code_sandbox", "lite", { language: "node", code: "1" });
    expect(node.rejection).toMatch(/python\/bash only/);
    expect(node.rejection).toMatch(/X-Agent-Mode: standard/);

    const clamped = applyLiteCaps("iliad_code_sandbox", "lite", { language: "python", code: "1", timeout_seconds: 600 });
    expect(clamped.rejection).toBeUndefined();
    expect(clamped.args.timeout_seconds).toBe(LITE_CAPS.SANDBOX_MAX_TIMEOUT_SECONDS);

    const filled = applyLiteCaps("iliad_code_sandbox", "lite", { language: "bash", code: "1" });
    expect(filled.args.timeout_seconds).toBe(LITE_CAPS.SANDBOX_MAX_TIMEOUT_SECONDS);

    expect(applyLiteCaps("iliad_code_sandbox", "lite", { language: "python", code: "1", timeout_seconds: 5 }).args.timeout_seconds).toBe(5);
  });

  it("iliad_text_to_speech: truncates text to 500 chars and locks format to wav", () => {
    const long = "x".repeat(600);
    const out = applyLiteCaps("iliad_text_to_speech", "lite", { text: long, format: "mp3" });
    expect((out.args.text as string).length).toBe(LITE_CAPS.TTS_MAX_TEXT_CHARS);
    expect(out.args.text).toBe(long.slice(0, LITE_CAPS.TTS_MAX_TEXT_CHARS));
    expect(out.args.format).toBe(LITE_CAPS.TTS_FORMAT);

    const short = applyLiteCaps("iliad_text_to_speech", "lite", { text: "hello" });
    expect(short.args.text).toBe("hello");
    expect(short.args.format).toBe("wav"); // locked even when absent
  });

  it("iliad_web_search: clamps max_results to 10; absent stays absent (default already equals the cap)", () => {
    expect(applyLiteCaps("iliad_web_search", "lite", { operation: "search", query: "q", max_results: 100 }).args.max_results).toBe(LITE_CAPS.WEB_SEARCH_MAX_RESULTS);
    expect(applyLiteCaps("iliad_web_search", "lite", { operation: "search", query: "q", max_results: 3 }).args.max_results).toBe(3);
    expect("max_results" in applyLiteCaps("iliad_web_search", "lite", { operation: "search", query: "q" }).args).toBe(false);
  });

  it("iliad_web_research_crawl: clamps limit to 5 (filling the 10-page default when absent)", () => {
    expect(applyLiteCaps("iliad_web_research_crawl", "lite", { url: "https://e.com", limit: 100 }).args.limit).toBe(LITE_CAPS.CRAWL_MAX_PAGES);
    expect(applyLiteCaps("iliad_web_research_crawl", "lite", { url: "https://e.com" }).args.limit).toBe(LITE_CAPS.CRAWL_MAX_PAGES);
    expect(applyLiteCaps("iliad_web_research_crawl", "lite", { url: "https://e.com", limit: 2 }).args.limit).toBe(2);
  });

  it("never mutates the caller's args (clamps operate on a copy; rejection returns the original reference)", () => {
    const args = { prompt: "p", max_tokens: 2048, temperature: 1.5, nested: { keep: true } };
    const before = JSON.stringify(args);
    const out = applyLiteCaps("iliad_llm_inference", "lite", args);
    expect(out.args).not.toBe(args);
    expect(JSON.stringify(args)).toBe(before);
    expect(out.args.nested).toBe(args.nested); // untouched keys keep identity

    const rejectArgs = { input: ["a", "b"] };
    const rejected = applyLiteCaps("iliad_embeddings", "lite", rejectArgs);
    expect(rejected.args).toBe(rejectArgs); // nothing transformed on rejection
  });
});

// ─── CONTRACT: lite_description copy ↔ enforcement table ─────────
//
// The regexes are unanchored, so both "Lite mode:" and "Free tier:" prefixes
// are tolerated. Each numeric promise in the copy must equal the table's
// constant — editing one without the other fails CI in both directions.

function liteDesc(tool: string): string {
  const tier = PRICING_TIERS[tool];
  expect(tier, `${tool} missing from PRICING_TIERS`).toBeDefined();
  return tier.lite_description;
}

function pinnedNumber(tool: string, re: RegExp): number {
  const desc = liteDesc(tool);
  const m = desc.match(re);
  expect(m, `${tool}: /${re.source}/ not found in "${desc}"`).not.toBeNull();
  return Number((m as RegExpMatchArray)[1]);
}

describe("contract: PRICING_TIERS lite_description pins the enforcement table", () => {
  it("iliad_object_storage: promised TTL cap (hours) equals the table's seconds constant", () => {
    expect(pinnedNumber("iliad_object_storage", /(\d+)h TTL cap/) * 3600).toBe(LITE_CAPS.OBJECT_STORAGE_MAX_TTL_SECONDS);
  });

  it("iliad_vector_database: promised top_k cap equals the table constant", () => {
    expect(pinnedNumber("iliad_vector_database", /top_k capped at (\d+)/)).toBe(LITE_CAPS.VECTOR_QUERY_MAX_TOP_K);
  });

  it("iliad_embeddings: 'single-string input only' promise is enforced as an array reject", () => {
    expect(liteDesc("iliad_embeddings")).toMatch(/single-string input only/);
    expect(applyLiteCaps("iliad_embeddings", "lite", { input: ["a"] }).rejection).toBeTruthy();
  });

  it("iliad_transactional_email: 'single recipient + plaintext body only' promises are enforced as rejects", () => {
    const desc = liteDesc("iliad_transactional_email");
    expect(desc).toMatch(/single recipient/);
    expect(desc).toMatch(/plaintext body only/);
    expect(LITE_CAPS.EMAIL_MAX_RECIPIENTS).toBe(1); // "single"
    expect(applyLiteCaps("iliad_transactional_email", "lite", { to: ["a@x.com", "b@x.com"] }).rejection).toBeTruthy();
    expect(applyLiteCaps("iliad_transactional_email", "lite", { to: "a@x.com", body_html: "<p/>" }).rejection).toBeTruthy();
  });

  it("iliad_analytics: promised batch-reject threshold and query-limit cap equal the table constants", () => {
    expect(pinnedNumber("iliad_analytics", /capture batches above (\d+) are rejected/)).toBe(LITE_CAPS.ANALYTICS_CAPTURE_MAX_BATCH);
    expect(pinnedNumber("iliad_analytics", /query limit capped at (\d+)/)).toBe(LITE_CAPS.ANALYTICS_QUERY_MAX_LIMIT);
  });

  it("iliad_llm_inference: promised max_tokens cap and locked temperature equal the table constants", () => {
    expect(pinnedNumber("iliad_llm_inference", /max_tokens capped at (\d+)/)).toBe(LITE_CAPS.LLM_MAX_TOKENS);
    expect(pinnedNumber("iliad_llm_inference", /temperature locked at (\d+)/)).toBe(LITE_CAPS.LLM_TEMPERATURE);
  });

  it("iliad_code_sandbox: promised timeout cap equals the table constant and 'no node' is enforced as a reject", () => {
    expect(pinnedNumber("iliad_code_sandbox", /timeout_seconds capped at (\d+)/)).toBe(LITE_CAPS.SANDBOX_MAX_TIMEOUT_SECONDS);
    expect(liteDesc("iliad_code_sandbox")).toMatch(/no node/);
    expect(applyLiteCaps("iliad_code_sandbox", "lite", { language: "node", code: "1" }).rejection).toBeTruthy();
  });

  it("iliad_text_to_speech: promised text cap and locked format equal the table constants", () => {
    expect(pinnedNumber("iliad_text_to_speech", /text capped at (\d+) chars/)).toBe(LITE_CAPS.TTS_MAX_TEXT_CHARS);
    const m = liteDesc("iliad_text_to_speech").match(/format locked to (\w+)/);
    expect(m).not.toBeNull();
    expect((m as RegExpMatchArray)[1]).toBe(LITE_CAPS.TTS_FORMAT);
  });

  it("iliad_web_search: promised max_results cap equals the table constant", () => {
    expect(pinnedNumber("iliad_web_search", /max_results capped at (\d+)/)).toBe(LITE_CAPS.WEB_SEARCH_MAX_RESULTS);
  });

  it("iliad_web_research_crawl: promised page cap equals the table constant", () => {
    expect(pinnedNumber("iliad_web_research_crawl", /crawl up to (\d+) pages/)).toBe(LITE_CAPS.CRAWL_MAX_PAGES);
  });

  // H-Phase-A cycle 3: POST /v1/research/crawl (REST) and the
  // iliad_web_research_crawl MCP tool are two independently-enforced code
  // paths for the SAME externally-visible promise ("lite mode caps crawls at
  // 5 pages") — handlers.ts's LITE_CRAWL_MAX_PAGES literal has no structural
  // link to this table's CRAWL_MAX_PAGES, so a future edit to one alone
  // would silently break the promise on the other route. Not a live bug
  // today (both are 5) — this pins them together so drift fails CI instead
  // of shipping silently.
  it("REST's LITE_CRAWL_MAX_PAGES matches the MCP table's CRAWL_MAX_PAGES (no silent drift between the two routes)", () => {
    expect(LITE_CRAWL_MAX_PAGES).toBe(LITE_CAPS.CRAWL_MAX_PAGES);
  });

  it("iliad_web_research: copy claims no behavioral difference, and the table imposes none", () => {
    expect(liteDesc("iliad_web_research")).toMatch(/same markdown output as standard/);
    const args = { url: "https://example.com" };
    const out = applyLiteCaps("iliad_web_research", "lite", args);
    expect(out.rejection).toBeUndefined();
    expect(out.args).toBe(args);
  });
});

// ─── E2E: lite behavior through the real MCP dispatch ────────────

function liteReq(): IncomingMessage {
  return { headers: { "x-agent-mode": "lite" }, socket: {} } as unknown as IncomingMessage;
}

interface ToolCallResult {
  isError: boolean;
  content: Array<{ type: string; text: string }>;
  _error?: { code: string; retryable: boolean };
}

function resultOf(res: unknown): ToolCallResult {
  const r = res as { result?: ToolCallResult; error?: unknown };
  expect(r.error, "expected a JSON-RPC success envelope").toBeUndefined();
  expect(r.result).toBeDefined();
  return r.result as ToolCallResult;
}

describe("lite caps through real MCP dispatch", () => {
  // The standard-mode embeddings test exercises the REAL config resolution —
  // pin the env so an ambient AXIS_EMBEDDING_BACKEND/OPENAI_API_KEY can't
  // steer it off the default local backend.
  const ENV_KEYS = ["AXIS_EMBEDDING_BACKEND", "OPENAI_API_KEY"] as const;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(snapshots.previewUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
    vi.mocked(snapshots.consumeUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    vi.clearAllMocks();
  });

  it("iliad_llm_inference in lite mode reaches the model with max_tokens clamped to 256 and temperature locked at 0", async () => {
    const res = await dispatch(
      "tools/call",
      { name: "iliad_llm_inference", arguments: { prompt: "hi", max_tokens: 2048, temperature: 1.5 } },
      1,
      liteReq(),
    );
    const result = resultOf(res);
    expect(result.isError).toBe(false);
    expect(vi.mocked(runCompletion)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runCompletion)).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "hi", max_tokens: LITE_CAPS.LLM_MAX_TOKENS, temperature: LITE_CAPS.LLM_TEMPERATURE }),
    );
  });

  it("iliad_embeddings array input in lite mode is rejected as an isError tool result WITHOUT charging or running", async () => {
    const res = await dispatch(
      "tools/call",
      { name: "iliad_embeddings", arguments: { input: ["a", "b"] } },
      2,
      liteReq(),
    );
    const result = resultOf(res);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/single string/);
    expect(result.content[0].text).toMatch(/X-Agent-Mode: standard/);
    expect(result._error).toEqual({ code: "validation", retryable: false });
    // No charge, no authorization, no model work.
    expect(vi.mocked(snapshots.previewUsageCredits)).not.toHaveBeenCalled();
    expect(vi.mocked(snapshots.consumeUsageCredits)).not.toHaveBeenCalled();
    expect(vi.mocked(computeEmbeddings)).not.toHaveBeenCalled();
  });

  it("standard mode is untouched: the same embeddings array input runs and captures credits", async () => {
    const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
    const res = await dispatch(
      "tools/call",
      { name: "iliad_embeddings", arguments: { input: ["a", "b"] } },
      3,
      req,
    );
    const result = resultOf(res);
    expect(result.isError).toBe(false);
    expect(vi.mocked(computeEmbeddings)).toHaveBeenCalledWith(["a", "b"], expect.anything());
    expect(vi.mocked(snapshots.consumeUsageCredits)).toHaveBeenCalledTimes(1);
  });
});
