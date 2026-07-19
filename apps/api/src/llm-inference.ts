// ─── iliad_llm_inference — AXIS-hosted LLM completion ──────────
//
// AXIS-owned LLM serving via node-llama-cpp + a small GGUF model
// loaded from the operator-configured AXIS_LLM_MODEL_PATH (defaults
// to `models/Llama-3.2-1B-Instruct-Q4_K_M.gguf` at process.cwd()).
//
// Inference happens in the same process — no upstream provider, no
// per-call API cost. Trade-off: model size is bounded by host RAM
// (~1-3 GB for the recommended picks) and latency is CPU-bound
// (2-15s per 100 tokens depending on the model).
//
// node-llama-cpp's native addon is loaded lazily on the first real
// call. If the model file is missing, `isLlmConfigured()` returns
// false and `runCompletion()` returns a structured _not_configured
// envelope — no crash, no native load attempt. This makes the module
// safe to import in environments (CI, dev sandboxes) where the
// native build wasn't approved.

import path from "node:path";
import fs from "node:fs/promises";
import { isUsableSchema } from "./json-schema-validate.js";

export interface CompletionOptions {
  /** User prompt text. Required. */
  prompt: string;
  /** Optional system prompt. Defaults to a generic helpful-assistant prompt. */
  system?: string;
  /** Cap on generated tokens. Defaults 512. Hard max 2048. */
  max_tokens?: number;
  /** Sampling temperature. Defaults 0.7. Range [0, 2]. */
  temperature?: number;
  /** Top-k sampling. Defaults 40. */
  top_k?: number;
  /** Top-p nucleus sampling. Defaults 0.95. */
  top_p?: number;
  /** Optional seed, threaded through to the model runner (with temperature)
   *  for more deterministic output. NOT a proven byte-identical guarantee:
   *  thread count is never pinned when loading the model, and GGML's
   *  default multi-threaded CPU matmul does not guarantee bit-exact
   *  floating-point reduction order across runs (same disclosed, unproven
   *  gap as Living Architecture's identical seed/temperature-0 usage). */
  seed?: number;
  /** Stop sequences. Generation halts when any string in the array is produced. */
  stop?: string[];
  /** Engineer mode: a JSON Schema to grammar-constrain decoding to + validate against. */
  json_schema?: unknown;
}

