import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import {
  cosineSimilarity,
  upsertVectors,
  queryVectors,
  deleteNamespace,
  countVectors,
  scopeNamespace,
  resetVectorDbForTests,
} from "./vector-db.js";

beforeAll(() => {
  openMemoryDb();
});

afterAll(() => {
  closeDb();
});

beforeEach(() => {
  resetVectorDbForTests();
});

// ─── cosineSimilarity ───────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  it("is scale-invariant", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it("returns 0 when either vector is all-zero", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/i);
  });
});

// ─── upsertVectors + queryVectors ───────────────────────────────

describe("upsertVectors + queryVectors lifecycle", () => {
  it("round-trips a single vector and returns it as the top match", () => {
    upsertVectors("ns1", [{ id: "v1", vector: [1, 0, 0] }]);
    const results = queryVectors("ns1", { vector: [1, 0, 0], top_k: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("v1");
    expect(results[0].score).toBeCloseTo(1, 5);
  });

  it("ranks more-similar vectors higher", () => {
    upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0] },
      { id: "v2", vector: [0.9, 0.1, 0] },
      { id: "v3", vector: [0, 1, 0] },
      { id: "v4", vector: [-1, 0, 0] },
    ]);
    const results = queryVectors("ns1", { vector: [1, 0, 0], top_k: 4 });
    expect(results.map(r => r.id)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
    expect(results[2].score).toBeGreaterThan(results[3].score);
  });

  it("limits results to top_k", () => {
    upsertVectors("ns1", Array.from({ length: 50 }, (_, i) => ({
      id: `v${i}`,
      vector: [Math.cos(i * 0.1), Math.sin(i * 0.1), 0],
    })));
    expect(queryVectors("ns1", { vector: [1, 0, 0], top_k: 3 })).toHaveLength(3);
    expect(queryVectors("ns1", { vector: [1, 0, 0], top_k: 10 })).toHaveLength(10);
  });

  it("preserves metadata through the round-trip", () => {
    upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0], metadata: { source: "doc1.md", page: 3 } },
    ]);
    const [m] = queryVectors("ns1", { vector: [1, 0, 0], top_k: 1 });
    expect(m.metadata).toEqual({ source: "doc1.md", page: 3 });
  });

  it("upsert replaces existing rows with the same id", () => {
    upsertVectors("ns1", [{ id: "v1", vector: [1, 0, 0], metadata: { v: 1 } }]);
    upsertVectors("ns1", [{ id: "v1", vector: [0, 1, 0], metadata: { v: 2 } }]);
    expect(countVectors("ns1")).toBe(1);
    const [m] = queryVectors("ns1", { vector: [0, 1, 0], top_k: 1 });
    expect(m.metadata).toEqual({ v: 2 });
  });

  it("rejects mismatched dimensions in a single batch", () => {
    expect(() =>
      upsertVectors("ns1", [
        { id: "v1", vector: [1, 2, 3] },
        { id: "v2", vector: [1, 2] },
      ]),
    ).toThrow(/dimension mismatch/i);
  });

  it("rejects non-finite values", () => {
    expect(() =>
      upsertVectors("ns1", [{ id: "v1", vector: [1, NaN, 3] }]),
    ).toThrow(/non-finite/i);
  });

  it("rejects empty batches and empty vectors", () => {
    expect(() => upsertVectors("ns1", [])).toThrow(/non-empty array/i);
    expect(() => upsertVectors("ns1", [{ id: "v1", vector: [] }])).toThrow(/empty vector/i);
  });
});

// ─── Namespace isolation ────────────────────────────────────────

describe("namespace isolation", () => {
  it("queries inside one namespace cannot see another's rows", () => {
    upsertVectors("ns-a", [{ id: "v1", vector: [1, 0, 0] }]);
    upsertVectors("ns-b", [{ id: "v2", vector: [1, 0, 0] }]);
    expect(queryVectors("ns-a", { vector: [1, 0, 0], top_k: 10 }).map(r => r.id)).toEqual(["v1"]);
    expect(queryVectors("ns-b", { vector: [1, 0, 0], top_k: 10 }).map(r => r.id)).toEqual(["v2"]);
  });

  it("deleteNamespace only affects the target namespace", () => {
    upsertVectors("ns-a", [{ id: "v1", vector: [1, 0, 0] }]);
    upsertVectors("ns-b", [{ id: "v2", vector: [1, 0, 0] }]);
    expect(deleteNamespace("ns-a")).toBe(1);
    expect(countVectors("ns-a")).toBe(0);
    expect(countVectors("ns-b")).toBe(1);
  });
});

// ─── filter clause ──────────────────────────────────────────────

describe("metadata filter", () => {
  it("excludes rows whose metadata doesn't match", () => {
    upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0], metadata: { type: "doc" } },
      { id: "v2", vector: [1, 0, 0], metadata: { type: "image" } },
    ]);
    const docs = queryVectors("ns1", { vector: [1, 0, 0], top_k: 10, filter: { type: "doc" } });
    expect(docs.map(r => r.id)).toEqual(["v1"]);
  });

  it("excludes rows with no metadata when a filter is provided", () => {
    upsertVectors("ns1", [
      { id: "v1", vector: [1, 0, 0] },
      { id: "v2", vector: [1, 0, 0], metadata: { type: "doc" } },
    ]);
    const docs = queryVectors("ns1", { vector: [1, 0, 0], top_k: 10, filter: { type: "doc" } });
    expect(docs.map(r => r.id)).toEqual(["v2"]);
  });
});

// ─── Tiebreak determinism ──────────────────────────────────────

describe("determinism", () => {
  it("ties break on id ascending so output is stable", () => {
    upsertVectors("ns1", [
      { id: "zeta", vector: [1, 0, 0] },
      { id: "alpha", vector: [1, 0, 0] },
      { id: "mu", vector: [1, 0, 0] },
    ]);
    const ids = queryVectors("ns1", { vector: [1, 0, 0], top_k: 3 }).map(r => r.id);
    expect(ids).toEqual(["alpha", "mu", "zeta"]);
  });
});

// ─── scopeNamespace ────────────────────────────────────────────

describe("scopeNamespace", () => {
  it("prefixes with account id and a sentinel", () => {
    expect(scopeNamespace("acct-1", "docs")).toBe("acct:acct-1:docs");
  });

  it("falls back to 'default' when raw is empty", () => {
    expect(scopeNamespace("acct-1", "")).toBe("acct:acct-1:default");
    expect(scopeNamespace("acct-1", undefined)).toBe("acct:acct-1:default");
  });

  it("rejects path-traversal-style names", () => {
    expect(() => scopeNamespace("acct-1", "..")).toThrow(/must not contain/i);
    expect(() => scopeNamespace("acct-1", "a/b")).toThrow(/must not contain/i);
    expect(() => scopeNamespace("acct-1", "a\\b")).toThrow(/must not contain/i);
  });

  it("rejects overlong names", () => {
    expect(() => scopeNamespace("acct-1", "a".repeat(201))).toThrow(/200/);
  });

  it("rejects empty account ids", () => {
    expect(() => scopeNamespace("", "ns")).toThrow(/account_id is required/i);
  });
});
