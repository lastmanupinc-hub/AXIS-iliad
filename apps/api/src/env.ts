// ─── Environment variable validation ────────────────────────────
//
// Call validateEnv() at startup to fail fast on missing/invalid config.
// Each variable declares: required | optional, type, default, description.

export interface EnvSpec {
  key: string;
  required: boolean;
  type: "string" | "number" | "boolean";
  default?: string;
  description: string;
}

export const ENV_SPEC: EnvSpec[] = [
  { key: "PORT", required: false, type: "number", default: "4000", description: "HTTP listen port" },
  { key: "NODE_ENV", required: false, type: "string", default: "development", description: "Runtime environment (development | production | test)" },
  { key: "DATABASE_URL", required: false, type: "string", description: "PostgreSQL connection string (Neon). Required at runtime — the data layer fails fast in production if unset." },
  { key: "LOG_LEVEL", required: false, type: "string", default: "info", description: "Log verbosity (debug | info | warn | error)" },
  { key: "CORS_ORIGIN", required: false, type: "string", default: "*", description: "Allowed CORS origin (* for dev, auto-restricts to production domain when NODE_ENV=production)" },
  { key: "RATE_LIMIT_WINDOW_MS", required: false, type: "number", default: "60000", description: "Rate limit sliding window in ms" },
  { key: "RATE_LIMIT_MAX_REQUESTS", required: false, type: "number", default: "60", description: "Max requests per window (anonymous)" },
  { key: "RATE_LIMIT_MAX_AUTHENTICATED", required: false, type: "number", default: "120", description: "Max requests per window (authenticated)" },
  { key: "SHUTDOWN_TIMEOUT_MS", required: false, type: "number", default: "10000", description: "Graceful shutdown drain timeout in ms" },
  { key: "REQUEST_TIMEOUT_MS", required: false, type: "number", default: "120000", description: "Per-request timeout in ms (0 = no limit)" },
  { key: "MAX_BODY_BYTES", required: false, type: "number", default: "52428800", description: "Maximum request body size in bytes (default 50MB)" },
  { key: "KEEP_ALIVE_TIMEOUT_MS", required: false, type: "number", default: "65000", description: "HTTP keep-alive timeout in ms (must exceed LB idle timeout)" },
  // Admin access
  { key: "ADMIN_API_KEY", required: false, type: "string", description: "API key that grants access to /v1/admin/* endpoints. If unset, admin endpoints return 403." },
  // Stripe payment integration
  { key: "STRIPE_SECRET_KEY", required: false, type: "string", description: "Stripe secret API key for checkout and subscription management" },
  { key: "STRIPE_WEBHOOK_SECRET", required: false, type: "string", description: "Stripe webhook signing secret (whsec_...) for Stripe-Signature verification" },
  { key: "STRIPE_PRICE_ID_STARTER", required: false, type: "string", description: "Stripe price ID for the Starter ($29/mo) plan" },
  { key: "STRIPE_PRICE_ID_STARTER_ANNUAL", required: false, type: "string", description: "Stripe price ID for the Starter ($278.40/yr) plan" },
  { key: "STRIPE_PRICE_ID_PRO", required: false, type: "string", description: "Stripe price ID for the Pro ($99/mo) plan" },
  { key: "STRIPE_PRICE_ID_PRO_ANNUAL", required: false, type: "string", description: "Stripe price ID for the Pro ($950.40/yr) plan" },
  { key: "STRIPE_PRICE_ID_GROWTH", required: false, type: "string", description: "Stripe price ID for the Growth ($299/mo) plan" },
  { key: "STRIPE_PRICE_ID_GROWTH_ANNUAL", required: false, type: "string", description: "Stripe price ID for the Growth ($2,870.40/yr) plan" },
  { key: "STRIPE_PRICE_ID_PAID", required: false, type: "string", description: "Legacy Stripe price ID alias for Starter" },
  { key: "STRIPE_PRICE_ID_PAID_ANNUAL", required: false, type: "string", description: "Legacy Stripe price ID alias for Starter annual" },
  { key: "STRIPE_PRICE_ID_SUITE", required: false, type: "string", description: "Legacy Stripe price ID alias for Growth" },
  // Proxied tool integrations
  { key: "FIRECRAWL_API_KEY", required: false, type: "string", description: "API key for the OPTIONAL Firecrawl web-research proxy backend (https://firecrawl.dev). Only consulted when AXIS_WEB_RESEARCH_BACKEND=firecrawl — the default AXIS-owned sovereign backend needs no key." },
  // Web research (iliad_web_research / iliad_web_research_crawl — AXIS-owned
  // sovereign crawler by DEFAULT: SSRF-guarded fetch + robots.txt + per-host
  // politeness + zero-dep readability over node built-ins. Static HTML only —
  // no JavaScript rendering. Firecrawl retained ONLY behind the explicit
  // AXIS_WEB_RESEARCH_BACKEND=firecrawl flag.)
  { key: "AXIS_WEB_RESEARCH_BACKEND", required: false, type: "string", default: "sovereign", description: "Web research backend selector: `sovereign` (default — AXIS-owned fetch+extract+crawl, no third-party key) or `firecrawl` (optional legacy proxy; requires FIRECRAWL_API_KEY, without which the tools return a structured `_not_configured` envelope)." },
  { key: "AXIS_WEB_RESEARCH_USER_AGENT", required: false, type: "string", description: "User-Agent the sovereign crawler presents on every fetch (also matched against robots.txt User-agent groups). Defaults to the AxisIliadBot UA." },
  { key: "AXIS_WEB_RESEARCH_MAX_BYTES", required: false, type: "number", default: "5242880", description: "Per-document byte cap for the sovereign fetcher (default 5 MiB). Larger bodies are truncated and flagged truncated:true in metadata." },
  { key: "AXIS_WEB_RESEARCH_TIMEOUT_MS", required: false, type: "number", default: "30000", description: "Total timeout in ms for one sovereign fetch including all redirect hops and body read (default 30000)." },
  { key: "AXIS_WEB_RESEARCH_POLITENESS_MS", required: false, type: "number", default: "1000", description: "Minimum delay in ms between successive sovereign fetches to the same host (default 1000). A larger robots.txt Crawl-delay is honored over this floor." },
  { key: "AXIS_WEB_RESEARCH_ALLOW_PRIVATE_HOSTS", required: false, type: "boolean", description: "Dev/test escape hatch ONLY: 1/true disables the sovereign fetcher's SSRF address+port checks so hermetic tests can fetch 127.0.0.1 fixtures. The http/https scheme allowlist still applies. NEVER set in production." },
  { key: "REPLICATE_API_TOKEN", required: false, type: "string", description: "API token for Replicate image/video generation (https://replicate.com)" },
  { key: "FASTIO_API_KEY", required: false, type: "string", description: "API key for Fastio persistent storage and RAG (https://fast.io)" },
  { key: "RESEND_API_KEY", required: false, type: "string", description: "API key for Resend email delivery (https://resend.com). Used by the internal welcome/upgrade/usage-alert pipeline in @axis/snapshots and by the agent-facing iliad_transactional_email MCP tool (proxy mode)." },
  { key: "RESEND_FROM_ADDRESS", required: false, type: "string", description: "Verified Resend sender address used as the From: header for iliad_transactional_email. Must be a domain you've verified in the Resend dashboard. When unset, iliad_transactional_email returns a structured _not_configured envelope." },
  // OAuth login (web sign-in via GitHub / Google → HttpOnly axis_session cookie).
  // Optional so local dev and API-key-only deploys still boot; when a client_id is
  // set the matching secret must be too, or that provider's /v1/auth/* returns 503.
  { key: "GITHUB_CLIENT_ID", required: false, type: "string", description: "GitHub OAuth App client ID for web login (GET /v1/auth/github)." },
  { key: "GITHUB_CLIENT_SECRET", required: false, type: "string", description: "GitHub OAuth App client secret. Required alongside GITHUB_CLIENT_ID for the callback token exchange." },
  { key: "GITHUB_CALLBACK_URL", required: false, type: "string", default: "http://localhost:4000/v1/auth/github/callback", description: "GitHub OAuth redirect URI. Must byte-match the URI registered in the GitHub OAuth App." },
  { key: "GOOGLE_CLIENT_ID", required: false, type: "string", description: "Google OAuth 2.0 client ID for web login (GET /v1/auth/google)." },
  { key: "GOOGLE_CLIENT_SECRET", required: false, type: "string", description: "Google OAuth 2.0 client secret. Required alongside GOOGLE_CLIENT_ID for the callback token exchange." },
  { key: "GOOGLE_CALLBACK_URL", required: false, type: "string", default: "http://localhost:4000/v1/auth/google/callback", description: "Google OAuth redirect URI. Must byte-match the Authorized redirect URI in Google Cloud Console, or the token exchange fails with redirect_uri_mismatch." },
  { key: "PAID_WALLET_MODE", required: false, type: "string", default: "off", description: "Rollout gate for the PAI'D Fabric-Credit wallet (MCP tokens-out): off (default, no wallet calls) | read (surface balance) | shadow (log would-be debits) | enforce (debit + 402 top-up). Advance only after dogfooding live PAI'D." },
  // GitHub App webhook (push / pull_request → background snapshot)
  { key: "GITHUB_WEBHOOK_SECRET", required: false, type: "string", description: "Shared secret from the GitHub App settings. Verifies X-Hub-Signature-256 on POST /v1/github/webhook. If unset, the endpoint returns 503 so the App retries until ops finishes the deploy." },
  { key: "GITHUB_TOKEN", required: false, type: "string", description: "Personal-access token fallback used when fetching tarballs for webhook-triggered snapshots and the /v1/github/analyze handler when no per-account token is stored." },
  // Embeddings (iliad_embeddings — AXIS-owned in-process backend via node-llama-cpp
  // by default, same sovereign pattern as iliad_llm_inference. The OpenAI proxy is
  // OPTIONAL, behind AXIS_EMBEDDING_BACKEND=openai.)
  { key: "AXIS_EMBEDDING_BACKEND", required: false, type: "string", default: "local", description: "Embeddings backend selector for iliad_embeddings: `local` (default — AXIS-owned in-process inference via node-llama-cpp with an embedding-capable GGUF; no upstream HTTP call) or `openai` (optional legacy proxy; requires OPENAI_API_KEY)." },
  { key: "AXIS_EMBEDDING_MODEL_PATH", required: false, type: "string", description: "Path to an embedding-capable GGUF model (e.g. bge-small-en-v1.5 Q4_K_M, ~130MB, MIT) for the local backend. Defaults to models/bge-small-en-v1.5-q4_k_m.gguf at process.cwd(). Until the file is present, iliad_embeddings returns a structured `_not_configured: true` envelope (backend: local) — same operator gate as AXIS_LLM_MODEL_PATH for iliad_llm_inference." },
  { key: "OPENAI_API_KEY", required: false, type: "string", description: "OpenAI API key. Optional: only consulted when AXIS_EMBEDDING_BACKEND=openai selects the legacy embeddings proxy. When that backend is selected and this is unset, iliad_embeddings returns a structured `_not_configured: true` envelope listing the missing env var so callers can branch without parsing free text." },
  { key: "OPENAI_EMBEDDING_MODEL", required: false, type: "string", default: "text-embedding-3-small", description: "OpenAI embedding model used by iliad_embeddings when AXIS_EMBEDDING_BACKEND=openai. Defaults to text-embedding-3-small. Override to text-embedding-3-large or any compatible model on a per-deploy basis. Ignored on the default local backend." },
  // Network tokenization (iliad_network_tokenization — WO-14. The Stripe read
  // adapter is the buildable-live default and reuses STRIPE_SECRET_KEY above.
  // Direct VTS/MDES provisioning is capability-gated behind network-issued
  // Token Requestor IDs; until set, those paths return a structured
  // `_not_configured: true` envelope naming the exact missing gate.)
  { key: "AXIS_VTS_TOKEN_REQUESTOR_ID", required: false, type: "string", description: "Visa-issued Token Requestor ID for direct VTS (Visa Token Service) provisioning via iliad_network_tokenization. Requires Visa network onboarding — cannot be obtained by code. Unset ⇒ provider 'vts' returns a structured `_not_configured: true` envelope (the Stripe read adapter stays live via STRIPE_SECRET_KEY)." },
  { key: "AXIS_MDES_TOKEN_REQUESTOR_ID", required: false, type: "string", description: "Mastercard-issued Token Requestor ID for direct MDES (Mastercard Digital Enablement Service) provisioning via iliad_network_tokenization. Requires Mastercard network onboarding. Unset ⇒ provider 'mdes' returns a structured `_not_configured: true` envelope." },
  // Object storage (iliad_object_storage — AXIS-owned via Cloudflare R2)
  { key: "R2_ACCOUNT_ID", required: false, type: "string", description: "Cloudflare account ID; forms part of the R2 host (<account>.r2.cloudflarestorage.com). All four R2_* vars must be set for iliad_object_storage to issue signed URLs; otherwise the tool returns a structured `not_configured` envelope." },
  { key: "R2_ACCESS_KEY_ID", required: false, type: "string", description: "R2 API token access key. Use the 'Object Read & Write' template scoped to a single bucket so a compromised key cannot escalate." },
  { key: "R2_SECRET_ACCESS_KEY", required: false, type: "string", description: "R2 API token secret key (treat as a password). Pairs with R2_ACCESS_KEY_ID." },
  { key: "R2_BUCKET", required: false, type: "string", description: "Bucket name iliad_object_storage signs URLs against. Keys inside the bucket are prefixed with accounts/<account_id>/ for per-tenant isolation." },
];

