import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import { sendError } from "./router.js";
import { ErrorCode, log, getRequestId } from "./logger.js";

// ─── Sliding window rate limiter (in-memory + SQLite persistence) ──

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Defaults — tunable per deployment
const DEFAULT_WINDOW_MS = 60_000;       // 1 minute
const DEFAULT_MAX_REQUESTS = 60;        // 60 req/min for anonymous
const AUTHENTICATED_MAX_REQUESTS = 120; // 120 req/min for keyed users

// Cleanup stale entries every 5 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ─── Persistence ────────────────────────────────────────────────

let persistDb: Database.Database | null = null;
let persistTimer: ReturnType<typeof setInterval> | null = null;
const PERSIST_INTERVAL_MS = 30_000; // flush in-memory state to SQLite every 30s

/** Bind the rate limiter to a database for persistence across restarts. */
export function bindRateLimiterDb(database: Database.Database): void {
  persistDb = database;

  // Load any persisted entries whose window hasn't expired
  const now = Date.now();
  const rows = database.prepare("SELECT client_key, count, reset_at FROM rate_limits WHERE reset_at > ?").all(now) as Array<{
    client_key: string;
    count: number;
    reset_at: number;
  }>;
  for (const row of rows) {
    windows.set(row.client_key, { count: row.count, resetAt: row.reset_at });
  }

  // Start periodic flush
  if (!persistTimer) {
    persistTimer = setInterval(() => flushToDb(), PERSIST_INTERVAL_MS);
    if (persistTimer.unref) persistTimer.unref();
  }
}

/** Write current in-memory state to SQLite. */
export function flushToDb(): void {
  if (!persistDb) return;
  const now = Date.now();
  const upsert = persistDb.prepare(
    "INSERT OR REPLACE INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)",
  );
  const deleteExpired = persistDb.prepare("DELETE FROM rate_limits WHERE reset_at <= ?");

  const tx = persistDb.transaction(() => {
    deleteExpired.run(now);
    for (const [key, entry] of windows) {
      if (entry.resetAt > now) {
        upsert.run(key, entry.count, entry.resetAt);
      }
    }
  });
  tx();
}

/** Unbind persistence (for testing / shutdown). */
export function unbindRateLimiterDb(): void {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
  if (persistDb) {
    try { flushToDb(); } catch { /* DB may already be closed */ }
    persistDb = null;
  }
}

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) windows.delete(key);
    }
  }, 5 * 60_000);
  // Don't keep process alive for cleanup
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Check rate limit for a request. Returns true if allowed, false if blocked.
 * When blocked, sends 429 response automatically.
 */
export function checkRateLimit(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: { authenticated?: boolean },
): boolean {
  startCleanup();

  const ip = getClientIp(req);
  const maxRequests = opts?.authenticated ? AUTHENTICATED_MAX_REQUESTS : DEFAULT_MAX_REQUESTS;
  const now = Date.now();

  let entry = windows.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + DEFAULT_WINDOW_MS };
    windows.set(ip, entry);
  }

  entry.count++;

  // Set rate limit headers (draft RFC 7231 / RateLimit fields)
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
  res.setHeader("RateLimit-Limit", String(maxRequests));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (entry.count > maxRequests) {
    log("warn", "rate_limited", {
      request_id: getRequestId(res),
      ip,
      count: entry.count,
      limit: maxRequests,
    });
    res.setHeader("Retry-After", String(resetSeconds));
    sendError(res, 429, ErrorCode.RATE_LIMITED, "Too many requests", {
      retry_after: resetSeconds,
    });
    return false;
  }

  return true;
}

/** Query the current rate-limit window for a client IP. */
export function getClientWindow(
  ip: string,
  opts?: { authenticated?: boolean },
): {
  limit: number;
  remaining: number;
  count: number;
  reset_at: number;
  reset_in_seconds: number;
  window_ms: number;
} {
  const maxRequests = opts?.authenticated ? AUTHENTICATED_MAX_REQUESTS : DEFAULT_MAX_REQUESTS;
  const now = Date.now();
  const entry = windows.get(ip);

  if (!entry || now >= entry.resetAt) {
    return {
      limit: maxRequests,
      remaining: maxRequests,
      count: 0,
      reset_at: 0,
      reset_in_seconds: 0,
      window_ms: DEFAULT_WINDOW_MS,
    };
  }

  const remaining = Math.max(0, maxRequests - entry.count);
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

  return {
    limit: maxRequests,
    remaining,
    count: entry.count,
    reset_at: entry.resetAt,
    reset_in_seconds: resetSeconds,
    window_ms: DEFAULT_WINDOW_MS,
  };
}

/** Reset all rate limit state (for testing) */
export function resetRateLimits(): void {
  windows.clear();
}

/** Visible for testing */
export const LIMITS = {
  WINDOW_MS: DEFAULT_WINDOW_MS,
  DEFAULT_MAX: DEFAULT_MAX_REQUESTS,
  AUTHENTICATED_MAX: AUTHENTICATED_MAX_REQUESTS,
} as const;
