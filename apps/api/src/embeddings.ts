// ─── iliad_embeddings — AXIS-owned in-process embeddings ────────
//
// Default backend is SOVEREIGN: in-process inference via node-llama-cpp
// (local-embeddings.ts) with an embedding-capable GGUF at
// AXIS_EMBEDDING_MODEL_PATH — same owned pattern as iliad_llm_inference.
// On the local path NO upstream HTTP call is ever made.
//
// The legacy OpenAI /v1/embeddings proxy is retained as an OPTIONAL
// backend behind AXIS_EMBEDDING_BACKEND=openai (still requires
// OPENAI_API_KEY). computeEmbeddings() keeps a stable outward contract
// across both backends so the dispatcher case in mcp-server.ts doesn't
// change.
//
// RESIDUAL HONESTY: the local backend is a structured `_not_configured`
// no-op until the operator provisions the GGUF, and quality is bounded
// by the chosen local model (bge-small = 384 dims vs OpenAI
// text-embedding-3-large = 3072). "AXIS-owned in-process by default,
// OpenAI optional" — not "never uses OpenAI."

import {
  computeLocalEmbeddings,
  normalizeEmbeddingsInput,
  resolveEmbeddingModelPath,
} from "./local-embeddings.js";

export type EmbeddingsInput = string | string[];

export type EmbeddingsBackend = "local" | "openai";

export type EmbeddingsConfig =
  | { backend: "openai"; api_key: string; model: string }
  | { backend: "local"; model_path: string };

export interface EmbeddingsResult {
  vectors: number[][];
  model_used: string;
  /** Token usage as reported by the upstream provider (openai backend only; omitted for local). */
  usage?: { prompt_tokens: number; total_tokens: number };
  /** Echo of how many inputs were submitted (matches vectors.length). */
  input_count: number;
}

export type EmbeddingsConfigFromEnv = EmbeddingsConfig | null;

/**
 * Read embeddings config from env.
 *
 * Resolution order:
 *   backend := AXIS_EMBEDDING_BACKEND ?? "local"
 *   local   -> { backend:"local", model_path: resolveEmbeddingModelPath(env) }
 *              (always non-null; whether the GGUF actually exists is checked
 *               separately via isLocalEmbeddingsConfigured())
 *   openai  -> { backend:"openai", api_key, model } when OPENAI_API_KEY is
 *              set, else null (openai explicitly selected but not provisioned)
 *   other   -> null (unrecognized backend value)
 */
export function readEmbeddingsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingsConfigFromEnv {
  const backend = env.AXIS_EMBEDDING_BACKEND ?? "local";
  if (backend === "local") {
    return { backend: "local", model_path: resolveEmbeddingModelPath(env) };
  }
  if (backend === "openai") {
    const api_key = env.OPENAI_API_KEY;
    if (!api_key) return null;
    return {
      backend: "openai",
      api_key,
      model: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    };
  }
  return null;
}

/** Default OpenAI base URL — override in tests via the second parameter. */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

interface OpenAIEmbeddingResponse {
  object: "list";
  model: string;
  data: Array<{ index: number; embedding: number[]; object: "embedding" }>;
  usage?: { prompt_tokens: number; total_tokens: number };
}

interface OpenAIErrorResponse {
  error: { message: string; type?: string; code?: string };
}

/** Upper bound on the embeddings provider round-trip before we abort. */
const EMBEDDINGS_TIMEOUT_MS = 30_000;

/**
 * Compute embeddings via the configured backend.
 *
 * - `backend:"local"` → delegates to computeLocalEmbeddings() (in-process
 *   node-llama-cpp). NEVER touches `fetchImpl` — the sovereign path makes
 *   no upstream HTTP call. `usage` is omitted (no provider token report).
 * - `backend:"openai"` → the legacy /v1/embeddings proxy. Pure function
 *   over `fetch` so tests can pass a stub.
 *
 * Throws Error with a descriptive message on failure; the dispatcher maps
 * that to an MCP error envelope.
 */
export async function computeEmbeddings(
  input: EmbeddingsInput,
  config: EmbeddingsConfig,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_OPENAI_BASE_URL,
): Promise<EmbeddingsResult> {
  if (config.backend === "local") {
    const r = await computeLocalEmbeddings(input, config.model_path);
    return { vectors: r.vectors, model_used: r.model_used, input_count: r.input_count };
  }

  if (!config.api_key) throw new Error("computeEmbeddings: missing api_key");
  if (!config.model) throw new Error("computeEmbeddings: missing model");

  // Normalize input to an array so the OpenAI call shape is consistent and
  // we can return a vectors[][] response regardless of how the caller
  // structured the input. Empty / non-string entries are rejected early
  // because the upstream silently returns confusing 400s for them.
  // (Identical validation rules as the local backend — shared helper.)
  const inputs = normalizeEmbeddingsInput(input, "computeEmbeddings");

  const url = `${baseUrl}/embeddings`;
  // Bound the provider call so a stalled upstream can't hang the request forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDINGS_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({ input: inputs, model: config.model }),
      signal: controller.signal,
    });
  } catch (err) {
    // Network-layer errors (DNS, connect, abort) get a normalized message
    // so the MCP envelope doesn't expose stack-trace internals.
    throw new Error(`Embeddings provider unreachable: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as OpenAIErrorResponse;
      if (body?.error?.message) detail = `${resp.status} ${body.error.message}`;
    } catch {
      // Body wasn't JSON; keep the bare HTTP status.
    }
    throw new Error(`Embeddings provider error: ${detail}`);
  }

  let body: OpenAIEmbeddingResponse;
  try {
    body = (await resp.json()) as OpenAIEmbeddingResponse;
  } catch {
    throw new Error("Embeddings provider returned non-JSON response");
  }

  if (!Array.isArray(body?.data) || body.data.length === 0) {
    throw new Error("Embeddings provider returned an empty data[] payload");
  }

  // Preserve original input order — OpenAI always returns in index order,
  // but we sort defensively in case a future provider doesn't guarantee it.
  const sorted = [...body.data].sort((a, b) => a.index - b.index);
  const vectors = sorted.map((d) => d.embedding);

  if (vectors.length !== inputs.length) {
    throw new Error(`Embeddings provider returned ${vectors.length} vectors for ${inputs.length} inputs`);
  }

  return {
    vectors,
    model_used: body.model ?? config.model,
    usage: body.usage,
    input_count: inputs.length,
  };
}
