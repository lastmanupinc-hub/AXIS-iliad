import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import {
  computeEmbeddings,
  readEmbeddingsConfigFromEnv,
  DEFAULT_OPENAI_BASE_URL,
  type EmbeddingsConfig,
} from "./embeddings.js";
import { resolveEmbeddingModelPath } from "./local-embeddings.js";

const config: EmbeddingsConfig = { backend: "openai", api_key: "sk-test-xxx", model: "text-embedding-3-small" };

/** Build a typed mock fetch that returns a canned Response. */
function mockFetch(opts: { ok?: boolean; status?: number; body: unknown; isJson?: boolean }): typeof fetch {
  const ok = opts.ok ?? true;
  const status = opts.status ?? (ok ? 200 : 500);
  return (async () => {
    return {
      ok,
      status,
      async json() {
        if (opts.isJson === false) throw new Error("not json");
        return opts.body;
      },
    } as Response;
  }) as unknown as typeof fetch;
}

// ─── readEmbeddingsConfigFromEnv ────────────────────────────────

describe("readEmbeddingsConfigFromEnv", () => {
  it("defaults to the sovereign local backend when AXIS_EMBEDDING_BACKEND is unset", () => {
    expect(readEmbeddingsConfigFromEnv({})).toEqual({
      backend: "local",
      model_path: resolveEmbeddingModelPath({}),
    });
  });

  it("local default is non-null even when OPENAI_API_KEY is set (key alone doesn't flip the backend)", () => {
    expect(readEmbeddingsConfigFromEnv({ OPENAI_API_KEY: "sk-x" })).toEqual({
      backend: "local",
      model_path: resolveEmbeddingModelPath({}),
    });
  });

  it("honors AXIS_EMBEDDING_MODEL_PATH on the local backend", () => {
    expect(readEmbeddingsConfigFromEnv({ AXIS_EMBEDDING_MODEL_PATH: "/models/custom-embed.gguf" })).toEqual({
      backend: "local",
      model_path: "/models/custom-embed.gguf",
    });
  });

  it("backend=openai + key returns an openai config with the default model", () => {
    expect(readEmbeddingsConfigFromEnv({ AXIS_EMBEDDING_BACKEND: "openai", OPENAI_API_KEY: "sk-x" })).toEqual({
      backend: "openai",
      api_key: "sk-x",
      model: "text-embedding-3-small",
    });
  });

  it("backend=openai WITHOUT OPENAI_API_KEY returns null (explicitly selected but not provisioned)", () => {
    expect(readEmbeddingsConfigFromEnv({ AXIS_EMBEDDING_BACKEND: "openai" })).toBeNull();
  });

  it("honors OPENAI_EMBEDDING_MODEL override on the openai backend", () => {
    expect(readEmbeddingsConfigFromEnv({
      AXIS_EMBEDDING_BACKEND: "openai",
      OPENAI_API_KEY: "sk-x",
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-large",
    })).toEqual({ backend: "openai", api_key: "sk-x", model: "text-embedding-3-large" });
  });

  it("returns null for an unrecognized backend value", () => {
    expect(readEmbeddingsConfigFromEnv({ AXIS_EMBEDDING_BACKEND: "bogus", OPENAI_API_KEY: "sk-x" })).toBeNull();
  });
});

// ─── Backend dispatch — sovereignty proof ───────────────────────

