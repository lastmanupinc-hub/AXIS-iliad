import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// Handler-level lite-cap tests (bottom of this file) follow the
// mcp-embeddings.test.ts harness: resolveAuth + the usage-credit fns are
// mocked; everything else in @axis/snapshots (resetTestDb, sql, …) stays REAL
// so the vectors table below is the genuine article.
vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return {
    ...actual,
    resolveAuth: vi.fn(async () => ({ account: { account_id: "acc-vec", tier: "paid" as const } })),
  };
});

vi.mock("@axis/snapshots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@axis/snapshots")>();
  return {
    ...actual,
    previewUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
    consumeUsageCredits: vi.fn(async () => ({ effective_overage_cents: 0 })),
  };
});

import { resetTestDb } from "@axis/snapshots";
import * as snapshots from "@axis/snapshots";
import type { IncomingMessage } from "node:http";
import { runVectorDatabase, LITE_VECTOR_NAMESPACE_MAX_VECTORS } from "./mcp-tool-impls.js";
import { PRICING_TIERS } from "@axis/mpp";
import {
  cosineSimilarity,
  upsertVectors,
  queryVectors,
  deleteNamespace,
  countVectors,
  scopeNamespace,
  resetVectorDbForTests,
} from "./vector-db.js";

beforeAll(async () => {
  await resetTestDb();
});

beforeEach(async () => {
  await resetVectorDbForTests();
});

// ─── cosineSimilarity ───────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", async () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("returns -1 for opposite vectors", async () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });

  it("returns 0 for orthogonal vectors", async () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  it("is scale-invariant", async () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it("returns 0 when either vector is all-zero", async () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("throws on dimension mismatch", async () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/i);
  });
});

// ─── upsertVectors + queryVectors ───────────────────────────────

describe("upsertVectors + queryVectors lifecycle", () => {
  it("round-trips a single vector and returns it as the top match", async () => {
    await upsertVectors("ns1", [{ id: "v1", vector: [1, 0, 0] }]);
    const results = await queryVectors("ns1", { vector: [1, 0, 0], top_k: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("v1");
    expect(results[0].score).toBeCloseTo(1, 5);
  });

  it("ranks more-similar vectors higher", async () => {
    await upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0] },
      { id: "v2", vector: [0.9, 0.1, 0] },
      { id: "v3", vector: [0, 1, 0] },
      { id: "v4", vector: [-1, 0, 0] },
    ]);
    const results = await queryVectors("ns1", { vector: [1, 0, 0], top_k: 4 });
    expect(results.map(r => r.id)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
    expect(results[2].score).toBeGreaterThan(results[3].score);
  });

  it("limits results to top_k", async () => {
    await upsertVectors("ns1", Array.from({ length: 50 }, (_, i) => ({
      id: `v${i}`,
      vector: [Math.cos(i * 0.1), Math.sin(i * 0.1), 0],
    })));
    expect(await queryVectors("ns1", { vector: [1, 0, 0], top_k: 3 })).toHaveLength(3);
    expect(await queryVectors("ns1", { vector: [1, 0, 0], top_k: 10 })).toHaveLength(10);
  });

  it("preserves metadata through the round-trip", async () => {
    await upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0], metadata: { source: "doc1.md", page: 3 } },
    ]);
    const [m] = await queryVectors("ns1", { vector: [1, 0, 0], top_k: 1 });
    expect(m.metadata).toEqual({ source: "doc1.md", page: 3 });
  });

  it("upsert replaces existing rows with the same id", async () => {
    await upsertVectors("ns1", [{ id: "v1", vector: [1, 0, 0], metadata: { v: 1 } }]);
    await upsertVectors("ns1", [{ id: "v1", vector: [0, 1, 0], metadata: { v: 2 } }]);
    expect(await countVectors("ns1")).toBe(1);
    const [m] = await queryVectors("ns1", { vector: [0, 1, 0], top_k: 1 });
    expect(m.metadata).toEqual({ v: 2 });
  });

  it("rejects mismatched dimensions in a single batch", async () => {
    await expect(
      upsertVectors("ns1", [
        { id: "v1", vector: [1, 2, 3] },
        { id: "v2", vector: [1, 2] },
      ]),
    ).rejects.toThrow(/dimension mismatch/i);
  });

  it("rejects non-finite values", async () => {
    await expect(
      upsertVectors("ns1", [{ id: "v1", vector: [1, NaN, 3] }]),
    ).rejects.toThrow(/non-finite/i);
  });

  it("rejects empty batches and empty vectors", async () => {
    await expect(upsertVectors("ns1", [])).rejects.toThrow(/non-empty array/i);
    await expect(upsertVectors("ns1", [{ id: "v1", vector: [] }])).rejects.toThrow(/empty vector/i);
  });
});

