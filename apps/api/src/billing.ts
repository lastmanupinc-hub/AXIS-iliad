import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { sendJSON, readBody, sendError } from "./router.js";
import { ErrorCode, log } from "./logger.js";
import { getClientWindow, getClientIp } from "./rate-limiter.js";
import {
  resolveApiKey,
  createAccount,
  getAccount,
  getAccountByEmail,
  updateAccountProfile,
  deleteAccount,
  updateAccountTier,
  getAccountPaidPlanId,
  createApiKey,
  revokeApiKey,
  listApiKeys,
  enableProgram,
  disableProgram,
  getEntitlements,
  checkQuota,
  getUsageSummary,
  getUsageByDay,
  getApiCallSummary,
  recordUsage,
  isProgramEnabled,
  trackEvent,
  saveGitHubToken,
  getGitHubTokens,
  getGitHubTokenDecrypted,
  deleteGitHubToken,
  logTierChange,
  getTierHistory,
  calculateProration,
  sendWelcomeEmail,
  getPersistenceBalance,
  getPersistenceLedger,
  getPersistenceSpendByDay,
  addPersistenceCredits,
  applySuiteMonthlyGrant,
  getUsageCreditSummary,
  PERSISTENCE_CREDIT_COSTS,
  PERSISTENCE_CREDIT_PACKS,
  type Account,
  type BillingTier,
  ALL_PROGRAMS,
} from "@axis/snapshots";

// ─── Auth context attached to request ───────────────────────────

export interface AuthContext {
  account: Account | null;
  key_id: string | null;
  anonymous: boolean;
}

const AUTH_CONTEXT = new WeakMap<IncomingMessage, AuthContext>();

function normalizeBillingTierInput(raw: unknown): BillingTier | null {
  if (raw === "free") return "free";
  if (raw === "paid" || raw === "starter" || raw === "pro") return "paid";
  if (raw === "suite" || raw === "growth") return "suite";
  return null;
}

/** Name of the first-party session cookie set by POST /v1/auth/exchange. */
export const SESSION_COOKIE = "axis_session";

/**
 * Read the API key from the HttpOnly session cookie (first-party browser
 * sessions). Returns null when the cookie is absent or empty.
 */
function readSessionCookie(req: IncomingMessage): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    }
  }
  return null;
}

/**
 * Extract and resolve the API key from the Authorization header, X-Axis-Key, or
 * the first-party HttpOnly session cookie. Sets auth context on the request; does
 * NOT reject anonymous requests — callers check context.anonymous to enforce auth.
 */
export async function resolveAuth(req: IncomingMessage): Promise<AuthContext> {
  const cached = AUTH_CONTEXT.get(req);
  if (cached) return cached;

  const authHeader = req.headers.authorization;
  // MPP retries send the payment credential in Authorization; API key goes in X-Axis-Key
  const xAxisKey = req.headers["x-axis-key"];

  let rawKey: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7);
  } else if (typeof xAxisKey === "string" && xAxisKey) {
    rawKey = xAxisKey;
  } else {
    // First-party browser session (HttpOnly cookie set by /v1/auth/exchange).
    rawKey = readSessionCookie(req);
  }

  if (!rawKey) {
    const ctx: AuthContext = { account: null, key_id: null, anonymous: true };
    AUTH_CONTEXT.set(req, ctx);
    return ctx;
  }

  const resolved = await resolveApiKey(rawKey);
  if (!resolved) {
    // Key was provided but is invalid/revoked — mark as invalid, not anonymous
    const ctx: AuthContext = { account: null, key_id: null, anonymous: false };
    AUTH_CONTEXT.set(req, ctx);
    return ctx;
  }

  const ctx: AuthContext = {
    account: resolved.account,
    key_id: resolved.apiKey.key_id,
    anonymous: false,
  };
  AUTH_CONTEXT.set(req, ctx);
  return ctx;
}

