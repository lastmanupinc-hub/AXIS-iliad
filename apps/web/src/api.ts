// Base-URL resolution lives in config.ts — the single source for API origins
// and public-surface counts (WO-F5). Re-exported here so existing imports keep
// working.
import { API_BASE } from "./config.ts";
export { API_BASE };

// ─── Snapshot types ─────────────────────────────────────────────

export interface SnapshotPayload {
  input_method: string;
  manifest: {
    project_name: string;
    project_type: string;
    frameworks: string[];
    goals: string[];
    requested_outputs: string[];
  };
  files: Array<{ path: string; content: string; size: number }>;
}

export interface SnapshotResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
  context_map: ContextMap;
  repo_profile: RepoProfile;
  generated_files: Array<{ path: string; program: string; description: string }>;
}

export interface ContextMap {
  version: string;
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  project_identity: {
    name: string;
    type: string;
    primary_language: string;
    description: string | null;
  };
  structure: {
    total_files: number;
    total_directories: number;
    total_loc: number;
    file_tree_summary: Array<{
      path: string;
      language: string | null;
      loc: number;
      role: string;
    }>;
    top_level_layout: Array<{ name: string; purpose: string; file_count: number }>;
  };
  detection: {
    languages: Array<{ name: string; file_count: number; loc: number; loc_percent: number }>;
    frameworks: Array<{ name: string; confidence: number; evidence?: string[] }>;
    build_tools: string[];
    test_frameworks: string[];
    package_managers: string[];
    ci_platform: string | null;
    deployment_target: string | null;
  };
  dependency_graph: {
    external_dependencies: Array<{ name: string; version: string; type: string }>;
    internal_imports: Array<{ source: string; target: string; specifier: string }>;
    hotspots: Array<{ path: string; inbound_count: number; outbound_count: number; risk_score: number }>;
  };
  entry_points: Array<{ path: string; type: string; description: string }>;
  routes: Array<{ path: string; method: string; source_file: string }>;
  architecture_signals: {
    patterns_detected: string[];
    layer_boundaries: Array<{ layer: string; directories: string[] }>;
    separation_score: number;
  };
  ai_context: {
    project_summary: string;
    key_abstractions: string[];
    conventions: string[];
    warnings: string[];
  };
}

export interface RepoProfile {
  version: string;
  project: { name: string; type: string; primary_language: string };
  structure_summary: {
    total_files: number;
    total_directories: number;
    total_loc: number;
    top_level_dirs: Array<{ name: string; purpose: string; file_count: number }>;
  };
  health: {
    has_readme: boolean;
    has_tests: boolean;
    test_file_count: number;
    has_ci: boolean;
    has_lockfile: boolean;
    has_typescript: boolean;
    has_linter: boolean;
    has_formatter: boolean;
    dependency_count: number;
    dev_dependency_count: number;
    architecture_patterns: string[];
    separation_score: number;
  };
  goals: { objectives: string[]; requested_outputs: string[] } | null;
}

export interface GeneratedFile {
  path: string;
  content: string;
  content_type: string;
  program: string;
  description: string;
}

export interface GeneratedFilesResponse {
  snapshot_id: string;
  project_id: string;
  generated_at: string;
  files: GeneratedFile[];
  skipped: Array<{ path: string; reason: string }>;
}

// ─── Billing types ──────────────────────────────────────────────

export type BillingTier = "free" | "paid" | "suite";

export interface Account {
  account_id: string;
  name: string;
  email: string;
  tier: BillingTier;
  created_at: string;
}

export interface ApiKeyInfo {
  key_id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
  prefix: string;
}

export interface UsageSummary {
  program: string;
  total_runs: number;
  total_generators: number;
  total_input_files: number;
  total_input_bytes: number;
}

export interface ApiEndpointUsage {
  method: string;
  path: string;
  calls: number;
  last_called_at: string;
}

export interface ApiStatusUsage {
  status_bucket: string;
  calls: number;
}

export interface MyAnalyticsSummary {
  account_id: string;
  tier: BillingTier;
  since: string;
  programs: UsageSummary[];
  api_calls: {
    account_id: string;
    since: string;
    total_calls: number;
    calls_last_24h: number;
    calls_last_7d: number;
    by_endpoint: ApiEndpointUsage[];
    by_status: ApiStatusUsage[];
  };
  totals: {
    runs: number;
    generators: number;
    input_files: number;
    input_bytes: number;
    api_calls: number;
  };
}

// ─── Funnel / Plan types ────────────────────────────────────────

export interface PlanDefinition {
  id: "free" | "starter" | "pro" | "growth" | "enterprise";
  name: string;
  tagline: string;
  price_monthly_cents: number;
  price_annual_cents: number;
  highlights: string[];
}

export interface PlanFeature {
  name: string;
  free: string | boolean | number;
  starter: string | boolean | number;
  pro: string | boolean | number;
  growth: string | boolean | number;
  enterprise: string | boolean | number;
}

export interface UpgradePrompt {
  trigger: string;
  current_tier: BillingTier;
  recommended_tier: BillingTier;
  headline: string;
  body: string;
  cta_label: string;
  cta_url: string;
  features_unlocked: string[];
  urgency: "low" | "medium" | "high";
}

// ─── Admin / Analytics types ───────────────────────────────────

export interface AdminStats {
  total_accounts: number;
  total_api_keys: number;
  total_snapshots: number;
  total_usage_records: number;
  accounts_by_tier: Record<string, number>;
}

export interface AdminAccountSummary {
  account_id: string;
  name: string;
  email: string;
  tier: BillingTier;
  /** Starter/Pro both show as tier==="paid" — disambiguates which real plan
   *  a "paid"-tier account is on (H-Phase-A cycle 2). */
  paid_plan_id: string | null;
  created_at: string;
}

export interface AdminAccountsResponse {
  accounts: AdminAccountSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminActivityEvent {
  event_id: string;
  account_id: string;
  event_type: string;
  stage: string;
  metadata: unknown;
  created_at: string;
}

export interface AdminActivityResponse {
  events: AdminActivityEvent[];
  count: number;
}

export interface McpUsageResponse {
  windows: {
    total: number;
    last_24h: number;
    last_7d: number;
    last_30d: number;
  };
  summary: {
    since: string;
    window_days: number;
    total_calls: number;
    unique_accounts: number;
    anonymous_calls: number;
    by_tool: Record<string, number>;
    by_source: Record<string, number>;
    by_probe_class: Record<string, number>;
  };
  new_vs_returning: {
    window_days: number;
    new_accounts: number;
    returning_accounts: number;
  };
}

export interface FunnelMetrics {
  total_accounts: number;
  total_seats: number;
  conversion_rate: number;
  activation_rate: number;
  by_tier: Record<string, number>;
  by_stage: Record<string, number>;
  events_last_24h: number;
  events_last_7d: number;
}

// ─── Fetch helpers ──────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  errorCode: string;
  extra: Record<string, unknown>;

  constructor(message: string, status: number, errorCode: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.extra = extra;
  }
}

// Once a session is established, the raw key in localStorage is replaced by this non-sensitive
// marker: the HttpOnly axis_session cookie (credentials:"include") carries auth, so the key is
// no longer XSS-readable. A legacy raw key (pre-cutover) is still sent as a bearer fallback
// until migrateLegacyKey() converts it to a cookie and swaps in the marker.
const SESSION_MARKER = "__cookie_session__";

