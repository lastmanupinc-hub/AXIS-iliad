import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError, readBody } from "./router.js";
import { requireAuth, constantTimeEqual } from "./billing.js";
import type { AuthContext } from "./billing.js";
import { ErrorCode } from "./logger.js";
import {
  getSystemStats,
  listAllAccounts,
  getRecentActivity,
  getMcpUsageWindows,
  getMcpUsageSummary,
  getMcpUsageNewVsReturning,
  getGrowthSnapshot,
  getFunnelMetrics,
  grantEntitlement,
  listEntitlements,
} from "@axis/snapshots";
import { PRODUCT_IDS, getProduct } from "@axis/generator-core";

/**
 * Require admin access. Validates auth first, then checks the raw API key
 * against the ADMIN_API_KEY env var. Returns null (and sends 403) on failure.
 */
export async function requireAdmin(req: IncomingMessage, res: ServerResponse): Promise<AuthContext | null> {
  const ctx = await requireAuth(req, res);
  if (!ctx) return null; // 401 already sent

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    sendError(res, 403, "FORBIDDEN", "Admin endpoints are not configured");
    return null;
  }

  const authHeader = req.headers.authorization;
  const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (rawKey === null || !constantTimeEqual(rawKey, adminKey)) {
    sendError(res, 403, "FORBIDDEN", "Admin access required");
    return null;
  }

  return ctx;
}

/** GET /v1/admin/stats — system-wide statistics (requires auth) */
export async function handleAdminStats(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  const stats = await getSystemStats();
  sendJSON(res, 200, stats);
}

/** GET /v1/admin/accounts — paginated account list (requires auth) */
export async function handleAdminAccounts(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  /* v8 ignore next — compound parseInt||fallback tested in admin.test.ts (limit=abc,0,200+) */
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const result = await listAllAccounts(limit, offset);
  sendJSON(res, 200, { ...result, limit, offset });
}

/** GET /v1/admin/activity — recent activity across all accounts (requires auth) */
export async function handleAdminActivity(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  /* v8 ignore next — compound parseInt||fallback tested in admin.test.ts */
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

  const events = await getRecentActivity(limit);
  sendJSON(res, 200, { events, count: events.length });
}

/**
 * GET /v1/admin/mcp-usage — persistent MCP call telemetry (admin only).
 * Optional ?window_days=N (default 30, clamped 1..365) sets the analytics window.
 */
export async function handleAdminMcpUsage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const windowDays = Math.min(
    Math.max(parseInt(url.searchParams.get("window_days") ?? "30", 10) || 30, 1),
    365,
  );

  sendJSON(res, 200, {
    windows: await getMcpUsageWindows(),
    summary: await getMcpUsageSummary({ windowDays }),
    new_vs_returning: await getMcpUsageNewVsReturning({ windowDays }),
  });
}

/**
 * GET /v1/admin/revenue — growth & revenue readout (admin only). The data source
 * for the ME-01 monetization-execution score: concrete account growth + metered
 * overage + active subscriptions, a transparent MRR estimate, and the funnel's
 * conversion/activation rates — all from local data, no external dashboards.
 *
 * `revenue.estimated_mrr_cents` and `revenue.settled_mrr_cents` are DISTINCT keys
 * (WO-19, revenue-mrr-tracker) — the former is a tier-count estimate, the latter
 * is derived from settled payments (usage_credit_ledger overage + payment_receipts)
 * and reads a true $0 until real money moves. Never conflate the two.
 */
export async function handleAdminRevenue(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  const growth = await getGrowthSnapshot();
  const funnel = await getFunnelMetrics();
  const mcp = await getMcpUsageSummary({ windowDays: 30 });

  sendJSON(res, 200, {
    ...growth,
    funnel: {
      conversion_rate: funnel.conversion_rate,
      activation_rate: funnel.activation_rate,
      by_stage: funnel.by_stage,
    },
    mcp_engagement: {
      window_days: mcp.window_days,
      total_calls: mcp.total_calls,
      unique_accounts: mcp.unique_accounts,
    },
  });
}

// ─── Hub-and-spoke product entitlements ────────────────────────
// docs/saas-strategy/CONSOLIDATION.md. Deliberately a NEW, additive-only
// surface: neither handler touches accounts.tier or any of the 43 existing
// tier-gated call sites. Every current paid/suite account's program access
// is completely unchanged by this file. This is the end-to-end proof that
// @axis/snapshots' entitlement plumbing (grantEntitlement/listEntitlements)
// works over a real HTTP request — not a retrofit of an existing gate.
//
// No self-serve purchase path exists yet (no spoke product has a subdomain
// or live billing — see CONSOLIDATION.md's build order). Granting is
// admin-only until one does.

/** GET /v1/account/entitlements — list the caller's own granted products */
export async function handleListEntitlements(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAuth(req, res);
  /* v8 ignore next */
  if (!ctx) return;

  const entitlements = await listEntitlements(ctx.account!.account_id);
  sendJSON(res, 200, {
    entitlements: entitlements.map((e) => ({
      product_id: e.product_id,
      product_name: getProduct(e.product_id)?.name ?? e.product_id,
      granted_at: e.granted_at,
      source: e.source,
    })),
  });
}

/** POST /v1/admin/entitlements/grant — grant one account access to one spoke product */
export async function handleAdminGrantEntitlement(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendError(res, 400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    return;
  }

  const accountId = body.account_id;
  const productId = body.product_id;
  if (typeof accountId !== "string" || !accountId) {
    sendError(res, 400, ErrorCode.MISSING_FIELD, "account_id is required");
    return;
  }
  if (typeof productId !== "string" || !PRODUCT_IDS.includes(productId)) {
    sendError(
      res,
      400,
      ErrorCode.INVALID_FORMAT,
      `product_id must be one of: ${PRODUCT_IDS.join(", ")}`,
    );
    return;
  }

  await grantEntitlement(accountId, productId, "manual");
  sendJSON(res, 200, {
    granted: true,
    account_id: accountId,
    product_id: productId,
    product_name: getProduct(productId)?.name ?? productId,
  });
}
