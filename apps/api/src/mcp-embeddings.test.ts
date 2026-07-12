/**
 * H0.8 — direct handler-level tests for runEmbeddings (previously the only
 * sovereign-capability tool with zero direct coverage; the July engines review
 * flagged it). Locks the honesty envelopes (never fabricate success when the
 * backend is unconfigured), the metering wiring (capture-on-success only),
 * and input validation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "node:http";

vi.mock("./billing.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billing.js")>();
  return {
    ...actual,
    resolveAuth: vi.fn(async () => ({ account: { account_id: "acc-emb", tier: "paid" as const } })),
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

vi.mock("./embeddings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./embeddings.js")>();
  return {
    ...actual,
    // readEmbeddingsConfigFromEnv stays REAL (the env-driven envelope logic is
    // exactly what's under test); only the model call itself is stubbed.
    computeEmbeddings: vi.fn(async () => ({
      backend: "local",
      model: "stub-gguf",
      dimensions: 2,
      count: 1,
      vectors: [[0.25, -0.5]],
    })),
  };
});

vi.mock("./local-embeddings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./local-embeddings.js")>();
  return {
    ...actual,
    isLocalEmbeddingsConfigured: vi.fn(async () => false),
    getEmbeddingModelPath: vi.fn(() => "/fake/model.gguf"),
  };
});

import { runEmbeddings } from "./mcp-tool-impls.js";
import { computeEmbeddings } from "./embeddings.js";
import { isLocalEmbeddingsConfigured } from "./local-embeddings.js";
import * as snapshots from "@axis/snapshots";

const req = { headers: {}, socket: {} } as unknown as IncomingMessage;

const ENV_KEYS = ["AXIS_EMBEDDING_BACKEND", "OPENAI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(snapshots.previewUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
  vi.mocked(snapshots.consumeUsageCredits).mockResolvedValue({ effective_overage_cents: 0 } as never);
  vi.mocked(isLocalEmbeddingsConfigured).mockResolvedValue(false);
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("runEmbeddings honesty envelopes (H0.8)", () => {
  it("openai backend selected without OPENAI_API_KEY -> _not_configured, never fabricated, never charged", async () => {
    process.env.AXIS_EMBEDDING_BACKEND = "openai";

    const out = JSON.parse(await runEmbeddings({ input: "hello" }, req));

    expect(out._not_configured).toBe(true);
    expect(out.backend).toBe("openai");
    expect(out.required_env).toContain("OPENAI_API_KEY");
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
    expect(vi.mocked(computeEmbeddings)).not.toHaveBeenCalled();
  });

  it("default local backend without a GGUF -> _not_configured naming the model path, never charged", async () => {
    const out = JSON.parse(await runEmbeddings({ input: "hello" }, req));

    expect(out._not_configured).toBe(true);
    expect(out.backend).toBe("local");
    expect(out.model_path).toBe("/fake/model.gguf");
    expect(String(out.reason)).toMatch(/GGUF/);
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
    expect(vi.mocked(computeEmbeddings)).not.toHaveBeenCalled();
  });
});

describe("runEmbeddings happy path + metering (H0.8)", () => {
  it("configured local backend embeds and captures credits exactly once (capture-on-success)", async () => {
    vi.mocked(isLocalEmbeddingsConfigured).mockResolvedValue(true);

    const out = JSON.parse(await runEmbeddings({ input: ["hello", "world"] }, req));

    expect(out.vectors).toEqual([[0.25, -0.5]]);
    expect(out.backend).toBe("local");
    expect(vi.mocked(computeEmbeddings)).toHaveBeenCalledWith(["hello", "world"], expect.objectContaining({ backend: "local" }));
    expect(snapshots.consumeUsageCredits).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-string/array input with a clean error and no charge", async () => {
    vi.mocked(isLocalEmbeddingsConfigured).mockResolvedValue(true);

    await expect(runEmbeddings({ input: 42 }, req)).rejects.toThrow(/must be a string or array/);
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
    expect(vi.mocked(computeEmbeddings)).not.toHaveBeenCalled();
  });

  it("rejects a mixed array with the offending index named", async () => {
    vi.mocked(isLocalEmbeddingsConfigured).mockResolvedValue(true);

    await expect(runEmbeddings({ input: ["ok", 7] }, req)).rejects.toThrow(/input\[1\] must be a string/);
    expect(snapshots.consumeUsageCredits).not.toHaveBeenCalled();
  });
});