/**
 * Require a valid API key. Returns 401 if anonymous.
 * Returns the auth context if authenticated, or null (and sends error) if not.
 */
export async function requireAuth(req: IncomingMessage, res: ServerResponse): Promise<AuthContext | null> {
  const ctx = await resolveAuth(req);
  if (ctx.anonymous || !ctx.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required. Include Authorization: Bearer <api_key>");
    return null;
  }
  return ctx;
}

/**
 * Constant-time secret comparison. Hashes both sides to a fixed length first
 * (timingSafeEqual requires equal-length buffers) so neither length nor content
 * leaks via comparison timing. Use for all high-privilege key checks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** True when the caller presented the ADMIN_API_KEY (owner/admin gate). */
function isAdminCaller(req: IncomingMessage): boolean {
  const ownerKey = process.env.ADMIN_API_KEY;
  if (!ownerKey) return false;

  const authHeader = req.headers.authorization;
  const xAxisKey = req.headers["x-axis-key"];

  let rawKey: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    rawKey = authHeader.slice(7);
  } else if (typeof xAxisKey === "string" && xAxisKey) {
    rawKey = xAxisKey;
  }

  return rawKey !== null && constantTimeEqual(rawKey, ownerKey);
}

/**
 * Deny-by-default gate for self-serve entitlement grants (tier upgrades and
 * persistence-credit minting). Allowed only when:
 *  - AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS === "true" (explicit dev/demo opt-in), or
 *  - the flag is unset AND we are running under tests (NODE_ENV=test / VITEST),
 *    so suites can keep using self-upgrade as a fixture helper.
 * Any other explicit value of the flag (including "false") denies.
 */
function selfServeEntitlementsAllowed(): boolean {
  const flag = process.env.AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS;
  if (flag !== undefined && flag !== "") return flag === "true";
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

const TIER_RANK: Record<BillingTier, number> = { free: 0, paid: 1, suite: 2 };

// ─── Billing API Handlers ───────────────────────────────────────

/** POST /v1/accounts — create a new account */
export async function handleCreateAccount(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    /* v8 ignore start — V8 quirk: bad JSON tested but V8 won't credit */
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
    /* v8 ignore stop */
  }

  /* v8 ignore next — V8 quirk on body property access after try/catch */
  const name = body.name as string | undefined;
  const email = body.email as string | undefined;
  const tier = normalizeBillingTierInput(body.tier ?? "free");

  if (!name || typeof name !== "string" || !email || typeof email !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "name and email are required (both must be strings)");
    return;
  }

  if (!tier) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "tier must be free, paid, or suite");
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email) || email.length > 254) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid email address");
    return;
  }

  // Validate name length
  if (name.length > 200) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Name must be 200 characters or fewer");
    return;
  }

  // Check for duplicate email
  const existing = await getAccountByEmail(email);
  if (existing) {
    sendError(res, 409, ErrorCode.CONFLICT, "An account with this email already exists");
    return;
  }

  // Deny-by-default: this endpoint is public and unauthenticated, so creating
  // an account directly at a paid tier would sidestep the payment gate on
  // POST /v1/account/tier entirely. Only the admin key or an explicit
  // AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true opt-in may mint paid/suite
  // accounts without payment; everyone else starts free and upgrades through
  // checkout.
  if (tier !== "free" && !isAdminCaller(req) && !selfServeEntitlementsAllowed()) {
    const paymentMessage = `Creating an account at the ${tier} tier requires payment. Create a free account, then pick a plan at https://iliad.trustfabric.ai/#plans (PAI'D hosted checkout).`;
    sendError(
      res, 402, ErrorCode.PAYMENT_REQUIRED,
      paymentMessage,
      {
        // PAI'D is the only checkout path — the legacy Stripe-direct
        // /v1/checkout endpoint was removed (H-Phase-A cycle 11) and must
        // not be advertised.
        checkout_endpoint: "https://iliad.trustfabric.ai/#plans",
        plans_url: "https://iliad.trustfabric.ai/#plans",
        // H2.5: additive canonical fields alongside the pair above.
        message: paymentMessage,
        upgrade_url: "https://iliad.trustfabric.ai/#plans",
        requested_tier: tier,
      },
    );
    return;
  }

  const account = await createAccount(name, email, tier);

  // Auto-generate an API key for the new account
  const { apiKey, rawKey } = await createApiKey(account.account_id, "default");

  // Track signup funnel event. H-Phase-A cycle 14: analytics-only, must
  // never sit between the committed account+key and the ONE response that
  // ever shows rawKey — an unguarded throw here would orphan the account
  // (created, but the caller never sees their key, and can't retry signup
  // with the same email since it's already taken).
  void trackEvent(account.account_id, "account_created", "signup", { tier, source: "api" }).catch(() => {});

  // Send welcome email (fire-and-forget — log failures for observability)
  sendWelcomeEmail(email, name, tier).catch((err: unknown) => {
    log("warn", "welcome-email-failed", { email, error: err instanceof Error ? err.message : String(err) });
  });

  sendJSON(res, 201, {
    account,
    api_key: {
      key_id: apiKey.key_id,
      raw_key: rawKey,
      label: apiKey.label,
      created_at: apiKey.created_at,
    },
    message: "Save your API key — it will not be shown again.",
  });
}