describe("computeEmbeddings backend dispatch (local never touches fetch)", () => {
  it("local backend with a missing model rejects with a local-model error and fetch is called 0 times", async () => {
    let fetchCalls = 0;
    const fetchSpy = (async () => {
      fetchCalls++;
      return { ok: true, status: 200, async json() { return {}; } } as Response;
    }) as unknown as typeof fetch;

    const localConfig: EmbeddingsConfig = {
      backend: "local",
      model_path: path.join("definitely", "not", "a-real-model.gguf"),
    };
    await expect(computeEmbeddings("hi", localConfig, fetchSpy)).rejects.toThrow(
      /Local embeddings model not found/,
    );
    expect(fetchCalls).toBe(0);
  });

  it("openai backend with a stub fetch still hits the stub", async () => {
    let fetchCalls = 0;
    const fetchSpy = (async () => {
      fetchCalls++;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            object: "list",
            model: "text-embedding-3-small",
            data: [{ index: 0, embedding: [0.1], object: "embedding" }],
          };
        },
      } as Response;
    }) as unknown as typeof fetch;

    const r = await computeEmbeddings("hi", config, fetchSpy);
    expect(fetchCalls).toBe(1);
    expect(r.vectors).toEqual([[0.1]]);
  });
});

// ─── computeEmbeddings happy path ───────────────────────────────