export interface CompletionResult {
  text: string;
  model_used: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface NotConfiguredResult {
  _not_configured: true;
  model_path: string;
  hint: string;
}

const MAX_TOKENS_HARD_CAP = 2048;
const MAX_PROMPT_CHARS = 32_768;

function resolveModelPath(): string {
  const env = process.env.AXIS_LLM_MODEL_PATH;
  if (env && env.length > 0) return env;
  return path.join(process.cwd(), "models", "Llama-3.2-1B-Instruct-Q4_K_M.gguf");
}

export async function isLlmConfigured(): Promise<boolean> {
  const p = resolveModelPath();
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ─── Lazy native init ───────────────────────────────────────────
//
// We hold onto a single Llama instance and a single LlamaModel per
// process. createContext() per call gives us isolated generation
// state (so concurrent requests don't bleed). dispose() releases
// the context's KV cache after each call so memory stays bounded.

type LlamaModule = typeof import("node-llama-cpp");
type LlamaModel = Awaited<ReturnType<Awaited<ReturnType<LlamaModule["getLlama"]>>["loadModel"]>>;

let _module: LlamaModule | null = null;
let _model: LlamaModel | null = null;
let _llama: Awaited<ReturnType<LlamaModule["getLlama"]>> | null = null;
let _modelPath: string | null = null;
let _loadPromise: Promise<void> | null = null;

async function ensureLoaded(modelPath: string): Promise<void> {
  if (_model && _modelPath === modelPath) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    if (!_module) {
      // Dynamic import keeps the native addon out of the call graph
      // until we actually need it — so tests that hit isLlmConfigured()
      // alone never trigger a native load.
      _module = (await import("node-llama-cpp")) as LlamaModule;
    }
    const llama = await _module.getLlama();
    _llama = llama;
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
export function resetLlmForTests(): void {
  _model = null;
  _llama = null;
  _modelPath = null;
  _loadPromise = null;
  // Intentionally do NOT null out _module — re-importing the native
  // addon repeatedly causes resource leaks. The module is process-wide.
}

// ─── Validation ─────────────────────────────────────────────────

export function validateCompletionOptions(opts: CompletionOptions): void {
  if (!opts || typeof opts !== "object") {
    throw new Error("runCompletion: options object required");
  }
  if (typeof opts.prompt !== "string" || opts.prompt.length === 0) {
    throw new Error("runCompletion: prompt must be a non-empty string");
  }
  if (opts.prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`runCompletion: prompt exceeds ${MAX_PROMPT_CHARS} chars`);
  }
  if (opts.system !== undefined && typeof opts.system !== "string") {
    throw new Error("runCompletion: system must be a string when provided");
  }
  if (opts.max_tokens !== undefined) {
    if (!Number.isFinite(opts.max_tokens) || opts.max_tokens <= 0) {
      throw new Error("runCompletion: max_tokens must be a positive number");
    }
    if (opts.max_tokens > MAX_TOKENS_HARD_CAP) {
      throw new Error(`runCompletion: max_tokens exceeds hard cap ${MAX_TOKENS_HARD_CAP}`);
    }
  }
  if (opts.temperature !== undefined) {
    if (!Number.isFinite(opts.temperature) || opts.temperature < 0 || opts.temperature > 2) {
      throw new Error("runCompletion: temperature must be in [0, 2]");
    }
  }
  if (opts.top_k !== undefined) {
    if (!Number.isInteger(opts.top_k) || opts.top_k <= 0) {
      throw new Error("runCompletion: top_k must be a positive integer");
    }
  }
  if (opts.top_p !== undefined) {
    if (!Number.isFinite(opts.top_p) || opts.top_p <= 0 || opts.top_p > 1) {
      throw new Error("runCompletion: top_p must be in (0, 1]");
    }
  }
  if (opts.seed !== undefined && !Number.isFinite(opts.seed)) {
    throw new Error("runCompletion: seed must be a finite number");
  }
  if (opts.stop !== undefined) {
    if (!Array.isArray(opts.stop)) {
      throw new Error("runCompletion: stop must be an array of strings");
    }
    for (const s of opts.stop) {
      if (typeof s !== "string") {
        throw new Error("runCompletion: stop[] entries must be strings");
      }
    }
  }
  if (opts.json_schema !== undefined && !isUsableSchema(opts.json_schema)) {
    throw new Error("runCompletion: json_schema must be a usable JSON schema object");
  }
}

// ─── Public entrypoint ──────────────────────────────────────────

export async function runCompletion(
  opts: CompletionOptions,
): Promise<CompletionResult | NotConfiguredResult> {
  validateCompletionOptions(opts);

  const modelPath = resolveModelPath();
  if (!(await isLlmConfigured())) {
    return {
      _not_configured: true,
      model_path: modelPath,
      hint:
        "Place a GGUF model at AXIS_LLM_MODEL_PATH (defaults to models/Llama-3.2-1B-Instruct-Q4_K_M.gguf at process.cwd()). " +
        "After the file is in place, restart the API process; the native runtime loads lazily on the first call.",
    };
  }

  await ensureLoaded(modelPath);
  // _module + _model are guaranteed non-null after ensureLoaded resolves.
  const llamaModule = _module!;
  const model = _model!;

  const context = await model.createContext();
  try {
    const session = new llamaModule.LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: opts.system ?? "You are a helpful assistant.",
    });

    const promptOpts: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.7,
      topK: opts.top_k ?? 40,
      topP: opts.top_p ?? 0.95,
      maxTokens: opts.max_tokens ?? 512,
      seed: opts.seed,
      customStopTriggers: opts.stop,
    };
    if (opts.json_schema !== undefined && _llama) {
      try {
        // Grammar-constrain generation to the schema. Defensive: an unsupported
        // runtime/schema degrades to unconstrained — the handler's post-validation
        // still reports validity.
        promptOpts.grammar = await (_llama as unknown as { createGrammarForJsonSchema(s: unknown): Promise<unknown> }).createGrammarForJsonSchema(opts.json_schema);
      } catch {
        /* unconstrained fallback */
      }
    }
    const text = await session.prompt(opts.prompt, promptOpts as Parameters<typeof session.prompt>[1]);

    // Token counts: best-effort via the model's tokenizer. The chat
    // session doesn't return counts directly, so we count after the fact.
    let prompt_tokens: number | undefined;
    let completion_tokens: number | undefined;
    try {
      prompt_tokens = model.tokenize(opts.prompt).length;
      completion_tokens = model.tokenize(text).length;
    } catch {
      // Tokenizer failures shouldn't break the response — return without counts.
    }

    return {
      text,
      model_used: path.basename(modelPath),
      prompt_tokens,
      completion_tokens,
    };
  } finally {
    // KV cache is held by the context — release it so concurrent calls
    // don't accumulate memory across the process lifetime.
    await context.dispose();
  }
}

export function getModelPath(): string {
  return resolveModelPath();
}