/** GET /v1/account — get current account info (requires auth) */
export async function handleGetAccount(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const quota = await checkQuota(ctx.account!.account_id);
  const entitlements = await getEntitlements(ctx.account!.account_id);
  const usageCredits = await getUsageCreditSummary(ctx.account!.account_id, ctx.account!.tier);

  sendJSON(res, 200, {
    account: ctx.account,
    entitlements: entitlements.map((e) => e.program),
    usage_credits: usageCredits,
    quota: {
      tier: quota.tier,
      snapshots_this_month: quota.usage.snapshots_this_month,
      max_snapshots_per_month: quota.limits.max_snapshots_per_month,
      project_count: quota.usage.project_count,
      max_projects: quota.limits.max_projects,
      max_files_per_snapshot: quota.limits.max_files_per_snapshot,
    },
  });
}

/** PATCH /v1/account — update name and/or email (requires auth, WO-A5) */
export async function handlePatchAccount(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const name = body.name;
  const email = body.email;
  if (name === undefined && email === undefined) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "Provide at least one of: name, email");
    return;
  }
  if (name !== undefined && (typeof name !== "string" || name.length === 0)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "name must be a non-empty string");
    return;
  }
  if (name !== undefined && (name as string).length > 200) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "Name must be 200 characters or fewer");
    return;
  }
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof email !== "string" || !emailRegex.test(email) || email.length > 254) {
      sendError(res, 400, ErrorCode.INVALID_FORMAT, "Invalid email address");
      return;
    }
  }

  const result = await updateAccountProfile(ctx.account!.account_id, {
    name: name as string | undefined,
    email: email as string | undefined,
  });
  if (result === "not_found") {
    /* v8 ignore next 2 — unreachable: requireAuth already confirmed this account_id exists */
    sendError(res, 404, ErrorCode.NOT_FOUND, "Account not found");
    return;
  }
  if (result === "email_taken") {
    sendError(res, 409, ErrorCode.CONFLICT, "An account with this email already exists");
    return;
  }

  if (result.nameChanged || result.emailChanged) {
    // H-Phase-A cycle 13: analytics-only, after the profile change already committed.
    void trackEvent(ctx.account!.account_id, "account_profile_updated", "engagement", {
      name_changed: result.nameChanged,
      email_changed: result.emailChanged,
    }).catch(() => {});
  }

  sendJSON(res, 200, {
    account: result.account,
    name_changed: result.nameChanged,
    email_changed: result.emailChanged,
    // No email-verification flow exists in this system (Honesty H1) — an
    // email change is live immediately. This note is the disclosure the
    // plan asks for in place of a verification step.
    note: result.emailChanged
      ? "Email updated immediately — no verification step exists yet for this account type."
      : undefined,
  });
}