export interface ValidationError {
  key: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  resolved: Record<string, string>;
}

/**
 * Validate all environment variables against the spec.
 * Returns resolved values (with defaults applied) and any errors.
 */
export function validateEnv(
  env: Record<string, string | undefined> = process.env,
): ValidationResult {
  const errors: ValidationError[] = [];
  const resolved: Record<string, string> = {};

  for (const spec of ENV_SPEC) {
    const raw = env[spec.key];

    if (raw === undefined || raw === "") {
      if (spec.required) {
        errors.push({ key: spec.key, message: `Required environment variable ${spec.key} is not set. ${spec.description}` });
        continue;
      }
      // Apply default
      resolved[spec.key] = spec.default ?? "";
      continue;
    }

    // Type validation
    if (spec.type === "number") {
      const num = Number(raw);
      if (isNaN(num) || !isFinite(num)) {
        errors.push({ key: spec.key, message: `${spec.key} must be a valid number, got "${raw}"` });
        continue;
      }
      if (num < 0) {
        errors.push({ key: spec.key, message: `${spec.key} must be non-negative, got ${num}` });
        continue;
      }
    }

    if (spec.type === "boolean") {
      if (!["true", "false", "1", "0"].includes(raw.toLowerCase())) {
        errors.push({ key: spec.key, message: `${spec.key} must be true/false/1/0, got "${raw}"` });
        continue;
      }
    }

    resolved[spec.key] = raw;
  }

  return { valid: errors.length === 0, errors, resolved };
}

/**
 * Validate and throw on errors. For use at server startup.
 */
export function requireValidEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const result = validateEnv(env);
  if (!result.valid) {
    const messages = result.errors.map((e) => `  - ${e.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${messages}`);
  }
  return result.resolved;
}

/**
 * Generate a .env.example string from the spec.
 */
export function generateEnvExample(): string {
  const lines: string[] = [
    "# ─── Axis' Iliad API — Environment Variables ───────────────",
    "# Copy this file to .env and customize as needed.",
    "",
  ];

  for (const spec of ENV_SPEC) {
    lines.push(`# ${spec.description}`);
    /* v8 ignore next — V8 quirk: both required/optional ternary paths tested */
    const marker = spec.required ? "(required)" : `(default: ${spec.default ?? '""'})`;
    lines.push(`# ${marker}`);
    lines.push(`${spec.key}=${spec.default ?? ""}`);
    lines.push("");
  }

  return lines.join("\n");
}
