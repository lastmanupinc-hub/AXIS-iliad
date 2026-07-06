# WO-11 · sovereign-embeddings

**Claim it makes true:** Web pages present iliad_embeddings as an AXIS capability.

**Tier:** A_pure_software · **Effort:** M · **Package:** apps/api (@axis/api) + packages/mpp + apps/web + .ai

**Verify verdict:** implementable_by_sonnet5=`True` · fully_closes_claim=`True` · confidence=`high`
**Missing for codeability:** Two small design decisions the spec leaves implicit: (1) concurrency/lifecycle policy for the cached embedding context -- llm-inference creates+disposes a context per call to avoid concurrent bleed, but the interface sketch caches a single _ctx and calls getEmbeddingFor sequentially; the agent must decide whether to serialize, pool, or create-per-batch. (2) Whether createEmbeddingContext needs any embedding-specific loadModel options and that the operator's GGUF is an actual embedding model (pooling) rather than a generative one. Both are resolvable from the node-llama-cpp types without further product design.
**Spec overclaims flagged:** 'MODEL-GATED ... same input twice yields byte-identical vectors (deterministic)' -- embedding forward passes are usually deterministic but FP/thread-count non-determinism is possible; stated more strongly than guaranteed (mitigated: skipIf model-gated, never runs in CI).; Interface comment 'mirrors llm-inference.ts exactly' while actually diverging -- it caches _ctx whereas llm-inference deliberately creates+disposes a context per call for concurrency isolation.; Lists ForAgentsPage.tsx and InstallPage.tsx as honesty-edit targets, but both only enumerate iliad_embeddings in a bullet and never call it an OpenAI proxy, so the STATIC HONESTY acceptance for those files is already trivially satisfied -- the edits are near-no-ops (only InstallPage's AXIS_EMBEDDING_MODEL_PATH doc is a real addition).; external_gates framing ('all code, unit tests ... build and pass now without it') is true for tests but understates that the default-backend flip is a runtime regression for existing OpenAI-backed deployments, not a pure additive change.
**Hidden external gates:** None of the credential/Stripe/network kind. Only gate is operator provisioning an embedding-capable GGUF at AXIS_EMBEDDING_MODEL_PATH -- pure local-file provisioning, correctly disclosed, identical to the already-accepted iliad_llm_inference GGUF gate.; Under-emphasized ops action (not a credential gate): flipping the default backend to 'local' makes live deployments that currently serve embeddings via OPENAI_API_KEY return _not_configured on deploy until the operator drops a GGUF or sets AXIS_EMBEDDING_BACKEND=openai. Disclosed as a gate but framed as purely additive.

## Current state
iliad_embeddings is a pure OpenAI HTTP proxy, not an AXIS-owned capability. apps/api/src/embeddings.ts:1-11 header literally says "OpenAI /v1/embeddings proxy"; computeEmbeddings (:63) POSTs to https://api.openai.com/v1/embeddings (DEFAULT_OPENAI_BASE_URL, :42). Config comes only from OPENAI_API_KEY/OPENAI_EMBEDDING_MODEL via readEmbeddingsConfigFromEnv (:32-39). Handler runEmbeddings (mcp-tool-impls.ts:321) reads that config (:326), returns an OpenAI-only _not_configured envelope (:327-336), authorizes/captures credits (:363,:365), calls computeEmbeddings (:364); engineer post-processing buildEngineerEmbeddings at :368 is backend-agnostic (operates on vectors). Tool description says "Currently proxies OpenAI /v1/embeddings" (mcp-tools.ts:908-909). Env declared env.ts:60-63. Capability-map status is live_proxy (.ai/capability-map.yaml:179-184). Web copy lists iliad_embeddings as an AXIS tool (ForAgentsPage.tsx:161, InstallPage.tsx). Owned precedent iliad_llm_inference (llm-inference.ts) already runs in-process via node-llama-cpp: lazy await import (:100), resolveModelPath() from AXIS_LLM_MODEL_PATH (:60-64), isLlmConfigured() via fs.access (:66-74), process-cached _model handle, _not_configured envelope (:188-196), handler runLlmInference (mcp-tool-impls.ts:629). Crucially, node-llama-cpp is ALREADY a declared runtime dep (apps/api/package.json:25) and its v3 API exposes embeddings (model.createEmbeddingContext() then ctx.getEmbeddingFor(text) returning { vector: readonly number[] }), so the sovereign path needs NO new dependency. Pricing: mpp/src/index.ts:170-177 tiers iliad_embeddings as markup-over-OpenAI (standard 5c / lite 2c); iliad_llm_inference (:204-211) is low-markup in-process (standard 2c / lite 1c).

## Target state (== the claim is literally true)
A sovereign, in-process embeddings backend exists and is the default, mirroring iliad_llm_inference, so "AXIS-owned embeddings" is literally true. Implemented by reusing the already-approved node-llama-cpp native runtime with an embedding-capable GGUF model (e.g. bge-small-en-v1.5 or nomic-embed-text GGUF) loaded from AXIS_EMBEDDING_MODEL_PATH -- no new runtime dependency, and on the local path NO upstream HTTP call is made. A backend selector AXIS_EMBEDDING_BACKEND (local | openai, default local) chooses the sovereign path; the OpenAI proxy is retained behind AXIS_EMBEDDING_BACKEND=openai (still requires OPENAI_API_KEY). computeEmbeddings keeps a stable outward contract (returns EmbeddingsResult { vectors, model_used, input_count, usage? }) so runEmbeddings and the mcp-server dispatcher are effectively unchanged except the _not_configured envelope becomes backend-aware. Engineer mode (Matryoshka truncation + corpus adapter) continues to work unchanged on the returned vectors. Web copy, mcp-tools.ts description, env.ts docs, and capability-map status are updated from "proxies OpenAI" to "AXIS-owned in-process (node-llama-cpp); OpenAI optional behind a flag" -- no overclaim, matching the honest iliad_llm_inference wording.

## Files to create / edit
- apps/api/src/local-embeddings.ts (NEW -- native in-process embedding module mirroring llm-inference.ts)
- apps/api/src/embeddings.ts (EDIT -- config discriminated union, backend resolution in readEmbeddingsConfigFromEnv, computeEmbeddings dispatch, header comment)
- apps/api/src/mcp-tool-impls.ts (EDIT -- runEmbeddings: backend-aware _not_configured envelope; keep charge/engineer/return path)
- apps/api/src/env.ts (EDIT -- add AXIS_EMBEDDING_BACKEND + AXIS_EMBEDDING_MODEL_PATH; reword OPENAI_* to optional/legacy backend)
- apps/api/src/mcp-tools.ts (EDIT -- iliad_embeddings description: AXIS-owned in-process, OpenAI behind flag)
- packages/mpp/src/index.ts (EDIT -- re-tier iliad_embeddings comment + optional lower standard/lite to reflect in-process cost)
- .ai/capability-map.yaml (EDIT -- embeddings.status live_proxy -> owned; note node-llama-cpp satisfies the sovereign runtime; keep OpenAI as optional provider)
- apps/web/src/pages/ForAgentsPage.tsx (EDIT -- copy honesty if it labels embeddings as proxy)
- apps/web/src/pages/InstallPage.tsx (EDIT -- copy honesty; document AXIS_EMBEDDING_MODEL_PATH)
- apps/api/src/local-embeddings.test.ts (NEW -- unit tests for path/config/native gating)
- apps/api/src/embeddings.test.ts (EDIT -- backend-selection + no-fetch-on-local assertions)

## Interfaces
```ts
// apps/api/src/local-embeddings.ts (NEW -- mirrors llm-inference.ts exactly)
export interface LocalEmbeddingsResult { vectors: number[][]; model_used: string; input_count: number; }
export interface LocalNotConfiguredResult { _not_configured: true; model_path: string; hint: string; }
export function resolveEmbeddingModelPath(): string; // AXIS_EMBEDDING_MODEL_PATH or path.join(cwd,"models","bge-small-en-v1.5-q4_k_m.gguf")
export async function isLocalEmbeddingsConfigured(): Promise<boolean>; // fs.access(resolveEmbeddingModelPath())
export function getEmbeddingModelPath(): string; // = resolveEmbeddingModelPath()
export function resetLocalEmbeddingsForTests(): void; // drops cached _model/_ctx handle, keeps _module
// Lazy: _module = await import("node-llama-cpp"); llama.loadModel({modelPath}); ctx = await model.createEmbeddingContext();
// per-input: const e = await ctx.getEmbeddingFor(text); vectors.push([...e.vector]); model_used = path.basename(modelPath)
export async function computeLocalEmbeddings(input: string | string[]): Promise<LocalEmbeddingsResult>;
// Reuse identical input validation as computeEmbeddings (non-empty strings, <=2048 batch, <=32000 chars).

// apps/api/src/embeddings.ts (EDIT)
export type EmbeddingsBackend = "local" | "openai";
export type EmbeddingsConfig =
  | { backend: "openai"; api_key: string; model: string }
  | { backend: "local"; model_path: string };
export type EmbeddingsConfigFromEnv = EmbeddingsConfig | null;
// Resolution order in readEmbeddingsConfigFromEnv(env):
//   backend := env.AXIS_EMBEDDING_BACKEND ?? "local"
//   if backend==="local": return { backend:"local", model_path: resolveEmbeddingModelPath() }
//   if backend==="openai": return env.OPENAI_API_KEY ? { backend:"openai", api_key, model: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small" } : null
export function readEmbeddingsConfigFromEnv(env?: NodeJS.ProcessEnv): EmbeddingsConfigFromEnv;
// computeEmbeddings dispatches on config.backend; OpenAI branch keeps existing fetchImpl/baseUrl params (default fetch / DEFAULT_OPENAI_BASE_URL); local branch delegates to computeLocalEmbeddings and NEVER touches fetch.
export async function computeEmbeddings(
  input: EmbeddingsInput,
  config: EmbeddingsConfig,
  fetchImpl?: typeof fetch,
  baseUrl?: string,
): Promise<EmbeddingsResult>; // EmbeddingsResult unchanged (usage optional; omitted for local)

// apps/api/src/mcp-tool-impls.ts runEmbeddings -- backend-aware not-configured:
//   const config = readEmbeddingsConfigFromEnv();
//   if (!config) { return _not_configured envelope (openai backend selected but OPENAI_API_KEY missing) }
//   if (config.backend === "local" && !(await isLocalEmbeddingsConfigured()))
//     return { _not_configured:true, tool:"iliad_embeddings", backend:"local", model_path:getEmbeddingModelPath(),
//              reason:"Embedding GGUF model file is not present at AXIS_EMBEDDING_MODEL_PATH.",
//              remediation:"Operator must download an embedding GGUF (e.g. bge-small-en-v1.5 Q4_K_M ~130MB MIT) and set AXIS_EMBEDDING_MODEL_PATH, or set AXIS_EMBEDDING_BACKEND=openai + OPENAI_API_KEY." }
//   ... unchanged: engineer gate, authorizeMcpToolCredits, computeEmbeddings, captureMcpToolCredits, buildEngineerEmbeddings.
```

## Acceptance tests (DONE == claim true)
- ALWAYS-RUN (no model file needed): readEmbeddingsConfigFromEnv({}) returns { backend:'local', model_path: <resolveEmbeddingModelPath()> } (default backend is local).
- ALWAYS-RUN: readEmbeddingsConfigFromEnv({ AXIS_EMBEDDING_BACKEND:'openai', OPENAI_API_KEY:'sk-x' }) returns { backend:'openai', api_key:'sk-x', model:'text-embedding-3-small' }; with backend=openai and NO OPENAI_API_KEY it returns null.
- ALWAYS-RUN: resolveEmbeddingModelPath() returns AXIS_EMBEDDING_MODEL_PATH when set, else a path ending in models/<name>.gguf; isLocalEmbeddingsConfigured() is false for a nonexistent path and true after fs.writeFile of a fake file (mirrors llm-inference.test.ts:25-60).
- ALWAYS-RUN (sovereignty proof): computeEmbeddings('hi', { backend:'local', model_path:<nonexistent path> }, fetchSpy) rejects with a local-model error AND fetchSpy was called 0 times -- the local backend never contacts OpenAI. A valid OpenAI config with a stub fetch still hits the stub (existing embeddings.test.ts OpenAI tests keep passing unmodified).
- ALWAYS-RUN: runEmbeddings({input:'hi'}, req) with an authenticated req and no model file present returns JSON with _not_configured:true, backend:'local', model_path referencing AXIS_EMBEDDING_MODEL_PATH, and remediation text that does NOT tell the caller OPENAI_API_KEY is the only option.
- MODEL-GATED (describe.skipIf(!fs.existsSync(process.env.AXIS_EMBEDDING_MODEL_PATH ?? '')) -- mirrors llm-inference real-model gating): with a real embedding GGUF at AXIS_EMBEDDING_MODEL_PATH, computeLocalEmbeddings(['alpha','beta']) returns vectors.length===2, each vector number[] with length>0 and identical dimensionality, all finite; same input twice yields byte-identical vectors (deterministic); model_used === basename of the model path.
- STATIC HONESTY: grep of embeddings.ts header, mcp-tools.ts iliad_embeddings description, env.ts:60-63, and capability-map embeddings block contains NO 'Currently proxies OpenAI' / 'live_proxy' as the primary state; each states in-process node-llama-cpp is the default and OpenAI is optional behind AXIS_EMBEDDING_BACKEND=openai. ForAgentsPage/InstallPage do not describe embeddings as an OpenAI proxy.
- BUILD/TYPES: pnpm -C apps/api build (tsc strict) passes with the EmbeddingsConfig discriminated union; pnpm vitest run apps/api/src/embeddings.test.ts apps/api/src/local-embeddings.test.ts is green. No class components; no new entry in apps/api/package.json dependencies.

## External gates (code alone can't satisfy)
- Operator must provision an embedding-capable GGUF model file at AXIS_EMBEDDING_MODEL_PATH for the local backend to actually return vectors (identical ops step to iliad_llm_inference's GGUF requirement). This is local file provisioning, NOT a credential/partnership/Stripe gate -- all code, unit tests, and the backend-selection/no-fetch/sovereignty assertions build and pass now without it; only the one deterministic-vector test is model-gated via describe.skipIf, exactly as llm-inference gates its real-inference test.

## New runtime deps (project forbids w/o discussion)
_none_

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes literally true: web pages present iliad_embeddings as an AXIS capability -- after this, iliad_embeddings has a sovereign in-process implementation (node-llama-cpp) matching the already-owned iliad_llm_inference, so "AXIS-owned" is not an overclaim. capability-map embeddings.status moves live_proxy -> owned. RESIDUAL HONESTY CAVEAT (must remain in docs/envelopes): like iliad_llm_inference, the sovereign backend is a _not_configured no-op until the operator places the embedding GGUF; retrieval quality is bounded by the operator-chosen local model (e.g. bge-small ~384d vs OpenAI text-embedding-3-large); the OpenAI path still exists behind AXIS_EMBEDDING_BACKEND=openai, so copy must say "AXIS-owned in-process by default, OpenAI optional" not "never uses OpenAI." Do NOT restate capability-map replication_plan aspirations (sub-50ms p95, free 1M tokens/mo, Cloudflare Workers) as shipped.