/**
 * DELETE /v1/account (WO-A5) — see deleteAccount's doc comment in
 * @axis/snapshots (billing-store.ts) for the full retention policy this
 * enforces: access surfaces + generated content are hard-deleted, financial/
 * audit records are retained against an anonymized account shell. No
 * server-side confirmation token — matches the existing DELETE
 * /v1/projects/:id and /v1/snapshots/:id endpoints, where "confirm" is a
 * client-side (UI) affordance, not an API contract.
 */
export async function handleDeleteAccount(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const account_id = ctx.account!.account_id;
  const result = await deleteAccount(account_id);
  /* v8 ignore next 3 — unreachable: requireAuth already confirmed this account_id exists */
  if (!result.deleted) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "Account not found");
    return;
  }

  // Written against the now-anonymized account row, which still exists —
  // this is why funnel_events is on the RETAINED list, not hard-deleted.
  // H-Phase-A cycle 13: analytics-only, after the (irreversible) deletion
  // already committed — must never turn a successful deletion into a 500.
  void trackEvent(account_id, "account_deleted", "churned", {
    projects_deleted: result.projects_deleted,
  }).catch(() => {});

  sendJSON(res, 200, {
    deleted: true,
    projects_deleted: result.projects_deleted,
  });
}

/** POST /v1/account/keys — create a new API key (requires auth) */
export async function handleCreateApiKey(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown> = {};
  try {
    /* v8 ignore next */
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // empty body is fine — label is optional
  }

  /* v8 ignore next */
  const label = typeof body.label === "string" ? body.label : "";
  const { apiKey, rawKey } = await createApiKey(ctx.account!.account_id, label);

  sendJSON(res, 201, {
    key_id: apiKey.key_id,
    raw_key: rawKey,
    label: apiKey.label,
    created_at: apiKey.created_at,
    message: "Save your API key — it will not be shown again.",
  });
}

/** GET /v1/account/keys — list API keys (requires auth) */
export async function handleListApiKeys(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const keys = await listApiKeys(ctx.account!.account_id);
  sendJSON(res, 200, {
    keys: keys.map((k) => ({
      key_id: k.key_id,
      label: k.label,
      created_at: k.created_at,
      revoked_at: k.revoked_at,
      active: k.revoked_at === null,
      prefix: `axis_${k.key_id.slice(0, 8)}`,
    })),
  });
}

/** POST /v1/account/keys/:key_id/revoke — revoke an API key (requires auth) */
export async function handleRevokeApiKey(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const { key_id } = params;
  const keys = await listApiKeys(ctx.account!.account_id);
  const target = keys.find((k) => k.key_id === key_id);

  /* v8 ignore next 3 — V8 quirk: both 404 paths tested in billing-flow tests */
  if (!target) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "API key not found");
    return;
  }

  if (target.revoked_at) {
    sendError(res, 409, ErrorCode.CONFLICT, "Key already revoked");
    return;
  }

  await revokeApiKey(key_id);
  sendJSON(res, 200, { key_id, revoked: true });
}

/** GET /v1/account/usage — get usage summary (requires auth) */
export async function handleGetUsage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  /* v8 ignore next */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const since = url.searchParams.get("since") ?? undefined;
  const summary = await getUsageSummary(ctx.account!.account_id, since);
  const usageCredits = await getUsageCreditSummary(ctx.account!.account_id, ctx.account!.tier);

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    tier: ctx.account!.tier,
    since: since ?? "all_time",
    usage_credits: usageCredits,
    programs: summary,
    totals: {
      runs: summary.reduce((s, p) => s + p.total_runs, 0),
      generators: summary.reduce((s, p) => s + p.total_generators, 0),
      input_files: summary.reduce((s, p) => s + p.total_input_files, 0),
      input_bytes: summary.reduce((s, p) => s + p.total_input_bytes, 0),
    },
  });
}

