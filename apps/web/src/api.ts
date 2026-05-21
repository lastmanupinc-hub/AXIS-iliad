const PROD_API_BASE = "https://axis-api-6c7z.onrender.com";
const isLocalHost =
  typeof window === "undefined" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";
const API_BASE = import.meta.env.VITE_API_URL ?? (isLocalHost ? "" : PROD_API_BASE);

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

function authHeaders(): Record<string, string> {
  const key = localStorage.getItem("axis_api_key");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

async function fetchJSON<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const { timeoutMs: customTimeout, ...fetchInit } = init ?? {};
  const timeoutMs = customTimeout ?? 30_000;
  // v8 ignore next
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...fetchInit,
      headers: { ...authHeaders(), ...init?.headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      let msg = `${res.status}`;
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
          if (body) msg = body.slice(0, 200);
        }
      } catch { /* empty body */ }
      throw new ApiError(msg, res.status, errorCode, extra);
    }
    return res.json() as Promise<T>;
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

// ─── Snapshot API ───────────────────────────────────────────────

export async function createSnapshot(payload: SnapshotPayload, preSerializedBody?: string): Promise<SnapshotResponse> {
  const json = preSerializedBody ?? JSON.stringify(payload);

  // Compress large payloads with gzip to stay under proxy body-size limits.
  // Render's nginx proxy may reject bodies >10 MB before they reach Node.js,
  // returning an error without CORS headers → browser shows "Failed to fetch".
  let body: BodyInit = json;
  const extraHeaders: Record<string, string> = {};
  if (json.length > 1_000_000 && typeof CompressionStream !== "undefined") {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
    body = compressed;
    extraHeaders["Content-Encoding"] = "gzip";
    console.log(`[AXIS] Compressed ${(json.length / 1_048_576).toFixed(1)} MB → ${(compressed.size / 1_048_576).toFixed(1)} MB`);
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
  const res = await fetch(`${API_BASE}/v1/projects/${projectId}/generated-files/${encodeURIComponent(filePath)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.text();
}

export async function runProgram(
  endpoint: string,
  snapshotId: string,
): Promise<{ program: string; files: GeneratedFile[]; skipped?: Array<{ path: string; reason: string }> }> {
  return fetchJSON(`/v1/${endpoint}`, {
    method: "POST",
    body: JSON.stringify({ snapshot_id: snapshotId }),
  });
}

export async function analyzeGitHubUrl(githubUrl: string): Promise<SnapshotResponse> {
  return fetchJSON<SnapshotResponse>("/v1/github/analyze", {
    method: "POST",
    body: JSON.stringify({ github_url: githubUrl }),
    timeoutMs: 120_000,  // 2 min — GitHub clone + analysis takes time
  });
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  return fetchJSON("/v1/health");
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
  const res = await fetch(url, { headers: authHeaders() });
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

export async function getUsage(): Promise<{ tier: BillingTier; monthly_snapshots: number; project_count: number; by_program: UsageSummary[] }> {
  const data = await fetchJSON("/v1/account/usage") as { tier: BillingTier; totals?: { runs: number }; programs?: UsageSummary[] };
  return {
    tier: data.tier,
    monthly_snapshots: data.totals?.runs ?? 0,
    project_count: data.programs?.length ?? 0,
    by_program: data.programs ?? [],
  };
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

export async function createCheckout(
  planId: "starter" | "pro" | "growth",
  billingCycle: "monthly" | "annual" = "monthly",
): Promise<{ checkout_url: string; plan_id: string; tier?: string; billing_cycle?: string; session_id: string; price_id?: string; variant_id?: string }> {
  return fetchJSON("/v1/checkout", {
    method: "POST",
    body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }),
  });
}

export async function getSubscription(): Promise<SubscriptionInfo> {
  return fetchJSON("/v1/account/subscription");
}

export async function cancelSubscription(): Promise<{ subscription_id: string; status: string; message: string }> {
  return fetchJSON("/v1/account/subscription/cancel", { method: "POST" });
}