function authHeaders(): Record<string, string> {
  const v = localStorage.getItem("axis_api_key");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (v && v !== SESSION_MARKER) headers["Authorization"] = `Bearer ${v}`;
  return headers;
}

/** Record that a session is active without persisting the raw key. Use when the HttpOnly
 *  cookie is already set (e.g. right after the OAuth exchange, which sets it server-side). */
export function markAuthed(): void {
  localStorage.setItem("axis_api_key", SESSION_MARKER);
}

/** Exchange a raw api_key for the HttpOnly session cookie, then keep only the marker in
 *  localStorage (never the raw key). Used by the create-account / paste-key login flows. */
export async function establishSession(apiKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Session setup failed: ${res.status}`);
  markAuthed();
}

/** One-time migration: a pre-cutover raw key in localStorage is exchanged for a cookie and
 *  replaced by the marker, so the key stops being persisted. No-op if already migrated. */
export async function migrateLegacyKey(): Promise<void> {
  const v = localStorage.getItem("axis_api_key");
  if (v && v !== SESSION_MARKER) {
    try {
      await establishSession(v);
    } catch {
      // Leave the legacy key as a bearer fallback if the cookie can't be set.
    }
  }
}

/** Trade a one-time OAuth code (from the callback redirect) for the API key. */
export async function exchangeOAuthCode(code: string): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    credentials: "include", // accept the Set-Cookie (axis_session) from the exchange
  });
  if (!res.ok) throw new Error(`OAuth exchange failed: ${res.status}`);
  const data = (await res.json()) as { api_key?: string };
  if (!data.api_key) throw new Error("OAuth exchange returned no api_key");
  return data.api_key;
}

/** Clear the HttpOnly axis_session cookie server-side (JS can't clear it itself). Best-effort. */
export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${API_BASE}/v1/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    // ignore — the caller clears localStorage regardless
  }
}

// ─── Post-auth return-to (WO-P2) ─────────────────────────────────
// A login gate — an auth-only page hit directly, an auth-only nav click while
// signed out, or a page-agnostic "sign up" nudge — records the hash it fired
// on so sign-in can hand the user back to what they were doing instead of
// always landing on Account. GitHub/Google OAuth is a full top-level round
// trip through the provider and back (plus a hard reload on return — see
// AccountPage.tsx's finishAuthAndReload), so in-memory state isn't enough;
// sessionStorage survives that round trip for the life of the tab without
// leaking across tabs/sessions the way localStorage would.
const RETURN_TO_KEY = "axis_return_to";

/** Remember the hash (no leading "#") to return to once sign-in completes. */
export function rememberReturnTo(hash: string): void {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, hash);
  } catch {
    // Storage unavailable (private mode, quota) — sign-in falls back to its
    // default landing page instead; not fatal.
  }
}

/** Read and clear the pending return-to hash (one-time use). Null if none was recorded. */
export function consumeReturnTo(): string | null {
  try {
    const hash = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return hash;
  } catch {
    return null;
  }
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  /**
   * Non-2xx statuses whose body is still the documented success shape —
   * parsed and returned instead of thrown (e.g. /v1/health/ready answers 503
   * with the same JSON body when not ready; a status page needs that body).
   */
  allowStatuses?: number[];
}

/** Human fallback copy per HTTP status — the ApiError message whenever the
 *  server's response carries no structured `{error}` field (WO-F4 hardening:
 *  raw server bodies never headline; see apiErrorDetails for the disclosure). */
function humanMessage(status: number): string {
  switch (status) {
    case 400: return "That request was invalid — adjust the input and try again.";
    case 401: return "Sign in to continue.";
    case 402: return "This action needs a plan upgrade or credits.";
    case 403: return "You don't have access to that.";
    case 404: return "Not found — it may have been moved or deleted.";
    case 408: return "The server took too long to respond — try again.";
    case 409: return "That conflicts with the current state — refresh and retry.";
    case 413: return "That upload is too large for the current plan.";
    case 422: return "The server couldn't process that input.";
    case 429: return "Rate limit reached — wait a moment and try again.";
    default:
      if (status >= 500) return "The server hit an unexpected error — try again shortly.";
      return `The request failed (HTTP ${status}).`;
  }
}

/** Raw server response preserved by the error mapper for a collapsed
 *  "details" disclosure (e.g. <Callout details={apiErrorDetails(err)}>).
 *  Never rendered as the headline message. */
export function apiErrorDetails(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const d = err.extra["details"];
  return typeof d === "string" && d.length > 0 ? d : null;
}

// ─── MPP 402 pricing disclosure (WO-P4) ──────────────────────────
// Every buildPaymentRequiredPayload() response (packages/mpp) carries a
// `pricing` block with BOTH tiers regardless of the caller's X-Agent-Mode,
// plus (on the pro-program-block paths) a `price_per_call` string that DOES
// reflect the mode actually sent. Reading both off an ApiError lets a
// lite-mode toggle visibly change the price the UI shows.

export interface MppPricingOption {
  amount_cents: number;
  currency: string;
  description: string;
}

export interface MppPricing {
  standard: MppPricingOption;
  lite: MppPricingOption;
}

/** Both pricing tiers from a 402/429 payload's `pricing` block, or null if
 *  absent/malformed (e.g. the error didn't come from a payment-required path). */
export function mppPricing(err: unknown): MppPricing | null {
  if (!(err instanceof ApiError)) return null;
  const p = err.extra["pricing"] as { standard?: Partial<MppPricingOption>; lite?: Partial<MppPricingOption> } | undefined;
  if (typeof p?.standard?.amount_cents !== "number" || typeof p?.lite?.amount_cents !== "number") return null;
  return { standard: p.standard as MppPricingOption, lite: p.lite as MppPricingOption };
}

/** The `price_per_call` field from a pro-program-block 402 — the price THIS
 *  request would actually be charged, reflecting the X-Agent-Mode header it
 *  sent (unlike `pricing`, which always lists both tiers). Absent on plain
 *  quota-exceeded 429s, which carry no per-call price. */
export function mppPricePerCall(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const v = err.extra["price_per_call"];
  return typeof v === "string" ? v : null;
}

async function fetchResponse(url: string, init?: FetchOptions): Promise<Response> {
  const controller = new AbortController();
  const { timeoutMs: customTimeout, allowStatuses, ...fetchInit } = init ?? {};
  const timeoutMs = customTimeout ?? 30_000;
  // v8 ignore next
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...fetchInit,
      headers: { ...authHeaders(), ...init?.headers },
      credentials: "include", // send the HttpOnly axis_session cookie (bearer header kept as fallback)
      signal: controller.signal,
    });
    if (!res.ok && !allowStatuses?.includes(res.status)) {
      // WO-F4 hardening: the ApiError message is either the API's structured
      // `error` field (the designed contract — UpsellModal, credit guards, and
      // 402 payload rendering key off it) or human copy mapped from the status.
      // A raw, unstructured server body (HTML error page, proxy text, stack
      // trace) NEVER becomes the message — it is preserved in extra.details
      // for an optional collapsed disclosure (apiErrorDetails + Callout).
      let msg = humanMessage(res.status);
      let errorCode = "";
      let extra: Record<string, unknown> = {};
      try {
        const body = await res.text();
        try {
          const json = JSON.parse(body);
          /* v8 ignore next */
          msg = json.error || msg;
          errorCode = json.error_code || "";
          const { error: _e, error_code: _c, ...rest } = json;
          extra = rest;
        } catch {
          /* v8 ignore next */
          if (body) extra = { details: body.slice(0, 500) };
        }
      } catch { /* empty body */ }
      throw new ApiError(msg, res.status, errorCode, extra);
    }
    return res;
  } catch (err) {
    /* v8 ignore next 2 — V8 quirk: AbortError tested but V8 won't credit */
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Request timed out", 0, "TIMEOUT");
    }
    if (err instanceof ApiError) throw err;
    // Network-level failure (server unreachable, CORS, DNS, SSL, connection reset, or
    // AbortController fired during body upload — Chrome throws TypeError instead of AbortError)
    if (err instanceof TypeError || (err instanceof DOMException && err.name !== "AbortError")) {
      console.error("[AXIS] Network error on", url, err);
      const detail = err instanceof Error ? err.message : String(err);
      throw new ApiError(
        `Request failed (${detail}). Check your connection and try again.`,
        0,
        "NETWORK_ERROR",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJSON<T>(url: string, init?: FetchOptions): Promise<T> {
  const res = await fetchResponse(url, init);
  return res.json() as Promise<T>;
}

/** Same error mapping as fetchJSON for endpoints that answer text (e.g. markdown). */
async function fetchText(url: string, init?: FetchOptions): Promise<string> {
  const res = await fetchResponse(url, init);
  return res.text();
}

// ─── Snapshot API ───────────────────────────────────────────────

export async function createSnapshot(
  payload: SnapshotPayload,
  preSerializedBody?: string,
  opts?: { lite?: boolean },
): Promise<SnapshotResponse> {
  const json = preSerializedBody ?? JSON.stringify(payload);

  // Compress large payloads with gzip to stay under proxy body-size limits.
  // Render's nginx proxy may reject bodies >10 MB before they reach Node.js,
  // returning an error without CORS headers → browser shows "Failed to fetch".
  let body: BodyInit = json;
  const extraHeaders: Record<string, string> = {};
  // WO-P4: "lite mode" toggle — X-Agent-Mode: lite demonstrably lowers the
  // price_per_call a blocked pro-program request is quoted (handlers.ts
  // resolveAgentMode()); requests that don't hit a paid gate are unaffected.
  if (opts?.lite) extraHeaders["X-Agent-Mode"] = "lite";
  if (json.length > 1_000_000 && typeof CompressionStream !== "undefined") {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
    body = compressed;
    extraHeaders["Content-Encoding"] = "gzip";
    if (import.meta.env.DEV) console.log(`[AXIS] Compressed ${(json.length / 1_048_576).toFixed(1)} MB → ${(compressed.size / 1_048_576).toFixed(1)} MB`);
  }

  return fetchJSON<SnapshotResponse>("/v1/snapshots", {
    method: "POST",
    body,
    headers: extraHeaders,
    timeoutMs: 120_000,  // 2 min — large zip payloads need time to upload + process
  });
}

export async function getGeneratedFiles(projectId: string): Promise<GeneratedFilesResponse> {
  return fetchJSON<GeneratedFilesResponse>(`/v1/projects/${projectId}/generated-files`);
}

export async function getGeneratedFile(projectId: string, filePath: string): Promise<string> {
  // Routed through fetchText so failures get the hardened ApiError mapping
  // (human copy + extra.details) instead of throwing the raw body (WO-F4).
  return fetchText(`/v1/projects/${projectId}/generated-files/${encodeURIComponent(filePath)}`);
}

/**
 * WO-P7: `opts.outputs` maps straight onto the documented `ProgramRequest`
 * body shape every program endpoint accepts (`{snapshot_id, outputs?}` —
 * see openapi.ts) — omit it to let the server use that program's own
 * default output list. `opts.lite` mirrors createSnapshot/analyzeGitHubUrl's
 * X-Agent-Mode: lite pricing lever (only changes anything for paid
 * programs on a metered request; free-program runs are unaffected).
 */
export async function runProgram(
  endpoint: string,
  snapshotId: string,
  opts?: { lite?: boolean; outputs?: string[] },
): Promise<{ program: string; files: GeneratedFile[]; skipped?: Array<{ path: string; reason: string }> }> {
  return fetchJSON(`/v1/${endpoint}`, {
    method: "POST",
    body: JSON.stringify({
      snapshot_id: snapshotId,
      ...(opts?.outputs !== undefined ? { outputs: opts.outputs } : {}),
    }),
    ...(opts?.lite ? { headers: { "X-Agent-Mode": "lite" } } : {}),
  });
}

/**
 * WO-P4: `opts.token` is a one-off GitHub PAT for THIS request only — the
 * caller never persists it client-side (component state, not storage).
 * Omitting it lets the server fall back to the caller's stored token
 * automatically (GET /v1/account/github-token lists what's saved). See
 * createSnapshot for the `opts.lite` pricing note.
 */
export async function analyzeGitHubUrl(
  githubUrl: string,
  opts?: { token?: string; lite?: boolean },
): Promise<SnapshotResponse> {
  return fetchJSON<SnapshotResponse>("/v1/github/analyze", {
    method: "POST",
    body: JSON.stringify({ github_url: githubUrl, token: opts?.token }),
    ...(opts?.lite ? { headers: { "X-Agent-Mode": "lite" } } : {}),
    timeoutMs: 120_000,  // 2 min — GitHub clone + analysis takes time
  });
}

// ─── Programs catalog (WO-P4) ────────────────────────────────────
// GET /v1/programs — the live program → outputs map. AnalyzePage's output
// picker is driven by this instead of a hand-maintained list, so it can't
// drift from the generator registry the way the old hardcoded 45-output
// list did (it undercounted the real 20-program catalog and included two
// renamed outputs — see docs/web-plan/AUDIT-pages.md item 4).

export interface ProgramCatalogEntry {
  name: string;
  outputs: string[];
  generator_count: number;
}

export interface ProgramCatalogResponse {
  programs: ProgramCatalogEntry[];
  total_generators: number;
}

export async function getPrograms(): Promise<ProgramCatalogResponse> {
  return fetchJSON("/v1/programs");
}

// ─── Unified analyze endpoint (WO-P1 live demo / anon-safe quick analysis) ──
// Lighter-weight than createSnapshot/analyzeGitHubUrl: a summary `analysis`
// block + enriched `files[]` (path/program/description/placement/adoption_hint
// + inline content), no full context_map/repo_profile. Anonymous callers MUST
// restrict `programs` to the free set (config.ts FREE_PROGRAM_NAMES) or the
// server 401s (AUTH_REQUIRED) instead of defaulting to the full paid bundle.

export interface AnalyzeQuickRequest {
  github_url?: string;
  files?: Array<{ path: string; content: string; size?: number }>;
  programs?: string[];
  token?: string;
  /** Default true (server side) — set false to omit file content from the response. */
  inline_content?: boolean;
}

export interface AnalyzeQuickFile {
  path: string;
  program: string;
  description: string;
  placement: string;
  adoption_hint: string;
  content?: string;
}

export interface AnalyzeQuickResponse {
  snapshot_id: string;
  project_id: string;
  status: string;
  snapshot_summary: { pro_unlock: string };
  analysis: {
    project_name: string;
    language: string;
    frameworks: string[];
    file_count: number;
    routes_detected: number;
    domain_models_detected: number;
    separation_score: number;
  };
  files: AnalyzeQuickFile[];
  programs_run: number;
  total_files: number;
  next_steps: string[];
  github?: {
    url: string;
    owner: string;
    repo: string;
    ref: string;
    files_fetched: number;
    files_skipped: number;
    total_bytes: number;
  };
}

/** POST /v1/analyze — the unified one-call endpoint. Works anonymously as
 *  long as `programs` is restricted to the free set (otherwise 401/402). */
export async function analyzeQuick(req: AnalyzeQuickRequest): Promise<AnalyzeQuickResponse> {
  return fetchJSON<AnalyzeQuickResponse>("/v1/analyze", {
    method: "POST",
    body: JSON.stringify(req),
    timeoutMs: 120_000, // GitHub clone + analysis takes time
  });
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  return fetchJSON("/v1/health");
}

/** Liveness probe — is the API process responsive? */
export async function healthLive(): Promise<{ status: string }> {
  return fetchJSON("/v1/health/live");
}

export interface ReadinessResponse {
  status: "ready" | "not_ready" | string;
  checks?: {
    shutting_down: boolean;
    database: string;
    payment_rail: string;
  };
}

/** Readiness probe. The API answers 503 with the same JSON body when not
 *  ready — that body is returned (not thrown) so a status page can render it. */
export async function healthReady(): Promise<ReadinessResponse> {
  return fetchJSON("/v1/health/ready", { allowStatuses: [503] });
}

// ─── Public stats (social proof) ────────────────────────────────

export interface ApiStats {
  mcp_calls_today: number;
  mcp_calls_total: number;
  top_tools: Array<{ tool: string; count: number }>;
  process_started_at: string;
  date: string;
}

export async function getStats(): Promise<ApiStats> {
  return fetchJSON("/v1/stats");
}

// ─── Projects API (multi-project state, WO-F3) ──────────────────
// listProjects/listProjectSnapshots are typed against the WO-A1/WO-A2
// mini-specs (docs/web-plan/BUILD-PLAN.md §4) and become callable when those
// API work-orders land; getProjectContext is live today.

/** Compliance grade as WO-A1/WO-A2 may ship it: the bare letter ("A+".."D")
 *  or the full 8-check engine result. `complianceGradeLetter` normalizes. */
export type ComplianceGrade = string | { grade: string; score?: number };

export function complianceGradeLetter(grade: ComplianceGrade | null | undefined): string | null {
  if (grade == null) return null;
  return typeof grade === "string" ? grade : grade.grade;
}

export interface ProjectSnapshotSummary {
  snapshot_id: string;
  status: string;
  created_at: string;
  file_count: number;
  compliance_grade?: ComplianceGrade | null;
}

export interface ProjectSummary {
  project_id: string;
  name: string;
  github_url: string | null;
  created_at: string;
  latest_snapshot: ProjectSnapshotSummary | null;
  snapshot_count: number;
}

export interface ProjectsListResponse {
  projects: ProjectSummary[];
  total: number;
}

/** GET /v1/projects — the account's analyzed repos, newest first (WO-A1). */
export async function listProjects(opts?: { limit?: number; offset?: number }): Promise<ProjectsListResponse> {
  const params = new URLSearchParams();
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return fetchJSON(`/v1/projects${qs ? `?${qs}` : ""}`);
}

export interface ProjectSnapshotsResponse {
  project_id: string;
  snapshots: ProjectSnapshotSummary[];
  count: number;
}

/** GET /v1/projects/:id/snapshots — snapshot list, newest first (WO-A2). */
export async function listProjectSnapshots(projectId: string): Promise<ProjectSnapshotsResponse> {
  return fetchJSON(`/v1/projects/${encodeURIComponent(projectId)}/snapshots`);
}

export interface ProjectContextResponse {
  snapshot_id: string;
  context_map: ContextMap;
  repo_profile: RepoProfile;
}

/** GET /v1/projects/:id/context — latest snapshot's context map + repo
 *  profile. Server-side source of truth for restoring a project view. */
export async function getProjectContext(projectId: string): Promise<ProjectContextResponse> {
  return fetchJSON(`/v1/projects/${encodeURIComponent(projectId)}/context`);
}

export interface SnapshotDetail {
  snapshot_id: string;
  project_id: string;
  created_at: string;
  input_method: string;
  manifest: SnapshotPayload["manifest"];
  file_count: number;
  total_size_bytes: number;
  status: string;
  compliance_grade?: ComplianceGrade | null;
}

/** GET /v1/snapshots/:id — one snapshot's own metadata (as opposed to
 *  getProjectContext, which always resolves the project's LATEST snapshot). */
export async function getSnapshot(snapshotId: string): Promise<SnapshotDetail> {
  return fetchJSON(`/v1/snapshots/${encodeURIComponent(snapshotId)}`);
}

// ─── Snapshot & project deletion (WO-P5) ─────────────────────────

/** DELETE /v1/snapshots/:id — removes the snapshot and its generated-file
 *  versions/search index; the owning project and any sibling snapshots are
 *  untouched. Anonymous (no-owner) snapshots are deletable by anyone who
 *  knows the id, matching the read-side access rule (assertSnapshotAccess). */
export async function deleteSnapshot(snapshotId: string): Promise<{ deleted: boolean; snapshot_id: string }> {
  return fetchJSON(`/v1/snapshots/${encodeURIComponent(snapshotId)}`, { method: "DELETE" });
}

/** DELETE /v1/projects/:id — cascades every snapshot the project owns. */
export async function deleteProject(projectId: string): Promise<{ deleted: boolean; project_id: string; deleted_snapshots: number }> {
  return fetchJSON(`/v1/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
}