// ─── Namespace isolation ────────────────────────────────────────

describe("namespace isolation", () => {
  it("queries inside one namespace cannot see another's rows", async () => {
    await upsertVectors("ns-a", [{ id: "v1", vector: [1, 0, 0] }]);
    await upsertVectors("ns-b", [{ id: "v2", vector: [1, 0, 0] }]);
    expect((await queryVectors("ns-a", { vector: [1, 0, 0], top_k: 10 })).map(r => r.id)).toEqual(["v1"]);
    expect((await queryVectors("ns-b", { vector: [1, 0, 0], top_k: 10 })).map(r => r.id)).toEqual(["v2"]);
  });

  it("deleteNamespace only affects the target namespace", async () => {
    await upsertVectors("ns-a", [{ id: "v1", vector: [1, 0, 0] }]);
    await upsertVectors("ns-b", [{ id: "v2", vector: [1, 0, 0] }]);
    expect(await deleteNamespace("ns-a")).toBe(1);
    expect(await countVectors("ns-a")).toBe(0);
    expect(await countVectors("ns-b")).toBe(1);
  });
});

// ─── filter clause ──────────────────────────────────────────────

describe("metadata filter", () => {
  it("excludes rows whose metadata doesn't match", async () => {
    await upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0], metadata: { type: "doc" } },
      { id: "v2", vector: [1, 0, 0], metadata: { type: "image" } },
    ]);
    const docs = await queryVectors("ns1", { vector: [1, 0, 0], top_k: 10, filter: { type: "doc" } });
    expect(docs.map(r => r.id)).toEqual(["v1"]);
  });

  it("excludes rows with no metadata when a filter is provided", async () => {
    await upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0] },
      { id: "v2", vector: [1, 0, 0], metadata: { type: "doc" } },
    ]);
    const docs = await queryVectors("ns1", { vector: [1, 0, 0], top_k: 10, filter: { type: "doc" } });
    expect(docs.map(r => r.id)).toEqual(["v2"]);
  });
});

// ─── Tiebreak determinism ──────────────────────────────────────

describe("determinism", () => {
  it("ties break on id ascending so output is stable", async () => {
    await upsertVectors("ns1", [
      { id: "zeta", vector: [1, 0, 0] },
      { id: "alpha", vector: [1, 0, 0] },
      { id: "mu", vector: [1, 0, 0] },
    ]);
    const ids = (await queryVectors("ns1", { vector: [1, 0, 0], top_k: 3 })).map(r => r.id);
    expect(ids).toEqual(["alpha", "mu", "zeta"]);
  });
});

// ─── scopeNamespace ────────────────────────────────────────────

describe("scopeNamespace", () => {
  it("prefixes with account id and a sentinel", async () => {
    expect(scopeNamespace("acct-1", "docs")).toBe("acct:acct-1:docs");
  });

  it("falls back to 'default' when raw is empty", async () => {
    expect(scopeNamespace("acct-1", "")).toBe("acct:acct-1:default");
    expect(scopeNamespace("acct-1", undefined)).toBe("acct:acct-1:default");
  });

  it("rejects path-traversal-style names", async () => {
    expect(() => scopeNamespace("acct-1", "..")).toThrow(/must not contain/i);
    expect(() => scopeNamespace("acct-1", "a/b")).toThrow(/must not contain/i);
    expect(() => scopeNamespace("acct-1", "a\\b")).toThrow(/must not contain/i);
  });

  it("rejects overlong names", async () => {
    expect(() => scopeNamespace("acct-1", "a".repeat(201))).toThrow(/200/);
  });

  it("rejects empty account ids", async () => {
    expect(() => scopeNamespace("", "ns")).toThrow(/account_id is required/i);
  });
});