const USAGE_TIMESERIES_DEFAULT_DAYS = 30;
const USAGE_TIMESERIES_MAX_DAYS = 365;

/** GET /v1/account/usage/timeseries?bucket=day&since_days=N — per-account
 *  day-bucketed usage for graphs (WO-A3; self-scoped, no admin gate — unlike
 *  /v1/account/analytics/summary this was built as a dedicated endpoint per
 *  the build plan's own "owner's call" rather than un-gating that one). */
export async function handleGetUsageTimeseries(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  /* v8 ignore next */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const bucket = url.searchParams.get("bucket") ?? "day";
  if (bucket !== "day") {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "bucket must be 'day' — the only supported granularity");
    return;
  }
  const sinceDaysRaw = parseInt(url.searchParams.get("since_days") ?? String(USAGE_TIMESERIES_DEFAULT_DAYS), 10);
  const sinceDays = Math.min(Math.max(Number.isFinite(sinceDaysRaw) ? sinceDaysRaw : USAGE_TIMESERIES_DEFAULT_DAYS, 1), USAGE_TIMESERIES_MAX_DAYS);

  // Window start, normalized to UTC midnight so the zero-fill loop below and
  // the SQL lower bound agree on exactly which calendar days are in range.
  const rawStart = new Date(Date.now() - (sinceDays - 1) * 86_400_000);
  const windowStart = new Date(Date.UTC(rawStart.getUTCFullYear(), rawStart.getUTCMonth(), rawStart.getUTCDate()));

  const [usageDays, creditDays] = await Promise.all([
    getUsageByDay(ctx.account!.account_id, windowStart.toISOString()),
    getPersistenceSpendByDay(ctx.account!.account_id, windowStart.toISOString()),
  ]);
  const usageByDate = new Map(usageDays.map((d) => [d.date, d]));
  const creditsByDate = new Map(creditDays.map((d) => [d.date, d.credits_spent]));

  // Zero-fill every day in the window (sparse store rows → a dense series a
  // chart can plot directly, no client-side gap-filling needed).
  const buckets: Array<{ date: string; runs: number; by_program: Record<string, number>; credits_spent: number }> = [];
  for (let i = 0; i < sinceDays; i++) {
    const date = new Date(windowStart.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const usage = usageByDate.get(date);
    buckets.push({
      date,
      runs: usage?.runs ?? 0,
      by_program: usage?.by_program ?? {},
      credits_spent: creditsByDate.get(date) ?? 0,
    });
  }

  sendJSON(res, 200, { buckets });
}

/** GET /v1/account/analytics/summary — per-account API + program analytics (requires auth) */
export async function handleGetAnalyticsSummary(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!isAdminCaller(req)) {
    sendError(res, 403, ErrorCode.FORBIDDEN, "Private analytics access is restricted to the owner account");
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const sinceDaysRaw = parseInt(url.searchParams.get("since_days") ?? "30", 10);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const sinceDays = Math.min(Math.max(Number.isFinite(sinceDaysRaw) ? sinceDaysRaw : 30, 1), 365);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const usage = await getUsageSummary(ctx.account!.account_id, since);
  const api = await getApiCallSummary(ctx.account!.account_id, since, limit);

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    tier: ctx.account!.tier,
    since,
    programs: usage,
    api_calls: api,
    totals: {
      runs: usage.reduce((s, p) => s + p.total_runs, 0),
      generators: usage.reduce((s, p) => s + p.total_generators, 0),
      input_files: usage.reduce((s, p) => s + p.total_input_files, 0),
      input_bytes: usage.reduce((s, p) => s + p.total_input_bytes, 0),
      api_calls: api.total_calls,
    },
  });
}

