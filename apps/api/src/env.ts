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
  { key: "RATE_LIMIT_MAX_AUTHENTICATED", required: false, type: "number", default: "120", description: "Max requests per window (authenticated, free tier)" },
  { key: "RATE_LIMIT_MAX_PAID", required: false, type: "number", default: "300", description: "Max requests per window (paid tier). Must exceed the free limit or the repeat-offender 429 stops offering an upgrade, since the upsell would buy no real headroom." },
  { key: "RATE_LIMIT_MAX_SUITE", required: false, type: "number", default: "600", description: "Max requests per window (suite tier)" },
  { key: "RATE_LIMIT_UPGRADE_PROMPT_AFTER", required: false, type: "number", default: "3", description: "Rate-limit violations from one network prefix (remembered 1h) before a 429 starts carrying tier-upgrade guidance" },
  { key: "TRUSTED_PROXY_HOPS", required: false, type: "number", default: "1", description: "Number of trusted reverse proxies in front of this service (Render fronts it with one LB). Used to pick the correct rightmost X-Forwarded-For entry as the real client IP for rate limiting." },
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
  { key: "XAI_API_KEY", required: false, type: "string", description: "API key for xAI's image generation (https://x.ai). Only consulted by the pitch program's slide-background operator path (scripts/pitch-backgrounds.mjs); without it, generateSlideBackground returns a structured not-configured error instead of calling out." },
  { key: "XAI_BASE_URL", required: false, type: "string", default: "https://api.x.ai/v1", description: "Override for the xAI API base URL. Only relevant with XAI_API_KEY set." },
  { key: "RESEND_API_KEY", required: false, type: "string", description: "API key for Resend email delivery (https://resend.com). Used by the internal welcome/upgrade/usage-alert pipeline in @axis/snapshots and by the agent-facing iliad_transactional_email MCP tool (proxy mode)." },
  { key: "RESEND_FROM_ADDRESS", required: false, type: "string", description: "Verified Resend sender address used as the From: header for iliad_transactional_email and customer feedback tickets. Must be a domain you've verified in the Resend dashboard. When unset, iliad_transactional_email returns a structured _not_configured envelope and POST /v1/feedback returns 503 rather than silently dropping the ticket." },
  { key: "SUPPORT_EMAIL", required: false, type: "string", default: "support@jonathanarvay.com", description: "Inbox that POST /v1/feedback delivers customer tickets to." },
  { key: "FEEDBACK_MAX_PER_HOUR", required: false, type: "number", default: "5", description: "Feedback submissions allowed per network prefix per hour before POST /v1/feedback returns 429." },
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
  // Sentry incident ingestion (app_32 — debug wired to real incidents). No
  // SENTRY_WEBHOOK_SECRET exists deliberately: webhook signatures verify
  // against each connection's OWN stored secret (sentry_tokens table), since
  // every user's Sentry integration signs with its own — there is no global one.
  { key: "SENTRY_API_BASE_URL", required: false, type: "string", default: "https://sentry.io/api/0", description: "Base URL for outbound Sentry REST reads (issue + latest event hydration). Override for self-hosted Sentry. When unreachable, the debug watcher returns sentry_fetch_failed and opens no PR — never a fabricated incident." },
  // Scheduled Watch substrate (infra_04)
  { key: "AXIS_WATCH_POLL_CRON", required: false, type: "string", default: "*/15 * * * *", description: "Cron for the poll tick that fans out scheduled_pull watch jobs for poll-driven products. Only consulted while POLL_PRODUCTS (watch-poll-tick.ts) is non-empty; with the set empty the scheduler self-disables and this value is inert." },
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

  // R3.2: the ~34 vars below were consumed via process.env in apps/api/src but
  // never declared here (only 3 of them enumerated in the original ENV_SPEC/
  // R2.3 pass) -- validateEnv/.env.example both understated the real config
  // surface. counts-consistency.test.ts's "every process.env key read is
  // declared" test now fails if a new one is added without a matching entry.

  // Ops alerting (alerting.ts) — the whole evaluator no-ops without ALERT_WEBHOOK_URL.
  { key: "ALERT_WEBHOOK_URL", required: false, type: "string", description: "Slack/webhook URL the alerting evaluator posts to. Unset ⇒ startAlerting() no-ops entirely (no timer, no evaluation) — alerting is opt-in." },
  { key: "ALERT_EVAL_INTERVAL_MS", required: false, type: "number", default: "60000", description: "How often the alert evaluator checks thresholds. Floored at 10000ms regardless of a lower override." },
  { key: "ALERT_REALERT_MS", required: false, type: "number", default: "900000", description: "Minimum gap between repeat alerts for the same condition, to avoid paging on every evaluation while a problem persists." },
  { key: "ALERT_ERROR_RATE_PCT", required: false, type: "number", default: "5", description: "Error-rate percentage threshold that triggers an alert." },
  { key: "ALERT_MIN_SAMPLE", required: false, type: "number", default: "20", description: "Minimum request sample size before the error-rate threshold is evaluated, so a handful of early failures can't page on statistically meaningless data." },

  // Self-serve entitlements + anonymous provisioning (billing.ts, anon-frontdoor.ts)
  { key: "AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS", required: false, type: "boolean", default: "false", description: "Deny-by-default gate on self-serve tier/credit changes (POST /v1/account/tier and similar). Production leaves this false — upgrades must go through PAI'D checkout; flipping it true re-enables the self-serve path, mainly for local/staging testing." },
  { key: "AXIS_ANON_PROVISION_FRONTDOOR", required: false, type: "boolean", default: "false", description: "Feature flag: turns an anonymous caller's auth error into a provisioning-challenge response instead of a plain 401. Default off." },

  // MCP / commerce runtime (mcp-runtime.ts, mcp-tool-impls.ts)
  { key: "AXIS_MCP_INBAND_SETTLEMENT", required: false, type: "boolean", default: "true", description: "H1: collect payment in-band on the MCP tool-call surface (an over-quota agent's 402 can be settled via an X-Payment retry on the same call). Degrades to the existing 402-negotiation error if the payment rail isn't configured." },
  { key: "AXIS_PAYMENT_PROBE_ENABLED", required: false, type: "boolean", default: "true", description: "Enables the payment-capability self-probe path in mcp-tool-impls.ts. Set to \"false\" to disable it." },
  { key: "AXIS_FREE_TRIAL_STARTED_AT", required: false, type: "string", description: "ISO-8601 timestamp opening a 7-day free-trial window (every program/tool free, no payment gate anywhere — see packages/snapshots/src/trial-mode.ts). Owner sets this once to start the trial; it ends automatically 7 days later, no redeploy or manual flag flip needed. Unset or unparseable ⇒ trial off, normal billing — never fails open toward accidental free access." },

  // Code sandbox (code-sandbox.ts) — Docker-backed iliad_code_sandbox tool
  { key: "AXIS_CODE_SANDBOX_DISABLED", required: false, type: "string", description: "Set to \"1\" to force iliad_code_sandbox off (returns not-configured) even if Docker is reachable — an operator kill switch independent of Docker availability." },
  { key: "AXIS_CODE_SANDBOX_IMAGE", required: false, type: "string", description: "Docker image used to run submitted code in iliad_code_sandbox. Falls back to the tool's built-in default image when unset." },
  { key: "AXIS_SANDBOX_MAX_CONCURRENT", required: false, type: "number", default: "4", description: "Aggregate cap on concurrent sandbox runs across all callers — each run reserves host memory/CPU, so this bounds worst-case resource exhaustion." },

  // Local ML/media backends (llm-inference.ts, text-to-speech.ts, speech-to-text.ts)
  { key: "AXIS_LLM_MODEL_PATH", required: false, type: "string", description: "Path to a local GGUF chat model for iliad_llm_inference. Until set and the file exists, the tool returns a structured `_not_configured: true` envelope." },
  { key: "AXIS_PIPER_CLI_PATH", required: false, type: "string", description: "Path to the Piper text-to-speech CLI binary used by the local TTS backend. Unset ⇒ the tool reports not-configured rather than failing a spawn." },
  { key: "AXIS_PIPER_VOICE_DIR", required: false, type: "string", description: "Directory containing Piper voice model files. Paired with AXIS_PIPER_CLI_PATH." },
  { key: "AXIS_PIPER_DEFAULT_VOICE", required: false, type: "string", description: "Default Piper voice name used when a text-to-speech call doesn't specify one." },
  { key: "AXIS_WHISPER_CLI_PATH", required: false, type: "string", description: "Path to the Whisper speech-to-text CLI binary used by the local STT backend. Unset ⇒ the tool reports not-configured rather than failing a spawn." },
  { key: "AXIS_WHISPER_MODEL_PATH", required: false, type: "string", description: "Path to a local Whisper model file. Paired with AXIS_WHISPER_CLI_PATH." },

  // Large-body / MPP payment surcharge (mpp.ts)
  { key: "AXIS_LARGE_BODY_FREE_CAP_BYTES", required: false, type: "number", description: "Request body size (bytes) up to which an oversized /v1/analyze request stays free before the size-scaled surcharge kicks in." },
  { key: "AXIS_LARGE_BODY_HARD_CEILING_BYTES", required: false, type: "number", description: "Absolute request body size ceiling (bytes) above which a request is rejected outright regardless of willingness to pay the surcharge." },
  { key: "MPP_SECRET_KEY", required: false, type: "string", description: "HMAC secret binding MPP payment challenges to this server instance. Generate once and keep stable in production — rotating it invalidates in-flight challenges." },
  { key: "TEMPO_RECIPIENT_ADDRESS", required: false, type: "string", description: "Hex 0x address that receives Tempo/USDC on-chain payments. Enables the crypto payment rail in MPP negotiation when set; the rail is omitted from accepted_payment_schemes otherwise." },
  { key: "TEMPO_TESTNET", required: false, type: "boolean", default: "false", description: "Set to \"true\" to point Tempo/USDC settlement at the testnet contract address instead of mainnet." },

  // OAuth2 / MCP authorization server (oauth-server.ts, R0.2)
  { key: "JWT_PRIVATE_KEY", required: false, type: "string", description: "RSA private key (PEM) for signing MCP OAuth2 access tokens. Takes precedence over private-key.pem on disk. Falls back to an ephemeral generated keypair if unset — every restart then invalidates previously issued tokens, so this should be set in production (see R0.2)." },
  { key: "JWT_PUBLIC_KEY", required: false, type: "string", description: "RSA public key (PEM) matching JWT_PRIVATE_KEY, used to verify MCP OAuth2 tokens and serve the JWKS endpoint." },

  // Signed attestation (attestation.ts)
  { key: "AXIS_ATTESTATION_PRIVATE_KEY", required: false, type: "string", description: "Configured signing key for attestation responses. A present-but-malformed value is treated as an operator error (fails loudly) rather than silently falling back. Unset ⇒ a per-process ephemeral key is used, which does not survive a restart." },

  // PAI'D / wallet integration (paid-handlers.ts, credit-pack-handlers.ts, oauth.ts, cashier.ts)
  { key: "AXIS_WEB_URL", required: false, type: "string", default: "http://localhost:3000", description: "Base URL of the web dashboard, used to build redirect/callback links (OAuth login return, credit-pack purchase links) when a more specific override isn't set." },
  { key: "PAID_PUBLIC_APP_URL", required: false, type: "string", description: "Preferred public URL for PAI'D-facing redirect links; checked before falling back to AXIS_WEB_URL." },
  { key: "PAID_WALLET_OWNER_ACCOUNT_IDS", required: false, type: "string", description: "Comma-separated list of account IDs treated as PAI'D wallet owners for cashier/settlement purposes." },

  // Test-harness internals (not for manual configuration; documented so no
  // process.env read in this codebase is undocumented)
  { key: "VITEST", required: false, type: "boolean", description: "Set automatically by the vitest test runner (not meant to be set manually). Gates test-only code paths, e.g. skipping boot migrations and signal-handler registration during tests." },
  { key: "AXIS_ENABLE_TEST_LOGS", required: false, type: "boolean", default: "false", description: "When running under vitest (VITEST=true), runtime log output is suppressed by default; set to \"1\" to re-enable it for debugging a specific test run." },
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
