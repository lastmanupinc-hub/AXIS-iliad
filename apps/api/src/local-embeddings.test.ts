import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import {
  computeLocalEmbeddings,
  isLocalEmbeddingsConfigured,
  resolveEmbeddingModelPath,
  getEmbeddingModelPath,
  normalizeEmbeddingsInput,
  resetLocalEmbeddingsForTests,
} from "./local-embeddings.js";

// ─── Path resolution (mirrors llm-inference.test.ts getModelPath) ─

describe("local-embeddings — resolveEmbeddingModelPath / getEmbeddingModelPath", () => {
  const original = process.env.AXIS_EMBEDDING_MODEL_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.AXIS_EMBEDDING_MODEL_PATH;
    else process.env.AXIS_EMBEDDING_MODEL_PATH = original;
  });

  it("uses AXIS_EMBEDDING_MODEL_PATH env var when set", () => {
    process.env.AXIS_EMBEDDING_MODEL_PATH = "/custom/path/embed-model.gguf";
    expect(resolveEmbeddingModelPath()).toBe("/custom/path/embed-model.gguf");
    expect(getEmbeddingModelPath()).toBe("/custom/path/embed-model.gguf");
  });

  it("falls back to models/bge-small-en-v1.5-q4_k_m.gguf at cwd when unset", () => {
    delete process.env.AXIS_EMBEDDING_MODEL_PATH;
    const p = resolveEmbeddingModelPath();
    expect(p.endsWith(path.join("models", "bge-small-en-v1.5-q4_k_m.gguf"))).toBe(true);
  });

  it("honors an explicit env object over process.env", () => {
    process.env.AXIS_EMBEDDING_MODEL_PATH = "/from/process/env.gguf";
    expect(resolveEmbeddingModelPath({ AXIS_EMBEDDING_MODEL_PATH: "/from/param/env.gguf" })).toBe(
      "/from/param/env.gguf",
    );
  });
});

// ─── Config gating (mirrors llm-inference.test.ts isLlmConfigured) ─

describe("local-embeddings — isLocalEmbeddingsConfigured", () => {
  const original = process.env.AXIS_EMBEDDING_MODEL_PATH;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-emb-test-"));
  });

  afterEach(async () => {
    if (original === undefined) delete process.env.AXIS_EMBEDDING_MODEL_PATH;
    else process.env.AXIS_EMBEDDING_MODEL_PATH = original;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns false when the model file is absent", async () => {
    process.env.AXIS_EMBEDDING_MODEL_PATH = path.join(tmpDir, "missing.gguf");
    expect(await isLocalEmbeddingsConfigured()).toBe(false);
  });

  it("returns true when the model file exists", async () => {
    const p = path.join(tmpDir, "fake.gguf");
    await fs.writeFile(p, "fake content");
    process.env.AXIS_EMBEDDING_MODEL_PATH = p;
    expect(await isLocalEmbeddingsConfigured()).toBe(true);
  });
});

// ─── Shared input validation ────────────────────────────────────

describe("local-embeddings — normalizeEmbeddingsInput", () => {
  it("normalizes a single string to a one-element array", () => {
    expect(normalizeEmbeddingsInput("hello")).toEqual(["hello"]);
  });

  it("rejects empty input arrays", () => {
    expect(() => normalizeEmbeddingsInput([])).toThrow(/input is empty/);
  });

  it("rejects oversized batches (>2048)", () => {
    const big = Array.from({ length: 2049 }, (_, i) => `s${i}`);
    expect(() => normalizeEmbeddingsInput(big)).toThrow(/exceeds 2048/);
  });

  it("rejects non-string / empty-string entries", () => {
    expect(() => normalizeEmbeddingsInput(["ok", 42 as unknown as string])).toThrow(/non-empty string/);
    expect(() => normalizeEmbeddingsInput(["ok", ""])).toThrow(/non-empty string/);
  });

  it("rejects entries over 32000 chars", () => {
    expect(() => normalizeEmbeddingsInput(["a".repeat(32_001)])).toThrow(/32000 chars/);
  });

  it("prefixes errors with the caller-supplied function name", () => {
    expect(() => normalizeEmbeddingsInput([], "computeEmbeddings")).toThrow(/computeEmbeddings: input is empty/);
  });
});

// ─── Missing-model behavior (no native load) ────────────────────

describe("local-embeddings — computeLocalEmbeddings without a model file", () => {
  const original = process.env.AXIS_EMBEDDING_MODEL_PATH;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "axis-emb-test-"));
    process.env.AXIS_EMBEDDING_MODEL_PATH = path.join(tmpDir, "missing.gguf");
    resetLocalEmbeddingsForTests();
  });

  afterEach(async () => {
    if (original === undefined) delete process.env.AXIS_EMBEDDING_MODEL_PATH;
    else process.env.AXIS_EMBEDDING_MODEL_PATH = original;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects with a local-model error naming the resolved path", async () => {
    await expect(computeLocalEmbeddings("hi")).rejects.toThrow(/Local embeddings model not found at .*missing\.gguf/);
  });

  it("validates input BEFORE checking the model file (validation errors take precedence)", async () => {
    await expect(computeLocalEmbeddings([])).rejects.toThrow(/input is empty/);
    await expect(computeLocalEmbeddings("a".repeat(32_001))).rejects.toThrow(/32000 chars/);
  });

  it("honors an explicit modelPath override", async () => {
    const override = path.join(tmpDir, "other-missing.gguf");
    await expect(computeLocalEmbeddings("hi", override)).rejects.toThrow(/other-missing\.gguf/);
  });
});

// ─── MODEL-GATED — real embedding model (mirrors llm-inference live gate) ─
// Only runs when AXIS_EMBEDDING_MODEL_PATH points at a real embedding-capable
// GGUF. CI never has one, so this whole block is skipped there.

describe.skipIf(!existsSync(process.env.AXIS_EMBEDDING_MODEL_PATH ?? ""))(
  "local-embeddings — live model (skipped unless model is present)",
  () => {
    it("embeds a batch: one finite vector per input, identical dimensionality, deterministic", async () => {
      const r1 = await computeLocalEmbeddings(["alpha", "beta"]);
      expect(r1.vectors.length).toBe(2);
      expect(r1.input_count).toBe(2);
      expect(r1.model_used).toBe(path.basename(process.env.AXIS_EMBEDDING_MODEL_PATH!));
      const dim = r1.vectors[0].length;
      expect(dim).toBeGreaterThan(0);
      for (const v of r1.vectors) {
        expect(v.length).toBe(dim);
        for (const x of v) expect(Number.isFinite(x)).toBe(true);
      }
      // Same input twice → byte-identical vectors (deterministic forward pass).
      const r2 = await computeLocalEmbeddings(["alpha", "beta"]);
      expect(r2.vectors).toEqual(r1.vectors);
    }, 120_000);
  },
);