/** POST /v1/account/tier — upgrade/downgrade tier (requires auth) */
export async function handleUpdateTier(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    /* v8 ignore next 2 — V8 quirk: bad JSON tested via raw HTTP in billing-flow tests */
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const tier = normalizeBillingTierInput(body.tier);
  if (!tier) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "tier must be free, paid, or suite");
    return;
  }

  const previousTier = ctx.account!.tier;

  // Deny-by-default: upgrades to paid/suite require payment. Only the admin
  // key or an explicit AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true opt-in may
  // grant a higher tier directly. Downgrades remain self-serve.
  const isPaidUpgrade = TIER_RANK[tier] > TIER_RANK[previousTier];
  if (isPaidUpgrade && !isAdminCaller(req) && !selfServeEntitlementsAllowed()) {
    const paymentMessage = `Upgrading to the ${tier} tier requires payment. Pick a plan at https://iliad.trustfabric.ai/#plans (PAI'D hosted checkout).`;
    sendError(
      res, 402, ErrorCode.PAYMENT_REQUIRED,
      paymentMessage,
      {
        // PAI'D is the only checkout path — the legacy Stripe-direct
        // /v1/checkout endpoint was removed (H-Phase-A cycle 11) and must
        // not be advertised.
        checkout_endpoint: "https://iliad.trustfabric.ai/#plans",
        plans_url: "https://iliad.trustfabric.ai/#plans",
        // H2.5: additive canonical fields alongside the pair above.
        message: paymentMessage,
        upgrade_url: "https://iliad.trustfabric.ai/#plans",
        current_tier: previousTier,
        requested_tier: tier,
      },
    );
    return;
  }

  await updateAccountTier(ctx.account!.account_id, tier);
  const updated = await getAccount(ctx.account!.account_id);

  // Log tier change to audit trail
  await logTierChange(ctx.account!.account_id, previousTier, tier, "user_request", { source: "api" });

  // Track tier change funnel event. H-Phase-A cycle 12: analytics-only — the
  // tier update above already committed, so a trackEvent failure must never
  // turn an already-successful tier change into a 500 for the caller.
  const isUpgrade = (tier === "paid" && ctx.account!.tier === "free") || (tier === "suite");
  void trackEvent(ctx.account!.account_id, isUpgrade ? "upgrade_completed" : "downgrade_completed",
    isUpgrade ? "conversion" : "signup",
    { from_tier: ctx.account!.tier, to_tier: tier },
  ).catch(() => {});

  sendJSON(res, 200, { account: updated });
}

/** POST /v1/account/programs — enable/disable programs (requires auth, paid/suite only) */
export async function handleUpdatePrograms(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (ctx.account!.tier === "free") {
    sendError(res, 403, ErrorCode.TIER_REQUIRED, "Program management requires paid or suite tier");
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const enable = body.enable;
  const disable = body.disable;

  if (enable !== undefined && !Array.isArray(enable)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "enable must be an array of program names");
    return;
  }
  if (disable !== undefined && !Array.isArray(disable)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "disable must be an array of program names");
    return;
  }

  const allValid = [...(enable ?? []), ...(disable ?? [])] as string[];
  const invalid = allValid.filter(p => typeof p !== "string" || !(ALL_PROGRAMS as readonly string[]).includes(p));
  if (invalid.length > 0) {
    sendError(res, 400, ErrorCode.INVALID_PROGRAM, `Invalid program names: ${invalid.join(", ")}`);
    return;
  }

  // H-Phase-A cycle 13: analytics-only, after each program's enable/disable
  // already committed — an unguarded throw mid-loop used to both false-fail
  // the response AND abort processing of any remaining program in the array.
  if (enable) {
    for (const prog of enable) {
      await enableProgram(ctx.account!.account_id, prog);
      void trackEvent(ctx.account!.account_id, "program_added", "expansion", { program: prog }).catch(() => {});
    }
  }
  if (disable) {
    for (const prog of disable) {
      await disableProgram(ctx.account!.account_id, prog);
      void trackEvent(ctx.account!.account_id, "program_removed", "conversion", { program: prog }).catch(() => {});
    }
  }

  const entitlements = await getEntitlements(ctx.account!.account_id);
  sendJSON(res, 200, { programs: entitlements.map((e) => e.program) });
}