describe("computeEmbeddings", () => {
  it("returns one vector per input string", async () => {
    const fetch = mockFetch({
      body: {
        object: "list",
        model: "text-embedding-3-small",
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3], object: "embedding" }],
        usage: { prompt_tokens: 3, total_tokens: 3 },
      },
    });
    const r = await computeEmbeddings("hello", config, fetch);
    expect(r.vectors).toEqual([[0.1, 0.2, 0.3]]);
    expect(r.model_used).toBe("text-embedding-3-small");
    expect(r.input_count).toBe(1);
    expect(r.usage).toEqual({ prompt_tokens: 3, total_tokens: 3 });
  });

  it("returns vectors in original input order even when provider returns shuffled indices", async () => {
    const fetch = mockFetch({
      body: {
        object: "list",
        model: "text-embedding-3-small",
        data: [
          { index: 2, embedding: [0.3], object: "embedding" },
          { index: 0, embedding: [0.1], object: "embedding" },
          { index: 1, embedding: [0.2], object: "embedding" },
        ],
      },
    });
    const r = await computeEmbeddings(["a", "b", "c"], config, fetch);
    expect(r.vectors).toEqual([[0.1], [0.2], [0.3]]);
  });

  it("accepts a single string and normalizes to array internally", async () => {
    const fetch = mockFetch({
      body: {
        object: "list",
        model: "text-embedding-3-small",
        data: [{ index: 0, embedding: [0.5], object: "embedding" }],
      },
    });
    const r = await computeEmbeddings("just one", config, fetch);
    expect(r.vectors).toHaveLength(1);
    expect(r.input_count).toBe(1);
  });

  it("posts to <baseUrl>/embeddings with Bearer auth + JSON body", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: string | undefined;
    const stub = (async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = init?.headers;
      capturedBody = String(init?.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            object: "list",
            model: "text-embedding-3-small",
            data: [{ index: 0, embedding: [0.1], object: "embedding" }],
          };
        },
      } as Response;
    }) as unknown as typeof fetch;

    await computeEmbeddings("x", config, stub);
    expect(capturedUrl).toBe(`${DEFAULT_OPENAI_BASE_URL}/embeddings`);
    const headers = capturedHeaders as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${config.api_key}`);
    expect(headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.input).toEqual(["x"]);
    expect(parsed.model).toBe("text-embedding-3-small");
  });
});

// ─── computeEmbeddings error paths ──────────────────────────────

describe("computeEmbeddings error handling", () => {
  it("normalises 4xx provider errors", async () => {
    const fetch = mockFetch({
      ok: false,
      status: 401,
      body: { error: { message: "Invalid API key", code: "invalid_api_key" } },
    });
    await expect(computeEmbeddings("x", config, fetch)).rejects.toThrow(/401 Invalid API key/);
  });

  it("normalises 5xx provider errors with no JSON body", async () => {
    const fetch = mockFetch({ ok: false, status: 502, body: null, isJson: false });
    await expect(computeEmbeddings("x", config, fetch)).rejects.toThrow(/HTTP 502/);
  });

  it("maps fetch network errors to a clean message", async () => {
    const fetch = (async () => { throw new Error("ECONNREFUSED 127.0.0.1:443"); }) as unknown as typeof fetch;
    await expect(computeEmbeddings("x", config, fetch)).rejects.toThrow(/Embeddings provider unreachable/);
  });

  it("classifies a stalled provider that outlives the client-side timeout as unreachable, via the same AbortController the function sets up internally", async () => {
    // computeEmbeddings has no dedicated AbortError branch — its single catch
    // block normalizes DNS/connect/abort failures alike into "Embeddings
    // provider unreachable: <message>". This exercises that path by letting
    // the *real* internal AbortController (setTimeout(..., EMBEDDINGS_TIMEOUT_MS))
    // fire, rather than waiting out a real 30s timer.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Never resolves on its own; only settles when the signal that
      // computeEmbeddings passes in gets aborted — same as a real fetch would.
      const hangingFetch = ((_url: string | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortErr = new Error("This operation was aborted");
            abortErr.name = "AbortError";
            reject(abortErr);
          });
        });
      }) as unknown as typeof fetch;

      const pending = computeEmbeddings("x", config, hangingFetch);
      // Attach the rejection handler synchronously, before advancing the fake
      // clock — otherwise the internal promise can reject *during* the
      // advance below with no handler attached yet, which Node reports as an
      // (eventually-handled-but-still-flagged) unhandled rejection.
      const assertion = expect(pending).rejects.toThrow(
        /Embeddings provider unreachable: This operation was aborted/,
      );
      // EMBEDDINGS_TIMEOUT_MS (30_000) isn't exported; mirrored here. Fake
      // timers fast-forward the internal setTimeout instead of real-waiting.
      await vi.advanceTimersByTimeAsync(30_000);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects empty input arrays", async () => {
    await expect(computeEmbeddings([], config, mockFetch({ body: {} }))).rejects.toThrow(/input is empty/);
  });

  it("rejects oversized batches", async () => {
    const big = Array.from({ length: 2049 }, (_, i) => `s${i}`);
    await expect(computeEmbeddings(big, config, mockFetch({ body: {} }))).rejects.toThrow(/exceeds 2048/);
  });

  it("rejects non-string entries", async () => {
    // @ts-expect-error — exercising runtime guard
    await expect(computeEmbeddings(["ok", 42], config, mockFetch({ body: {} }))).rejects.toThrow(/non-empty string/);
  });

  it("rejects oversized strings", async () => {
    const huge = "a".repeat(32_001);
    await expect(computeEmbeddings([huge], config, mockFetch({ body: {} }))).rejects.toThrow(/32000 chars/);
  });

  it("flags vector-count mismatch from upstream", async () => {
    const fetch = mockFetch({
      body: {
        object: "list",
        model: "text-embedding-3-small",
        data: [{ index: 0, embedding: [0.1], object: "embedding" }],
      },
    });
    // 2 inputs, but mocked response only returns 1 vector → defensive guard fires.
    await expect(computeEmbeddings(["a", "b"], config, fetch)).rejects.toThrow(/returned 1 vectors for 2 inputs/);
  });

  it("rejects empty data[] from provider", async () => {
    const fetch = mockFetch({
      body: { object: "list", model: "text-embedding-3-small", data: [] },
    });
    await expect(computeEmbeddings("x", config, fetch)).rejects.toThrow(/empty data\[\]/);
  });

  it("throws when api_key or model is missing", async () => {
    const bad = { backend: "openai", api_key: "", model: "m" } as EmbeddingsConfig;
    await expect(computeEmbeddings("x", bad, mockFetch({ body: {} }))).rejects.toThrow(/api_key/);
    const noModel = { backend: "openai", api_key: "k", model: "" } as EmbeddingsConfig;
    await expect(computeEmbeddings("x", noModel, mockFetch({ body: {} }))).rejects.toThrow(/model/);
  });
});
