import { describe, it, expect } from "vitest";
import { applyRecencyDecay, reciprocalRankFusion, semanticDedup, cosine } from "./vector-engineer.js";

const DAY = 86_400_000;

describe("cosine", () => {
  it("computes cosine and guards zero + dimension mismatch (never NaN)", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosine([3, 4], [3, 4])).toBeCloseTo(1, 6);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe("applyRecencyDecay", () => {
  const now = 1000 * DAY;

  it("halves the score at one half-life of age", () => {
    const r = applyRecencyDecay([{ id: "a", score: 1, created_at_ms: now - 30 * DAY }], { now_ms: now, half_life_days: 30 });
    expect(r[0].score).toBeCloseTo(0.5, 6);
    expect(r[0].age_days).toBeCloseTo(30, 3);
    expect(r[0].base_score).toBe(1);
  });

  it("leaves a fresh vector ~unchanged", () => {
    const r = applyRecencyDecay([{ id: "a", score: 0.9, created_at_ms: now }], { now_ms: now, half_life_days: 30 });
    expect(r[0].score).toBeCloseTo(0.9, 6);
  });

  it("reranks: a strong-but-old match can fall below a weaker-but-fresh one", () => {
    const r = applyRecencyDecay(
      [
        { id: "old", score: 1.0, created_at_ms: now - 90 * DAY }, // 3 half-lives → /8
        { id: "new", score: 0.5, created_at_ms: now },
      ],
      { now_ms: now, half_life_days: 30 },
    );
    expect(r.map((m) => m.id)).toEqual(["new", "old"]);
  });

  it("clamps future timestamps to age 0 and is deterministic", () => {
    const r = applyRecencyDecay([{ id: "a", score: 1, created_at_ms: now + 999 }], { now_ms: now, half_life_days: 30 });
    expect(r[0].age_days).toBe(0);
    expect(r[0].score).toBeCloseTo(1, 6);
  });
});

describe("reciprocalRankFusion", () => {
  it("ranks an id appearing in both lists above singletons + records per-list ranks", () => {
    const f = reciprocalRankFusion({ dense: ["a", "b", "c"], sparse: ["b", "x", "y"] });
    expect(f[0].id).toBe("b");
    expect(f.find((i) => i.id === "b")!.ranks).toEqual({ dense: 2, sparse: 1 });
  });

  it("breaks ties by id and handles a single list", () => {
    expect(reciprocalRankFusion({ only: ["m", "n"] }).map((i) => i.id)).toEqual(["m", "n"]);
  });
});

describe("semanticDedup", () => {
  it("drops a near-duplicate, keeps the first, reports duplicate_of", () => {
    const r = semanticDedup(
      [
        { id: "a", vector: [1, 0, 0] },
        { id: "b", vector: [0.999, 0.01, 0] },
        { id: "c", vector: [0, 1, 0] },
      ],
      0.97,
    );
    expect(r.kept).toEqual(["a", "c"]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0]).toMatchObject({ id: "b", duplicate_of: "a" });
    expect(r.dropped[0].similarity).toBeGreaterThanOrEqual(0.97);
  });

  it("keeps all when distinct", () => {
    const r = semanticDedup([{ id: "a", vector: [1, 0] }, { id: "b", vector: [0, 1] }], 0.97);
    expect(r.kept).toEqual(["a", "b"]);
    expect(r.dropped).toEqual([]);
  });

  it("is deterministic and first-occurrence wins", () => {
    const recs = [{ id: "x", vector: [1, 1] }, { id: "y", vector: [1, 1] }];
    expect(semanticDedup(recs, 0.99)).toEqual(semanticDedup(recs, 0.99));
    expect(semanticDedup(recs, 0.99).kept).toEqual(["x"]);
  });
});