/** GET /v1/account/quota — rate-limit + resource quota visibility */
export async function handleGetQuota(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await resolveAuth(req);
  const authenticated = !ctx.anonymous;
  const ip = getClientIp(req);
  const window = getClientWindow(ip, { authenticated });

  const response: Record<string, unknown> = {
    rate_limit: {
      limit: window.limit,
      remaining: window.remaining,
      count: window.count,
      reset_in_seconds: window.reset_in_seconds,
      window_ms: window.window_ms,
    },
    authenticated,
  };

  if (ctx.account) {
    const quota = await checkQuota(ctx.account.account_id);
    response.resource_quota = {
      tier: quota.tier,
      snapshots_this_month: quota.usage.snapshots_this_month,
      max_snapshots_per_month: quota.limits.max_snapshots_per_month,
      project_count: quota.usage.project_count,
      max_projects: quota.limits.max_projects,
      max_files_per_snapshot: quota.limits.max_files_per_snapshot,
    };
  }

  sendJSON(res, 200, response);
}

// ─── GitHub Token Management ────────────────────────────────────

/** POST /v1/account/github-token — store a GitHub token (requires auth) */
export async function handleSaveGitHubToken(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const token = body.token;
  if (!token || typeof token !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "token is required (GitHub personal access token)");
    return;
  }

  if (token.length < 10 || token.length > 500) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "token must be between 10 and 500 characters");
    return;
  }

  const label = typeof body.label === "string" ? body.label : "default";
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown) => typeof s === "string") as string[] : [];

  const saved = await saveGitHubToken(ctx.account!.account_id, token, label, scopes);

  sendJSON(res, 201, {
    token_id: saved.token_id,
    label: saved.label,
    token_prefix: saved.token_prefix,
    scopes: saved.scopes,
    created_at: saved.created_at,
    message: "GitHub token stored securely. It will be used automatically for private repo analysis.",
  });
}

/** GET /v1/account/github-token — list stored GitHub tokens (requires auth) */
export async function handleListGitHubTokens(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const tokens = await getGitHubTokens(ctx.account!.account_id);

  sendJSON(res, 200, {
    tokens: tokens.map((t) => ({
      token_id: t.token_id,
      label: t.label,
      token_prefix: t.token_prefix,
      scopes: t.scopes,
      created_at: t.created_at,
      expires_at: t.expires_at,
      last_used_at: t.last_used_at,
      valid: t.valid === 1,
    })),
  });
}

/** DELETE /v1/account/github-token/:token_id — remove a stored GitHub token (requires auth) */
export async function handleDeleteGitHubToken(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const { token_id } = params;
  const deleted = await deleteGitHubToken(ctx.account!.account_id, token_id);
  if (!deleted) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "GitHub token not found");
    return;
  }

  sendJSON(res, 200, { token_id, deleted: true });
}

// ─── Billing History ────────────────────────────────────────────

/** GET /v1/billing/history — get tier change audit trail (requires auth) */
export async function handleBillingHistory(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const history = await getTierHistory(ctx.account!.account_id);

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    current_tier: ctx.account!.tier,
    history: history.map((h) => ({
      change_id: h.change_id,
      from_tier: h.from_tier,
      to_tier: h.to_tier,
      reason: h.reason,
      proration_amount: h.proration_amount,
      created_at: h.created_at,
    })),
  });
}

