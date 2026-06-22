// ─── iliad_embeddings — OpenAI /v1/embeddings proxy ─────────────
//
// AXIS-branded wrapper around OpenAI's embeddings endpoint. Same
// pattern as iliad_web_research → Firecrawl: a single MCP-native
// surface that handles auth, error normalization, and billing, while
// the actual inference stays at the upstream provider for now.
//
// Future module swap (per capability-map.yaml replication_plan):
// run fastembed-ONNX in-process so we own the inference layer. The
// computeEmbeddings() signature stays stable across that swap so
// the dispatcher case in mcp-server.ts doesn't change.

export type EmbeddingsInput = string | string[];

export interface EmbeddingsConfig {
  api_key: string;
  model: string;
}

export interface EmbeddingsResult {
  vectors: number[][];
  model_used: string;
  /** Token usage as reported by the upstream provider (when available). */
  usage?: { prompt_tokens: number; total_tokens: number };
  /** Echo of how many inputs were submitted (matches vectors.length). */
  input_count: number;
}

export type EmbeddingsConfigFromEnv = EmbeddingsConfig | null;

/** Read embeddings config from env. Returns null if OPENAI_API_KEY is missing. */
export function readEmbeddingsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmbeddingsConfigFromEnv {
  const api_key = env.OPENAI_API_KEY;
  if (!api_key) return null;
  return {
    api_key,
    model: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
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
 * Call OpenAI's /v1/embeddings endpoint. Pure function over `fetch` so
 * tests can pass a stub. Throws Error with a descriptive message on
 * non-2xx responses; the dispatcher maps that to an MCP error envelope.
 */
export async function computeEmbeddings(
  input: EmbeddingsInput,
  config: EmbeddingsConfig,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_OPENAI_BASE_URL,
): Promise<EmbeddingsResult> {
  if (!config.api_key) throw new Error("computeEmbeddings: missing api_key");
  if (!config.model) throw new Error("computeEmbeddings: missing model");

  // Normalize input to an array so the OpenAI call shape is consistent and
  // we can return a vectors[][] response regardless of how the caller
  // structured the input. Empty / non-string entries are rejected early
  // because the upstream silently returns confusing 400s for them.
  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length === 0) throw new Error("computeEmbeddings: input is empty");
  if (inputs.length > 2048) throw new Error("computeEmbeddings: input batch exceeds 2048 items");
  for (let i = 0; i < inputs.length; i++) {
    const s = inputs[i];
    if (typeof s !== "string" || s.length === 0) {
      throw new Error(`computeEmbeddings: input[${i}] must be a non-empty string`);
    }
    if (s.length > 32_000) {
      // Roughly 8k tokens of safety margin — agents that need more should chunk.
      throw new Error(`computeEmbeddings: input[${i}] exceeds 32000 chars (chunk before calling)`);
    }
  }

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
