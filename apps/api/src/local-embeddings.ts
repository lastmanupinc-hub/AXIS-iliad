// ─── iliad_embeddings — AXIS-owned in-process embedding backend ──
//
// Sovereign embeddings via node-llama-cpp + an embedding-capable GGUF
// model (e.g. bge-small-en-v1.5, nomic-embed-text) loaded from the
// operator-configured AXIS_EMBEDDING_MODEL_PATH (defaults to
// `models/bge-small-en-v1.5-q4_k_m.gguf` at process.cwd()).
//
// Mirrors llm-inference.ts: the native addon is imported lazily on the
// first real call; a single LlamaModel is cached per process; and — same
// concurrency decision as llm-inference — an embedding CONTEXT is created
// per computeLocalEmbeddings() call and disposed in a finally block, so
// concurrent batches never share evaluation state and memory stays
// bounded. (We deliberately do NOT cache a context handle.)
//
// The GGUF must be an EMBEDDING model (one with a pooling head).
// A generative-only model fails at createEmbeddingContext() with the
// runtime's own error, which we surface verbatim — no silent garbage
// vectors.
//
// If the model file is missing, `isLocalEmbeddingsConfigured()` returns
// false and computeLocalEmbeddings() throws BEFORE any native load is
// attempted — safe to import in CI / dev sandboxes without the model.
//
// RESIDUAL HONESTY: this backend is a structured no-op (_not_configured
// at the tool layer) until the operator provisions the GGUF, and
// retrieval quality is bounded by the chosen local model (bge-small is
// 384-dim vs OpenAI text-embedding-3-large's 3072). The legacy OpenAI
// proxy still exists behind AXIS_EMBEDDING_BACKEND=openai.

import path from "node:path";
import fs from "node:fs/promises";
import type { EmbeddingsInput } from "./embeddings.js";

export interface LocalEmbeddingsResult {
  vectors: number[][];
  model_used: string;
  input_count: number;
}

export interface LocalNotConfiguredResult {
  _not_configured: true;
  model_path: string;
  hint: string;
}

const DEFAULT_EMBEDDING_MODEL_FILENAME = "bge-small-en-v1.5-q4_k_m.gguf";

/** AXIS_EMBEDDING_MODEL_PATH when set, else models/<default>.gguf at cwd. */
export function resolveEmbeddingModelPath(env: NodeJS.ProcessEnv = process.env): string {
  const p = env.AXIS_EMBEDDING_MODEL_PATH;
  if (p && p.length > 0) return p;
  return path.join(process.cwd(), "models", DEFAULT_EMBEDDING_MODEL_FILENAME);
}

export function getEmbeddingModelPath(): string {
  return resolveEmbeddingModelPath();
}

export async function isLocalEmbeddingsConfigured(): Promise<boolean> {
  try {
    await fs.access(resolveEmbeddingModelPath());
    return true;
  } catch {
    return false;
  }
}

// ─── Shared input validation ────────────────────────────────────
//
// Identical rules for both backends (non-empty strings, <=2048 batch,
// <=32000 chars per entry). Lives here so embeddings.ts (the dispatcher)
// can reuse it for the OpenAI branch without a runtime import cycle —
// the only import in the other direction is type-only.

export function normalizeEmbeddingsInput(input: EmbeddingsInput, fnName = "computeLocalEmbeddings"): string[] {
  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length === 0) throw new Error(`${fnName}: input is empty`);
  if (inputs.length > 2048) throw new Error(`${fnName}: input batch exceeds 2048 items`);
  for (let i = 0; i < inputs.length; i++) {
    const s = inputs[i];
    if (typeof s !== "string" || s.length === 0) {
      throw new Error(`${fnName}: input[${i}] must be a non-empty string`);
    }
    if (s.length > 32_000) {
      // Roughly 8k tokens of safety margin — agents that need more should chunk.
      throw new Error(`${fnName}: input[${i}] exceeds 32000 chars (chunk before calling)`);
    }
  }
  return inputs;
}

// ─── Lazy native init (mirrors llm-inference.ts) ────────────────

type LlamaModule = typeof import("node-llama-cpp");
type LlamaModel = Awaited<ReturnType<Awaited<ReturnType<LlamaModule["getLlama"]>>["loadModel"]>>;

let _module: LlamaModule | null = null;
let _model: LlamaModel | null = null;
let _modelPath: string | null = null;
let _loadPromise: Promise<void> | null = null;

async function ensureLoaded(modelPath: string): Promise<void> {
  if (_model && _modelPath === modelPath) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    if (!_module) {
      // Dynamic import keeps the native addon out of the call graph until a
      // real embedding is requested — isLocalEmbeddingsConfigured() alone
      // never triggers a native load.
      _module = (await import("node-llama-cpp")) as LlamaModule;
    }
    const llama = await _module.getLlama();
    _model = await llama.loadModel({ modelPath });
    _modelPath = modelPath;
  })();
  try {
    await _loadPromise;
  } finally {
    _loadPromise = null;
  }
}

/** Test-only helper. Drops the cached model handle so a subsequent call reloads. */
export function resetLocalEmbeddingsForTests(): void {
  _model = null;
  _modelPath = null;
  _loadPromise = null;
  // Intentionally do NOT null out _module — re-importing the native
  // addon repeatedly causes resource leaks. The module is process-wide.
}

// ─── Public entrypoint ──────────────────────────────────────────

/**
 * Embed one string or a batch, fully in-process — no upstream HTTP call,
 * no provider API key. Throws (rather than returning an envelope) when the
 * model file is absent; the dispatcher layer (embeddings.ts/runEmbeddings)
 * converts that state into a structured `_not_configured` response BEFORE
 * charging, so this throw is a defense-in-depth guard, not the primary UX.
 *
 * @param modelPathOverride explicit path from an EmbeddingsConfig; defaults
 *   to resolveEmbeddingModelPath() (env or cwd fallback).
 */
export async function computeLocalEmbeddings(
  input: EmbeddingsInput,
  modelPathOverride?: string,
): Promise<LocalEmbeddingsResult> {
  const inputs = normalizeEmbeddingsInput(input, "computeLocalEmbeddings");

  const modelPath = modelPathOverride ?? resolveEmbeddingModelPath();
  try {
    await fs.access(modelPath);
  } catch {
    // Fail BEFORE any native load attempt so missing-model environments
    // (CI, sandboxes) never touch the addon.
    throw new Error(
      `Local embeddings model not found at ${modelPath}. ` +
        "Place an embedding-capable GGUF there (e.g. bge-small-en-v1.5 Q4_K_M) or set AXIS_EMBEDDING_MODEL_PATH, " +
        "or select the optional OpenAI backend via AXIS_EMBEDDING_BACKEND=openai + OPENAI_API_KEY.",
    );
  }

  await ensureLoaded(modelPath);
  // _model is guaranteed non-null after ensureLoaded resolves.
  const model = _model!;

  // Context per call (see header): isolated state, disposed in finally.
  const ctx = await model.createEmbeddingContext();
  try {
    const vectors: number[][] = [];
    for (const text of inputs) {
      const e = await ctx.getEmbeddingFor(text);
      vectors.push([...e.vector]);
    }
    return {
      vectors,
      model_used: path.basename(modelPath),
      input_count: inputs.length,
    };
  } finally {
    await ctx.dispose();
  }
}
