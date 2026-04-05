import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, readBody, sendError } from "./router.js";
import { ErrorCode } from "./logger.js";
import { getClientWindow, getClientIp } from "./rate-limiter.js";
import {
  resolveApiKey,
  createAccount,
  getAccount,
  getAccountByEmail,
  updateAccountTier,
  createApiKey,
  revokeApiKey,
  listApiKeys,
  enableProgram,
  disableProgram,
  getEntitlements,
  checkQuota,
  getUsageSummary,
  recordUsage,
  isProgramEnabled,
  trackEvent,
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

/**
 * Extract and resolve API key from Authorization header.
 * Sets auth context on the request. Does NOT reject anonymous requests —
 * callers can check context.anonymous to enforce auth when needed.
 */
export function resolveAuth(req: IncomingMessage): AuthContext {
  const cached = AUTH_CONTEXT.get(req);
  if (cached) return cached;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const ctx: AuthContext = { account: null, key_id: null, anonymous: true };
    AUTH_CONTEXT.set(req, ctx);
    return ctx;
  }

  const rawKey = authHeader.slice(7);
  const resolved = resolveApiKey(rawKey);
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
export function requireAuth(req: IncomingMessage, res: ServerResponse): AuthContext | null {
  const ctx = resolveAuth(req);
  if (ctx.anonymous || !ctx.account) {
    sendError(res, 401, ErrorCode.AUTH_REQUIRED, "Authentication required. Include Authorization: Bearer <api_key>");
    return null;
  }
  return ctx;
}

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
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const name = body.name as string | undefined;
  const email = body.email as string | undefined;
  const tier = (body.tier as BillingTier) ?? "free";

  if (!name || typeof name !== "string" || !email || typeof email !== "string") {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "name and email are required (both must be strings)");
    return;
  }

  if (typeof tier !== "string" || !["free", "paid", "suite"].includes(tier)) {
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
  const existing = getAccountByEmail(email);
  if (existing) {
    sendError(res, 409, ErrorCode.CONFLICT, "An account with this email already exists");
    return;
  }

  const account = createAccount(name, email, tier);

  // Auto-generate an API key for the new account
  const { apiKey, rawKey } = createApiKey(account.account_id, "default");

  // Track signup funnel event
  trackEvent(account.account_id, "account_created", "signup", { tier, source: "api" });

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
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const quota = checkQuota(ctx.account!.account_id);
  const entitlements = getEntitlements(ctx.account!.account_id);

  sendJSON(res, 200, {
    account: ctx.account,
    entitlements: entitlements.map((e) => e.program),
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

/** POST /v1/account/keys — create a new API key (requires auth) */
export async function handleCreateApiKey(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // empty body is fine — label is optional
  }

  const label = typeof body.label === "string" ? body.label : "";
  const { apiKey, rawKey } = createApiKey(ctx.account!.account_id, label);

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
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const keys = listApiKeys(ctx.account!.account_id);
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
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const { key_id } = params;
  const keys = listApiKeys(ctx.account!.account_id);
  const target = keys.find((k) => k.key_id === key_id);

  if (!target) {
    sendError(res, 404, ErrorCode.NOT_FOUND, "API key not found");
    return;
  }

  if (target.revoked_at) {
    sendError(res, 409, ErrorCode.CONFLICT, "Key already revoked");
    return;
  }

  revokeApiKey(key_id);
  sendJSON(res, 200, { key_id, revoked: true });
}

/** GET /v1/account/usage — get usage summary (requires auth) */
export async function handleGetUsage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const since = url.searchParams.get("since") ?? undefined;
  const summary = getUsageSummary(ctx.account!.account_id, since);

  sendJSON(res, 200, {
    account_id: ctx.account!.account_id,
    tier: ctx.account!.tier,
    since: since ?? "all_time",
    programs: summary,
    totals: {
      runs: summary.reduce((s, p) => s + p.total_runs, 0),
      generators: summary.reduce((s, p) => s + p.total_generators, 0),
      input_files: summary.reduce((s, p) => s + p.total_input_files, 0),
      input_bytes: summary.reduce((s, p) => s + p.total_input_bytes, 0),
    },
  });
}

/** POST /v1/account/tier — upgrade/downgrade tier (requires auth) */
export async function handleUpdateTier(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const tier = body.tier;
  if (!tier || typeof tier !== "string" || !["free", "paid", "suite"].includes(tier)) {
    sendError(res, 400, ErrorCode.INVALID_FORMAT, "tier must be free, paid, or suite");
    return;
  }

  updateAccountTier(ctx.account!.account_id, tier as BillingTier);
  const updated = getAccount(ctx.account!.account_id);

  // Track tier change funnel event
  const isUpgrade = (tier === "paid" && ctx.account!.tier === "free") || (tier === "suite");
  trackEvent(ctx.account!.account_id, isUpgrade ? "upgrade_completed" : "downgrade_completed",
    isUpgrade ? "conversion" : "signup",
    { from_tier: ctx.account!.tier, to_tier: tier },
  );

  sendJSON(res, 200, { account: updated });
}

/** POST /v1/account/programs — enable/disable programs (requires auth, paid/suite only) */
export async function handleUpdatePrograms(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
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

  if (enable) {
    for (const prog of enable) {
      enableProgram(ctx.account!.account_id, prog);
      trackEvent(ctx.account!.account_id, "program_added", "expansion", { program: prog });
    }
  }
  if (disable) {
    for (const prog of disable) {
      disableProgram(ctx.account!.account_id, prog);
      trackEvent(ctx.account!.account_id, "program_removed", "conversion", { program: prog });
    }
  }

  const entitlements = getEntitlements(ctx.account!.account_id);
  sendJSON(res, 200, { programs: entitlements.map((e) => e.program) });
}

/** GET /v1/account/quota — rate-limit + resource quota visibility */
export async function handleGetQuota(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = resolveAuth(req);
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
    const quota = checkQuota(ctx.account.account_id);
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
