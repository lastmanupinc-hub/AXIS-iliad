import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON, sendError } from "./router.js";
import { requireAuth, constantTimeEqual } from "./billing.js";
import type { AuthContext } from "./billing.js";
import {
  getSystemStats,
  listAllAccounts,
  getRecentActivity,
  getMcpUsageWindows,
  getMcpUsageSummary,
  getMcpUsageNewVsReturning,
} from "@axis/snapshots";

/**
 * Require admin access. Validates auth first, then checks the raw API key
 * against the ADMIN_API_KEY env var. Returns null (and sends 403) on failure.
 */
function requireAdmin(req: IncomingMessage, res: ServerResponse): AuthContext | null {
  const ctx = requireAuth(req, res);
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
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  const stats = getSystemStats();
  sendJSON(res, 200, stats);
}

/** GET /v1/admin/accounts — paginated account list (requires auth) */
export async function handleAdminAccounts(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  /* v8 ignore next — compound parseInt||fallback tested in admin.test.ts (limit=abc,0,200+) */
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  const result = listAllAccounts(limit, offset);
  sendJSON(res, 200, { ...result, limit, offset });
}

/** GET /v1/admin/activity — recent activity across all accounts (requires auth) */
export async function handleAdminActivity(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  /* v8 ignore next — compound parseInt||fallback tested in admin.test.ts */
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

  const events = getRecentActivity(limit);
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
  const ctx = requireAdmin(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const windowDays = Math.min(
    Math.max(parseInt(url.searchParams.get("window_days") ?? "30", 10) || 30, 1),
    365,
  );

  sendJSON(res, 200, {
    windows: getMcpUsageWindows(),
    summary: getMcpUsageSummary({ windowDays }),
    new_vs_returning: getMcpUsageNewVsReturning({ windowDays }),
  });
}
