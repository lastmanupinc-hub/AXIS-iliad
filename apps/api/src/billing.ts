import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, readBody } from "./router.js";
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
  type Account,
  type BillingTier,
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
    const ctx: AuthContext = { account: null, key_id: null, anonymous: true };
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
    sendJSON(res, 401, { error: "Authentication required. Include Authorization: Bearer <api_key>" });
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
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const name = body.name as string | undefined;
  const email = body.email as string | undefined;
  const tier = (body.tier as BillingTier) ?? "free";

  if (!name || !email) {
    sendJSON(res, 400, { error: "name and email are required" });
    return;
  }

  if (!["free", "paid", "suite"].includes(tier)) {
    sendJSON(res, 400, { error: "tier must be free, paid, or suite" });
    return;
  }

  // Check for duplicate email
  const existing = getAccountByEmail(email);
  if (existing) {
    sendJSON(res, 409, { error: "An account with this email already exists" });
    return;
  }

  const account = createAccount(name, email, tier);

  // Auto-generate an API key for the new account
  const { apiKey, rawKey } = createApiKey(account.account_id, "default");

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

  const label = (body.label as string) ?? "";
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
    sendJSON(res, 404, { error: "API key not found" });
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
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const tier = body.tier as BillingTier | undefined;
  if (!tier || !["free", "paid", "suite"].includes(tier)) {
    sendJSON(res, 400, { error: "tier must be free, paid, or suite" });
    return;
  }

  updateAccountTier(ctx.account!.account_id, tier);
  const updated = getAccount(ctx.account!.account_id);

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
    sendJSON(res, 403, { error: "Program management requires paid or suite tier" });
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJSON(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const enable = body.enable as string[] | undefined;
  const disable = body.disable as string[] | undefined;

  if (enable) {
    for (const prog of enable) {
      enableProgram(ctx.account!.account_id, prog);
    }
  }
  if (disable) {
    for (const prog of disable) {
      disableProgram(ctx.account!.account_id, prog);
    }
  }

  const entitlements = getEntitlements(ctx.account!.account_id);
  sendJSON(res, 200, { programs: entitlements.map((e) => e.program) });
}
