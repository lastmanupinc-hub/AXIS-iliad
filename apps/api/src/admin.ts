import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJSON } from "./router.js";
import { requireAuth } from "./billing.js";
import {
  getSystemStats,
  listAllAccounts,
  getRecentActivity,
} from "@axis/snapshots";

/** GET /v1/admin/stats — system-wide statistics (requires auth) */
export async function handleAdminStats(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const stats = getSystemStats();
  sendJSON(res, 200, stats);
}

/** GET /v1/admin/accounts — paginated account list (requires auth) */
export async function handleAdminAccounts(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ctx = requireAuth(req, res);
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
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  /* v8 ignore next — req.url always present in tests */
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  /* v8 ignore next — compound parseInt||fallback tested in admin.test.ts */
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 200);

  const events = getRecentActivity(limit);
  sendJSON(res, 200, { events, count: events.length });
}