// ─── Lite-mode namespace cap (runVectorDatabase handler) ────────
//
// Direct handler-level tests (mcp-embeddings.test.ts style): the lite
// 1k-vectors-per-namespace cap must reject the WHOLE batch BEFORE the charge
// is authorized, while standard mode crosses 1,000 freely. The vectors table
// is real, so the pre-upsert countVectors interplay is genuinely proven.

describe("runVectorDatabase — lite namespace cap (1k vectors)", () => {
  const liteReq = { headers: { "x-agent-mode": "lite" }, socket: {} } as unknown as IncomingMessage;
  const stdReq = { headers: {}, socket: {} } as unknown as IncomingMessage;
  const rows = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, vector: [1, 0, 0] }));

  beforeEach(() => {
    vi.mocked(snapshots.previewUsageCredits).mockClear();
    vi.mocked(snapshots.consumeUsageCredits).mockClear();
  });

  it("rejects a lite upsert that would push the namespace past 1,000 — nothing written, never charged", async () => {
    await upsertVectors("acct:acc-vec:cap", rows(998, "seed"));
    await expect(
      runVectorDatabase({ operation: "upsert", namespace: "cap", vectors: rows(3, "new") }, liteReq),
    ).rejects.toThrow(/lite mode caps a namespace at 1000 vectors.*X-Agent-Mode: standard/);
    // Charge-not-taken proof: neither authorize (preview) nor capture (consume) ran.
    expect(snapshots.previewUsageCredits).not.toHaveBeenCalled();
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
    // The batch is rejected whole — never silently partially applied.
    expect(await countVectors("acct:acc-vec:cap")).toBe(998);
  });

  it("allows a lite upsert that lands exactly on the 1,000 cap (charged once)", async () => {
    await upsertVectors("acct:acc-vec:ok", rows(995, "seed"));
    const out = JSON.parse(
      await runVectorDatabase({ operation: "upsert", namespace: "ok", vectors: rows(5, "new") }, liteReq),
    );
    expect(out.upserted).toBe(5);
    expect(out.total_in_namespace).toBe(1000);
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledTimes(1);
  });

  it("standard mode is unaffected by the lite cap (crosses 1,000 freely)", async () => {
    await upsertVectors("acct:acc-vec:std", rows(998, "seed"));
    const out = JSON.parse(
      await runVectorDatabase({ operation: "upsert", namespace: "std", vectors: rows(3, "new") }, stdReq),
    );
    expect(out.upserted).toBe(3);
    expect(out.total_in_namespace).toBe(1001);
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledTimes(1);
  });

  // H-Phase-A cycle 9: the tests above prove enforcement is correct, but
  // nothing tied that enforcement to the lite_description PROSE in
  // @axis/mpp's PRICING_TIERS — unlike lite-caps.ts's top_k half of this same
  // tool (bidirectionally pinned in lite-caps.test.ts), this namespace-cap
  // half is runtime state (not a pure input transform), so it lives outside
  // that table and had no equivalent pin. Not a live bug today (both already
  // agree); this closes the gap so future drift fails CI instead of shipping.
  it("contract: PRICING_TIERS' lite_description namespace-cap promise matches LITE_VECTOR_NAMESPACE_MAX_VECTORS", () => {
    const desc = PRICING_TIERS.iliad_vector_database.lite_description;
    const m = desc.match(/(\d+)k vectors per namespace/);
    expect(m, `/(\\d+)k vectors per namespace/ not found in "${desc}"`).not.toBeNull();
    expect(Number((m as RegExpMatchArray)[1]) * 1000).toBe(LITE_VECTOR_NAMESPACE_MAX_VECTORS);
  });
});
