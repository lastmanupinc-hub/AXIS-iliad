import { describe, it, expect } from "vitest";
import { matryoshkaTruncate, fitCorpusAdapter, applyCorpusAdapter, buildEngineerEmbeddings } from "./embeddings-engineer.js";

const norm = (v: number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("matryoshkaTruncate", () => {
  it("slices to dims, L2-normalizes, preserves direction", () => {
    const t = matryoshkaTruncate([3, 4, 5, 6], 2);
    expect(t.length).toBe(2);
    expect(norm(t)).toBeCloseTo(1, 6);
    expect(t[0]).toBeCloseTo(0.6, 6);
    expect(t[1]).toBeCloseTo(0.8, 6);
  });
  it("clamps dims to [1, length]", () => {
    expect(matryoshkaTruncate([1, 2], 99).length).toBe(2);
    expect(matryoshkaTruncate([1, 2], 0).length).toBe(1);
  });
  it("handles a zero vector without NaN", () => {
    expect(matryoshkaTruncate([0, 0, 0], 2)).toEqual([0, 0]);
  });
});

describe("fitCorpusAdapter / applyCorpusAdapter", () => {
  it("computes the batch mean", () => {
    const a = fitCorpusAdapter([[1, 1], [3, 5]]);
    expect(a.mean).toEqual([2, 3]);
    expect(a.dims).toBe(2);
  });
  it("mean-centers then normalizes", () => {
    const a = fitCorpusAdapter([[1, 1], [3, 3]]); // mean [2,2]
    const c = applyCorpusAdapter([3, 3], a);
    expect(norm(c)).toBeCloseTo(1, 6);
    expect(c[0]).toBeCloseTo(c[1], 6);
  });
  it("normalizes (no centering) on dim mismatch", () => {
    const a = fitCorpusAdapter([[1, 1, 1]]);
    const c = applyCorpusAdapter([3, 4], a);
    expect(c).toEqual([0.6, 0.8]);
  });
  it("empty batch → empty adapter", () => {
    expect(fitCorpusAdapter([])).toEqual({ mean: [], dims: 0 });
  });
});

describe("buildEngineerEmbeddings", () => {
  const batch = [[3, 4, 0, 0], [0, 0, 6, 8]];

  it("truncates + normalizes", () => {
    const r = buildEngineerEmbeddings(batch, { dimensions: 2 });
    expect(r.dimensions).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.embeddings[0].length).toBe(2);
    expect(norm(r.embeddings[0])).toBeCloseTo(1, 6);
    expect(r.adapter_applied).toBe(false);
  });

  it("applies the corpus adapter and returns the fitted mean", () => {
    const r = buildEngineerEmbeddings(batch, { corpus_adapter: true });
    expect(r.adapter_applied).toBe(true);
    expect(r.adapter_mean?.length).toBe(4);
    expect(r.embeddings.every((e) => Math.abs(norm(e) - 1) < 1e-6)).toBe(true);
  });

  it("truncate + adapter together (adapter fit on the truncated dims)", () => {
    const r = buildEngineerEmbeddings(batch, { dimensions: 2, corpus_adapter: true });
    expect(r.dimensions).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.adapter_applied).toBe(true);
    expect(r.adapter_mean?.length).toBe(2);
  });

  it("no opts → normalizes at full dims", () => {
    const r = buildEngineerEmbeddings(batch, {});
    expect(r.dimensions).toBe(4);
    expect(r.truncated).toBe(false);
    expect(r.adapter_applied).toBe(false);
    expect(norm(r.embeddings[0])).toBeCloseTo(1, 6);
  });

  it("is deterministic", () => {
    expect(buildEngineerEmbeddings(batch, { dimensions: 2, corpus_adapter: true })).toEqual(
      buildEngineerEmbeddings(batch, { dimensions: 2, corpus_adapter: true }),
    );
  });

  it("handles empty input", () => {
    const r = buildEngineerEmbeddings([], { dimensions: 2, corpus_adapter: true });
    expect(r.embeddings).toEqual([]);
    expect(r.adapter_applied).toBe(false);
  });

  it("neutralizes non-finite components (one NaN can't poison the batch or the mean)", () => {
    const r = buildEngineerEmbeddings([[NaN, 1, 2], [3, 4, 5]], { corpus_adapter: true });
    expect(r.embeddings.flat().every(Number.isFinite)).toBe(true);
    expect(r.adapter_mean?.every(Number.isFinite)).toBe(true);
  });

  it("throws on a ragged batch (mismatched dimensions)", () => {
    expect(() => buildEngineerEmbeddings([[1, 2], [3, 4, 5]], { corpus_adapter: true })).toThrow(/same dimension/);
  });
});