// ─── Project memory API (WO-P5) ──────────────────────────────────
// Per-project, server-side notes (decisions/conventions/evidence/goals).
// Requires an account-owned project: reading OR writing 401s while signed
// out, and 403s on an anonymous (no-owner) project even when signed in
// (re-analyze while authenticated to claim it) — see memory-handlers.ts.

export type MemoryKind = "decision" | "convention" | "evidence" | "goal";
export const MEMORY_KINDS: readonly MemoryKind[] = ["decision", "convention", "evidence", "goal"];

export interface MemoryEntry {
  id: string;
  project_id: string;
  account_id: string;
  kind: MemoryKind;
  content: string;
  source: string;
  created_at: string;
}

export interface MemoryListResponse {
  project_id: string;
  entries: MemoryEntry[];
  count: number;
  total: number;
}

/** GET /v1/projects/:id/memory?kind=&limit= */
export async function listProjectMemory(projectId: string, opts?: { kind?: MemoryKind; limit?: number }): Promise<MemoryListResponse> {
  const params = new URLSearchParams();
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return fetchJSON(`/v1/projects/${encodeURIComponent(projectId)}/memory${qs ? `?${qs}` : ""}`);
}

/** POST /v1/projects/:id/memory {kind, content, source?} — append-only. */
export async function addProjectMemory(
  projectId: string,
  entry: { kind: MemoryKind; content: string; source?: string },
): Promise<{ entry: MemoryEntry; total: number }> {
  return fetchJSON(`/v1/projects/${encodeURIComponent(projectId)}/memory`, {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

// ─── Version history & diff API ─────────────────────────────────

export interface GenerationVersionSummary {
  version_id: string;
  snapshot_id: string;
  version_number: number;
  program: string | null;
  file_count: number;
  created_at: string;
}

export interface GenerationVersion extends GenerationVersionSummary {
  files: Array<{ path: string; content: string }>;
}

export async function getSnapshotVersions(
  snapshotId: string,
): Promise<{ snapshot_id: string; versions: GenerationVersionSummary[]; count: number }> {
  return fetchJSON(`/v1/snapshots/${encodeURIComponent(snapshotId)}/versions`);
}

export async function getVersion(snapshotId: string, versionNumber: number): Promise<{ version: GenerationVersion }> {
  return fetchJSON(`/v1/snapshots/${encodeURIComponent(snapshotId)}/versions/${encodeURIComponent(String(versionNumber))}`);
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  old_content: string | null;
  new_content: string | null;
}

export interface VersionDiff {
  old_version: number;
  new_version: number;
  snapshot_id: string;
  files: FileDiff[];
  summary: { added: number; removed: number; modified: number; unchanged: number };
}

/** GET /v1/snapshots/:id/diff?old=N&new=M — diffing consumes a persistence
 *  credit on paid/suite tiers; a depleted balance throws an ApiError that
 *  `isPersistenceCreditsError` recognizes (render the credit-purchase CTA). */
export async function getDiff(snapshotId: string, oldVersion: number, newVersion: number): Promise<{ diff: VersionDiff }> {
  const params = new URLSearchParams({ old: String(oldVersion), new: String(newVersion) });
  return fetchJSON(`/v1/snapshots/${encodeURIComponent(snapshotId)}/diff?${params.toString()}`);
}

/** The 402 `persistence_credits_required` payload (`{error, reason}`) maps to
 *  ApiError message/extra — this guard is the stable check for the credit CTA. */
export function isPersistenceCreditsError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 402 &&
    // Real wire value for errorCode is uppercase (ErrorCode.PERSISTENCE_CREDITS_REQUIRED);
    // the lowercase form only ever appeared in the `message` field. Both are checked since
    // callers have relied on either historically.
    (err.message === "persistence_credits_required" || err.errorCode === "PERSISTENCE_CREDITS_REQUIRED")
  );
}

// ─── Usage timeseries (WO-A3 mini-spec) ─────────────────────────

export interface UsageBucket {
  date: string;
  runs: number;
  by_program: Record<string, number>;
  credits_spent: number;
}

export interface UsageTimeseriesResponse {
  buckets: UsageBucket[];
}

/** GET /v1/account/usage/timeseries?bucket=day&since_days=30 — per-account
 *  time-bucketed usage for graphs (ships behind WO-A3). */
export async function getUsageTimeseries(opts?: { bucket?: "day"; sinceDays?: number }): Promise<UsageTimeseriesResponse> {
  const bucket = opts?.bucket ?? "day";
  const sinceDays = Math.min(Math.max(opts?.sinceDays ?? 30, 1), 365);
  return fetchJSON(`/v1/account/usage/timeseries?bucket=${encodeURIComponent(bucket)}&since_days=${encodeURIComponent(String(sinceDays))}`);
}

// ─── Changelog (WO-A4 mini-spec) ────────────────────────────────

/** GET /v1/changelog — repo CHANGELOG.md as raw markdown (ships behind WO-A4). */
export async function getChangelog(): Promise<string> {
  return fetchText("/v1/changelog");
}

// ─── Account mutation (WO-A5 mini-spec) ─────────────────────────

export interface AccountUpdate {
  name?: string;
  email?: string;
}

/** PATCH /v1/account {name?, email?} — profile edit (ships behind WO-A5).
 *  Email changes are accepted with an audit-log entry (no verification yet);
 *  the server may attach a `note` saying so. */
export async function patchAccount(update: AccountUpdate): Promise<{ account: Account; note?: string }> {
  return fetchJSON("/v1/account", {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

/** DELETE /v1/account — cascades keys/webhooks/tokens/seats (ships behind WO-A5). */
export async function deleteAccount(): Promise<{ deleted: boolean }> {
  return fetchJSON("/v1/account", { method: "DELETE" });
}

// ─── MCP discovery API ──────────────────────────────────────────

export interface McpManifest {
  server: { name: string; slug: string; version: string; endpoint: string };
  tools: Array<{ name: string; description: string }>;
  _meta?: Record<string, unknown>;
}

/** GET /v1/mcp/server.json — the live MCP server manifest. */
export async function getMcpManifest(): Promise<McpManifest> {
  return fetchJSON("/v1/mcp/server.json");
}

export interface McpToolMatch {
  program: string;
  tier: string;
  score: number;
  capability_tags: string[];
  matching_artifacts: string[];
  all_artifacts: string[];
  example_call: string;
}

export interface McpToolSearchResponse {
  query: string | null;
  program_filter: string | null;
  total_matches: number;
  results: McpToolMatch[];
}

/** GET /v1/mcp/tools?q=&program= — searchable tool/program registry. */
export async function searchMcpTools(q?: string, program?: string): Promise<McpToolSearchResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (program) params.set("program", program);
  const qs = params.toString();
  return fetchJSON(`/v1/mcp/tools${qs ? `?${qs}` : ""}`);
}

// ─── Error-code catalog (H4.2) ───────────────────────────────────

export interface RestErrorCodeEntry {
  code: string;
  statuses: number[];
  retryable: "yes" | "no" | "depends";
  retry_guidance: string;
  description: string;
}

export interface McpErrorCategoryEntry {
  code: string;
  retryable: boolean;
  description: string;
}

export interface ErrorCodeCatalogResponse {
  rest_error_codes: RestErrorCodeEntry[];
  mcp_tool_error_categories: { note: string; categories: McpErrorCategoryEntry[] };
  envelope: { rest: string; mcp: string };
}

/** GET /v1/error-codes — the generated error-code catalog with retry guidance. */
export async function getErrorCodes(): Promise<ErrorCodeCatalogResponse> {
  return fetchJSON("/v1/error-codes");
}

// ─── Full MCP tool catalog (WO-P8) ───────────────────────────────
// The live per-tool registry — name, description, JSON-Schema args, output
// schema, annotations, and examples. Distinct from `searchMcpTools` above
// (which answers a different question: capability search across the 21
// *programs*, not the 38 individual MCP tools) and from `getMcpManifest`'s
// `tools[]` (deliberately name+description only — the external
// mcp-publisher registry format; see mcp-server.test.ts "each tool entry has
// name and description only"). Sourced from `POST /mcp {method:"tools/list"}`
// — the same fully-public JSON-RPC method any MCP client calls to discover
// tools — rather than a new REST endpoint, since it is already the
// canonical, tested source of this exact shape.

export interface McpToolSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpToolSchema {
  type?: string;
  properties?: Record<string, McpToolSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface McpToolExample {
  name: string;
  input?: unknown;
  output?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: McpToolSchema;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  examples?: McpToolExample[];
  /**
   * est_02: present with `estate: true` only on a tool that relays to a
   * sibling AXIS property. Rides the raw `tools/list` response verbatim —
   * McpPage.tsx is the one human surface that reads this directly (every
   * other human surface derives from the server-side McpToolCatalogEntry.estate
   * field instead). No live tool sets this yet.
   */
  _meta?: { estate?: boolean };
}

let mcpRpcId = 0;

/** POST /mcp {method:"tools/list"} — the full, live tool catalog (WO-P8). */
export async function listMcpTools(): Promise<McpToolDefinition[]> {
  const res = await fetchJSON<{
    result?: { tools?: McpToolDefinition[] };
    error?: { code: number; message: string };
  }>("/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: ++mcpRpcId, method: "tools/list" }),
  });
  if (res.error) throw new ApiError(res.error.message, 200, "MCP_RPC_ERROR");
  return res.result?.tools ?? [];
}

// ─── Install configs + intent probe (WO-P8) ──────────────────────

export interface InstallConfigResponse {
  platform: string;
  file: string;
  description: string;
  config: Record<string, unknown>;
  get_api_key: string;
  mcp_endpoint: string;
}

/** GET /v1/install/:platform — live per-platform MCP config snippet. */
export async function getInstallConfig(platform: string): Promise<InstallConfigResponse> {
  return fetchJSON(`/v1/install/${encodeURIComponent(platform)}`);
}

export interface ProbeIntentRecommendation {
  tool: string;
  reason: string;
  auth: boolean;
  pricing: string;
}

export interface ProbeIntentResponse {
  intent: string;
  probe_class?: string;
  recommendations: ProbeIntentRecommendation[];
  call_next: string;
  mcp_endpoint: string;
  install: string;
  for_agents: string;
}

/** POST /probe-intent {intent, focus_areas?} — public, no auth. The
 *  "describe your need -> tool suggestion" capability explorer. */
export async function probeIntent(intent: string, focusAreas?: string[]): Promise<ProbeIntentResponse> {
  return fetchJSON("/probe-intent", {
    method: "POST",
    body: JSON.stringify({ intent, ...(focusAreas?.length ? { focus_areas: focusAreas } : {}) }),
  });
}

// ─── Feedback / support tickets ─────────────────────────────────

export type FeedbackCategory = "bug" | "feature" | "praise" | "question" | "other";

export interface FeedbackInput {
  message: string;
  email?: string;
  category?: FeedbackCategory;
  rating?: number;
  page?: string;
}

export interface FeedbackResponse {
  ok: boolean;
  ticket_id: string;
  message: string;
  beta_notice: string;
}

/** POST /v1/feedback — public, no auth. Delivers a support ticket by email.
 *  Sent with credentials so a signed-in customer's ticket carries their
 *  account and tier without them having to type it. */
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResponse> {
  return fetchJSON("/v1/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── OpenAPI spec ───────────────────────────────────────────────

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, unknown>;
  components?: {
    securitySchemes?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
}

/** GET /openapi.json — the live API spec (drives the Docs explorer). */
export async function getOpenApiSpec(): Promise<OpenApiSpec> {
  return fetchJSON("/openapi.json");
}

// ─── Search API ─────────────────────────────────────────────────

export interface SearchResult {
  file_path: string;
  line_number: number;
  content: string;
  rank: number;
}

export interface SearchResponse {
  snapshot_id: string;
  query: string;
  total_indexed_lines: number;
  total_indexed_files: number;
  results: SearchResult[];
}

export async function searchQuery(snapshotId: string, query: string, limit = 50): Promise<SearchResponse> {
  return fetchJSON("/v1/search/query", {
    method: "POST",
    body: JSON.stringify({ snapshot_id: snapshotId, query, limit }),
  });
}

export async function indexSnapshot(snapshotId: string): Promise<{ snapshot_id: string; indexed_files: number; indexed_lines: number; indexed_symbols: number }> {
  return fetchJSON("/v1/search/index", {
    method: "POST",
    body: JSON.stringify({ snapshot_id: snapshotId }),
  });
}

export interface SymbolResult {
  file_path: string;
  symbol_name: string;
  symbol_type: string;
  line_number: number;
  parent: string | null;
}

export interface SymbolsResponse {
  snapshot_id: string;
  symbol_count: number;
  results: SymbolResult[];
}

export async function searchSymbols(
  snapshotId: string,
  opts?: { name?: string; type?: string; limit?: number },
): Promise<SymbolsResponse> {
  const params = new URLSearchParams();
  if (opts?.name) params.set("name", opts.name);
  if (opts?.type) params.set("type", opts.type);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return fetchJSON(`/v1/search/${encodeURIComponent(snapshotId)}/symbols${qs ? `?${qs}` : ""}`);
}

// ─── Export API ─────────────────────────────────────────────────

export function getExportUrl(projectId: string, program?: string): string {
  const base = `${API_BASE}/v1/projects/${projectId}/export`;
  return program ? `${base}?program=${encodeURIComponent(program)}` : base;
}

export async function downloadExport(projectId: string, program?: string): Promise<void> {
  const url = getExportUrl(projectId, program);
  const res = await fetch(url, { headers: authHeaders(), credentials: "include" });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="(.+)"/);
  a.download = match?.[1] ?? "axis-export.zip";
  a.click();
  // v8 ignore next
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/**
 * WO-P6: download ONE already-loaded generated file as its own file, with no
 * network round trip — `getGeneratedFiles` already returned `content` inline,
 * so re-fetching it via `GET .../generated-files/:path` (the raw-download
 * endpoint the API also exposes for direct/external use) would just refetch
 * bytes the caller already has. Mirrors downloadExport's anchor-click idiom.
 */
export function downloadGeneratedFile(file: Pick<GeneratedFile, "path" | "content" | "content_type">): void {
  const blob = new Blob([file.content], { type: file.content_type || "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.path.split("/").pop() || file.path;
  a.click();
  // v8 ignore next
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

// ─── Billing API ────────────────────────────────────────────────

export async function createAccount(name: string, email: string): Promise<{ account: Account; api_key: { key_id: string; raw_key: string; label: string } }> {
  return fetchJSON("/v1/accounts", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

export async function getAccount(): Promise<Account> {
  const data = await fetchJSON("/v1/account") as { account?: Account };
  return data.account ?? (data as unknown as Account);
}

/** Currently-enabled program names for this account (Settings' program
 *  toggles, WO-P12) — GET /v1/account also returns this, but getAccount()
 *  only surfaces the Account shape; this reads the same endpoint for the
 *  entitlements list instead of widening Account with a field that isn't
 *  really part of the account row. */
export async function getAccountEntitlements(): Promise<string[]> {
  const data = await fetchJSON("/v1/account") as { entitlements?: string[] };
  return data.entitlements ?? [];
}

/**
 * The specific marketed plan (starter/pro/growth/free) behind this account's
 * coarse BillingTier — Starter and Pro both show as tier==="paid", so the
 * UI needs this to label them correctly (H-Phase-A cycle 2: UsagePage was
 * showing every Pro subscriber as "Starter"). GET /v1/account already
 * returns it in usage_credits.plan_id (packages/snapshots's
 * resolvePlanForAccount); same read-the-same-endpoint-for-one-more-field
 * pattern as getAccountEntitlements above.
 */
export async function getAccountPlanId(): Promise<"free" | "starter" | "pro" | "growth" | "enterprise" | null> {
  const data = await fetchJSON("/v1/account") as { usage_credits?: { plan_id?: string } };
  return (data.usage_credits?.plan_id as "free" | "starter" | "pro" | "growth" | "enterprise" | undefined) ?? null;
}

export async function createApiKey(label: string): Promise<{ key_id: string; raw_key: string; label: string }> {
  return fetchJSON("/v1/account/keys", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function listApiKeys(): Promise<{ keys: ApiKeyInfo[] }> {
  return fetchJSON("/v1/account/keys");
}

export async function revokeApiKey(keyId: string): Promise<void> {
  await fetchJSON(`/v1/account/keys/${keyId}/revoke`, { method: "POST" });
}

// ─── GitHub token listing (WO-P4 read path) ──────────────────────
// GET /v1/account/github-token — masked listing only (token_prefix, never
// the raw secret). AnalyzePage uses this to tell the user which saved token
// (the most recently created valid one) will be applied automatically for
// private repos. Full CRUD (save/delete a token) is Settings' job (WO-P12).

export interface GitHubTokenSummary {
  token_id: string;
  label: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  valid: boolean;
}

export async function listGitHubTokens(): Promise<{ tokens: GitHubTokenSummary[] }> {
  return fetchJSON("/v1/account/github-token");
}

// ─── GitHub token CRUD (Settings, WO-P12) ───────────────────────

export async function saveGitHubToken(
  token: string,
  label?: string,
  scopes?: string[],
): Promise<{ token_id: string; label: string; token_prefix: string; scopes: string[]; created_at: string; message: string }> {
  return fetchJSON("/v1/account/github-token", {
    method: "POST",
    body: JSON.stringify({ token, label, scopes }),
  });
}

export async function deleteGitHubToken(tokenId: string): Promise<{ token_id: string; deleted: boolean }> {
  return fetchJSON(`/v1/account/github-token/${encodeURIComponent(tokenId)}`, { method: "DELETE" });
}

// ─── Webhooks (Settings, WO-P12) ─────────────────────────────────

export type WebhookEventType = "snapshot.created" | "snapshot.deleted" | "project.deleted" | "generation.completed";
export const VALID_WEBHOOK_EVENTS: readonly WebhookEventType[] = ["snapshot.created", "snapshot.deleted", "project.deleted", "generation.completed"];

export interface Webhook {
  webhook_id: string;
  account_id: string;
  url: string;
  events: WebhookEventType[];
  /** Redacted to "***" (or null) by the list endpoint — never the real secret. */
  secret: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  payload: string;
  status_code: number | null;
  response_body: string | null;
  success: boolean;
  attempted_at: string;
  attempt_number: number;
  next_retry_at: string | null;
  dead_lettered: boolean;
}

export async function createWebhook(url: string, events: WebhookEventType[], secret?: string): Promise<{ webhook: Webhook }> {
  return fetchJSON("/v1/account/webhooks", {
    method: "POST",
    body: JSON.stringify({ url, events, secret }),
  });
}

export async function listWebhooks(): Promise<{ webhooks: Webhook[]; count: number }> {
  return fetchJSON("/v1/account/webhooks");
}

export async function deleteWebhook(webhookId: string): Promise<{ deleted: boolean; webhook_id: string }> {
  return fetchJSON(`/v1/account/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" });
}

export async function toggleWebhook(webhookId: string, active: boolean): Promise<{ webhook_id: string; active: boolean }> {
  return fetchJSON(`/v1/account/webhooks/${encodeURIComponent(webhookId)}/toggle`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}

export async function getWebhookDeliveries(webhookId: string, limit = 20): Promise<{ deliveries: WebhookDelivery[]; count: number }> {
  return fetchJSON(`/v1/account/webhooks/${encodeURIComponent(webhookId)}/deliveries?limit=${limit}`);
}

// ─── Program entitlement toggles (Settings, WO-P12; paid/suite only) ──

export async function updateProgramEntitlements(opts: { enable?: string[]; disable?: string[] }): Promise<{ programs: string[] }> {
  return fetchJSON("/v1/account/programs", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export async function getUsage(): Promise<{ tier: BillingTier; monthly_snapshots: number; project_count: number; by_program: UsageSummary[] }> {
  const data = await fetchJSON("/v1/account/usage") as { tier: BillingTier; totals?: { runs: number }; programs?: UsageSummary[] };
  return {
    tier: data.tier,
    monthly_snapshots: data.totals?.runs ?? 0,
    project_count: data.programs?.length ?? 0,
    by_program: data.programs ?? [],
  };
}

export interface ResourceQuota {
  tier: BillingTier;
  snapshots_this_month: number;
  /** -1 = unlimited. */
  max_snapshots_per_month: number;
  project_count: number;
  /** -1 = unlimited. */
  max_projects: number;
  max_files_per_snapshot: number;
}

export interface QuotaResponse {
  rate_limit: { limit: number; remaining: number; count: number; reset_in_seconds: number; window_ms: number };
  authenticated: boolean;
  /** Present only for authenticated callers. */
  resource_quota?: ResourceQuota;
}

/** GET /v1/account/quota — rate-limit + resource quota (snapshots/projects this month vs. tier caps). */
export async function getQuota(): Promise<QuotaResponse> {
  return fetchJSON("/v1/account/quota");
}

export async function getMyAnalyticsSummary(sinceDays = 30, limit = 200): Promise<MyAnalyticsSummary> {
  const safeSince = Math.min(Math.max(sinceDays, 1), 365);
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return fetchJSON(`/v1/account/analytics/summary?since_days=${encodeURIComponent(String(safeSince))}&limit=${encodeURIComponent(String(safeLimit))}`);
}

export async function updateTier(tier: BillingTier): Promise<{ account: Account }> {
  return fetchJSON("/v1/account/tier", {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

// ─── Plans API ──────────────────────────────────────────────────

export async function getPlans(): Promise<{ plans: PlanDefinition[]; features: PlanFeature[] }> {
  return fetchJSON("/v1/plans");
}

export async function getUpgradePrompt(): Promise<{ prompt: UpgradePrompt | null }> {
  return fetchJSON("/v1/account/upgrade-prompt");
}

export async function dismissUpgradePrompt(): Promise<void> {
  await fetchJSON("/v1/account/upgrade-prompt/dismiss", { method: "POST" });
}

// ─── Credits API ────────────────────────────────────────────────

export interface CreditsInfo {
  account_id: string;
  tier: BillingTier;
  balance: number;
  credit_costs: Record<string, number>;
  credit_packs: Array<{ pack_id: string; credits: number; price_cents: number }>;
  ledger: Array<{ entry_id: string; delta: number; reason: string; created_at: string }>;
}

export async function getCredits(): Promise<CreditsInfo> {
  return fetchJSON("/v1/account/credits");
}

// ─── Credit-pack top-ups (paid, via PAI'D hosted checkout) ──────────
export interface CreditPack {
  pack_id: string;
  credits: number;
  price_cents: number;
}

export async function listCreditPacks(): Promise<{ packs: CreditPack[] }> {
  return fetchJSON("/v1/credits/packs");
}

export interface TopupSession {
  checkout_url: string;
  session_id: string;
  pack_id: string;
  credits: number;
  price_cents: number;
}

export async function createCreditTopup(packId: string): Promise<TopupSession> {
  return fetchJSON("/v1/credits/topup", {
    method: "POST",
    body: JSON.stringify({ pack_id: packId }),
  });
}

export interface CreditPurchase {
  purchase_id: string;
  pack_id: string;
  credits: number;
  price_cents: number;
  status: "pending" | "succeeded";
  created_at: string;
  succeeded_at: string | null;
}

export async function listMyCreditPurchases(): Promise<{ purchases: CreditPurchase[] }> {
  return fetchJSON("/v1/credits/purchases");
}

// ─── Seats API ──────────────────────────────────────────────────

export interface Seat {
  seat_id: string;
  email: string;
  role: string;
  accepted: boolean;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function listSeats(): Promise<{ seats: Seat[]; count: number; limit: number; remaining: number }> {
  return fetchJSON("/v1/account/seats");
}

export async function inviteSeat(email: string, role?: string): Promise<{ seat: Seat }> {
  return fetchJSON("/v1/account/seats", {
    method: "POST",
    body: JSON.stringify({ email, role: role ?? "member" }),
  });
}

export async function revokeSeat(seatId: string): Promise<void> {
  await fetchJSON(`/v1/account/seats/${seatId}/revoke`, { method: "POST" });
}

// ─── Funnel API ─────────────────────────────────────────────────

export async function getFunnelStatus(): Promise<{ account_id: string; tier: BillingTier; stage: string; recent_events: Array<{ event_type: string; stage: string; metadata: unknown; created_at: string }> }> {
  return fetchJSON("/v1/account/funnel");
}

export async function getFunnelMetrics(): Promise<{ metrics: FunnelMetrics }> {
  return fetchJSON("/v1/funnel/metrics");
}

export async function getAdminStats(): Promise<AdminStats> {
  return fetchJSON("/v1/admin/stats");
}

export async function getAdminAccounts(limit = 50, offset = 0): Promise<AdminAccountsResponse> {
  return fetchJSON(`/v1/admin/accounts?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`);
}

export async function getAdminActivity(limit = 50): Promise<AdminActivityResponse> {
  return fetchJSON(`/v1/admin/activity?limit=${encodeURIComponent(String(limit))}`);
}

export async function getMcpUsage(windowDays = 30): Promise<McpUsageResponse> {
  return fetchJSON(`/v1/admin/mcp-usage?window_days=${encodeURIComponent(String(windowDays))}`);
}

export interface AdminRevenue {
  generated_at: string;
  accounts: { total: number; free: number; paid: number; suite: number; new_24h: number; new_7d: number; new_30d: number };
  revenue: {
    /** Tier-count ESTIMATE — never conflate with settled_mrr_cents below. */
    estimated_mrr_cents: number;
    mrr_basis_cents: { starter: number; pro: number; suite: number };
    metered_overage_cents_this_month: number;
    active_subscriptions: number;
    /** SETTLED (WO-19): real money, trailing 30 days. Reads $0 until a payment actually settles. */
    settled_mrr_cents: number;
    settled_revenue_cents_all_time: number;
    revenue_by_tool: Array<{ tool: string; cents: number; calls: number }>;
    first_paid_call_at: string | null;
    paying_account_count: number;
    payment_conversion_rate: number;
  };
  funnel: { conversion_rate: number; activation_rate: number; by_stage: Record<string, number> };
  mcp_engagement: { window_days: number; total_calls: number; unique_accounts: number };
}

export async function getAdminRevenue(): Promise<AdminRevenue> {
  return fetchJSON("/v1/admin/revenue");
}

export async function trackAnalyticsEvent(
  eventType: string,
  metadata?: Record<string, unknown>,
  stage?: string,
): Promise<{ tracked: true; event_type: string; stage: string }> {
  return fetchJSON("/v1/account/analytics/events", {
    method: "POST",
    body: JSON.stringify({
      event_type: eventType,
      stage,
      metadata: metadata ?? {},
    }),
    timeoutMs: 10_000,
  });
}

// ─── Subscription / Checkout API ────────────────────────────────

export interface SubscriptionInfo {
  account_id: string;
  tier: BillingTier;
  has_active_subscription: boolean;
  active_subscription: {
    subscription_id: string;
    status: string;
    price_id?: string;
    variant_id?: string;
    current_period_start: string | null;
    current_period_end: string | null;
    card_brand: string | null;
    card_last_four: string | null;
    cancel_at: string | null;
  } | null;
  subscription_count: number;
}

export async function getSubscription(): Promise<SubscriptionInfo> {
  return fetchJSON("/v1/account/subscription");
}

export async function cancelSubscription(): Promise<{ subscription_id: string; status: string; message: string }> {
  return fetchJSON("/v1/account/subscription/cancel", { method: "POST" });
}

export interface TierChangeHistoryEntry {
  change_id: string;
  from_tier: BillingTier;
  to_tier: BillingTier;
  reason: string;
  proration_amount: number;
  created_at: string;
}

export interface BillingHistoryResponse {
  account_id: string;
  current_tier: BillingTier;
  history: TierChangeHistoryEntry[];
}

// H-Phase-A cycle 8: GET /v1/billing/history has a real handler (handleBillingHistory)
// and an OpenAPI entry but never had a web wrapper at all — no signed-in
// user could ever see their own tier-change history in the product.
// Wrapper only; no UI consumes this yet (a real, disclosed product/UX call,
// not a quick add — see HARDEN_POLISH_LOOP.md's cycle 8 ledger entry).
export async function getBillingHistory(): Promise<BillingHistoryResponse> {
  return fetchJSON("/v1/billing/history");
}

export type FleetReportResponse =
  | { ready: false; project_count: number; eligible_projects: number; reason: string }
  | { ready: true; project_count: number; eligible_projects: number; projects: string[]; files: GeneratedFile[] };

// H-Phase-A cycle 8: GET /v1/account/fleet is a paid/suite-tier-gated
// feature (403 TIER_REQUIRED on free) with a real handler but no web
// wrapper and zero UI references anywhere — a Pro/Growth customer paying
// for tier access has no way to discover or use a feature their
// subscription is supposed to unlock. Wrapper only; a real FleetPage.tsx is
// a genuine, non-trivial feature build, correctly a separate tracked unit
// rather than a drive-by fix here — see HARDEN_POLISH_LOOP.md's cycle 8
// ledger entry.
export async function getFleetReport(): Promise<FleetReportResponse> {
  return fetchJSON("/v1/account/fleet");
}

// ─── PAI'D Checkout API ─────────────────────────────────────────

export interface PaidConfig {
  configured: boolean;
}

export interface PaidSubscribeResponse {
  /** PAI'D's hosted checkout page — redirect the buyer here. */
  checkout_url: string;
  session_id: string;
  status: string;
}

export async function getPaidConfig(): Promise<PaidConfig> {
  return fetchJSON("/portal/api/paid/config");
}

export async function paidSubscribe(
  plan: "monthly" | "annual",
  email: string,
  idempotencyKey?: string,
  planId?: "starter" | "pro" | "growth",
): Promise<PaidSubscribeResponse> {
  return fetchJSON("/portal/api/subscribe", {
    method: "POST",
    body: JSON.stringify({
      plan,
      ...(planId ? { plan_id: planId } : {}),
      email,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    }),
  });
}

// ─── Web Research API (Firecrawl proxy) ─────────────────────────

export interface ScrapeResult {
  success: boolean;
  data?: {
    url: string;
    markdown: string;
    metadata: Record<string, unknown>;
  };
  cache?: { hit: boolean; age_seconds?: number; hit_count?: number; ttl_remaining_seconds?: number };
  error?: string;
}

export interface CrawlPage {
  url: string;
  markdown: string;
  metadata: Record<string, unknown>;
}

export interface CrawlResult {
  success: boolean;
  data?: {
    url: string;
    pages_crawled: number;
    pages: CrawlPage[];
  };
  cache?: { warmed_entries?: number };
  error?: string;
}

export async function scrapeUrl(
  url: string,
  opts?: { only_main_content?: boolean },
): Promise<ScrapeResult> {
  return fetchJSON("/v1/research/scrape", {
    method: "POST",
    body: JSON.stringify({ url, only_main_content: opts?.only_main_content ?? true }),
    timeoutMs: 60_000,
  });
}

export async function crawlDomain(url: string, limit = 10): Promise<CrawlResult> {
  return fetchJSON("/v1/research/crawl", {
    method: "POST",
    body: JSON.stringify({ url, limit }),
    timeoutMs: 120_000,
  });
}