/** GET /v1/billing/proration — preview proration for a tier change (requires auth) */
export async function handleProrationPreview(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  /* v8 ignore next */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const targetTier = url.searchParams.get("tier");

  if (!targetTier || !["free", "paid", "suite"].includes(targetTier)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "tier query parameter required (free, paid, or suite)");
    return;
  }

  // Starter/Pro both collapse into ctx.account.tier === "paid" — resolve the
  // account's actual current plan so a real Pro subscriber's proration isn't
  // computed off Starter's $29 price (H-Phase-A cycle 2).
  const fromPaidPlanId = await getAccountPaidPlanId(ctx.account!.account_id);
  const proration = calculateProration(ctx.account!.tier, targetTier as BillingTier, fromPaidPlanId);

  sendJSON(res, 200, {
    current_tier: ctx.account!.tier,
    target_tier: targetTier,
    ...proration,
  });
}

// ─── Persistence Credits ─────────────────────────────────────────────────────

/** GET /v1/account/credits — get persistence credit balance and ledger (requires auth) */
export async function handleGetCredits(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const account_id = ctx.account!.account_id;
  const tier = ctx.account!.tier;

  // Auto-apply the suite monthly grant if eligible (idempotent — only credits once per month)
  if (tier === "suite") {
    await applySuiteMonthlyGrant(account_id, tier);
  }

  const balance = await getPersistenceBalance(account_id);
  const ledger = await getPersistenceLedger(account_id, 50);

  sendJSON(res, 200, {
    account_id,
    tier,
    balance,
    credit_costs: PERSISTENCE_CREDIT_COSTS,
    credit_packs: PERSISTENCE_CREDIT_PACKS,
    ledger,
  });
}

/** POST /v1/account/credits — grant persistence credits to an account (requires auth, paid/suite only) */
export async function handleAddCredits(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const tier = ctx.account!.tier;
  if (tier === "free") {
    sendError(res, 403, ErrorCode.FORBIDDEN, "Persistence credits require a paid plan. Upgrade at iliad.trustfabric.ai/billing.");
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const credits = body.credits;
  const rawOperation = body.operation ?? "purchase";
  const VALID_OPERATIONS = ["purchase", "suite_monthly_grant"] as const;
  type CreditOperation = (typeof VALID_OPERATIONS)[number];
  if (!VALID_OPERATIONS.includes(rawOperation as CreditOperation)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "operation must be 'purchase' or 'suite_monthly_grant'");
    return;
  }
  const operation = rawOperation as CreditOperation;

  if (typeof credits !== "number" || !Number.isInteger(credits) || credits <= 0) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "credits must be a positive integer");
    return;
  }

  if (credits > 10_000) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "credits cannot exceed 10000 per grant");
    return;
  }

  // Deny-by-default: minting persistence credits without payment is restricted
  // to the admin key or an explicit AXIS_ALLOW_SELF_SERVE_ENTITLEMENTS=true
  // opt-in. (The suite monthly grant is auto-applied via GET /v1/account/credits.)
  if (!isAdminCaller(req) && !selfServeEntitlementsAllowed()) {
    const paymentMessage = "Purchasing persistence credits requires payment. Pick a plan at https://iliad.trustfabric.ai/#plans (PAI'D hosted checkout).";
    sendError(
      res, 402, ErrorCode.PAYMENT_REQUIRED,
      paymentMessage,
      {
        // PAI'D is the only checkout path — the legacy Stripe-direct
        // /v1/checkout endpoint was removed (H-Phase-A cycle 11) and must
        // not be advertised.
        checkout_endpoint: "https://iliad.trustfabric.ai/#plans",
        plans_url: "https://iliad.trustfabric.ai/#plans",
        // H2.5: additive canonical fields alongside the pair above.
        message: paymentMessage,
        upgrade_url: "https://iliad.trustfabric.ai/#plans",
        requested_credits: credits,
      },
    );
    return;
  }

  const account_id = ctx.account!.account_id;
  const balance_after = await addPersistenceCredits(account_id, credits, operation);

  sendJSON(res, 200, {
    account_id,
    credits_added: credits,
    operation: String(operation),
    balance_after,
  });
}
