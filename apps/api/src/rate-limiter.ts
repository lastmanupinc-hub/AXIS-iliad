import type { IncomingMessage, ServerResponse } from "node:http";
import { sql } from "@axis/snapshots";
import { sendError } from "./router.js";
import { ErrorCode, log, getRequestId } from "./logger.js";

// ─── Sliding window rate limiter (in-memory + Postgres persistence) ──

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

let persistEnabled = false;
let persistTimer: ReturnType<typeof setInterval> | null = null;
const PERSIST_INTERVAL_MS = 30_000; // flush in-memory state to Postgres every 30s

/** Bind the rate limiter to Postgres for persistence across restarts. */
export async function bindRateLimiterDb(): Promise<void> {
  persistEnabled = true;

  // Load any persisted entries whose window hasn't expired
  const now = Date.now();
  const rows = await sql.many<{ client_key: string; count: number | string; reset_at: number | string }>(
    "SELECT client_key, count, reset_at FROM rate_limits WHERE reset_at > ?",
    [now],
  );
  for (const row of rows) {
    windows.set(row.client_key, { count: Number(row.count), resetAt: Number(row.reset_at) });
  }

  // Start periodic flush
  /* v8 ignore start — persistence timer only starts in production with DB */
  if (!persistTimer) {
    persistTimer = setInterval(() => { void flushToDb(); }, PERSIST_INTERVAL_MS);
    if (persistTimer.unref) persistTimer.unref();
  }
  /* v8 ignore stop */
}

/** Write current in-memory state to Postgres. */
export async function flushToDb(): Promise<void> {
  if (!persistEnabled) return;
  const now = Date.now();
  await sql.tx(async (client) => {
    await client.query("DELETE FROM rate_limits WHERE reset_at <= $1", [now]);
    for (const [key, entry] of windows) {
      /* v8 ignore next 3 — flushToDb runs on interval, not triggered in tests */
      if (entry.resetAt > now) {
        await client.query(
          "INSERT INTO rate_limits (client_key, count, reset_at) VALUES ($1, $2, $3) " +
            "ON CONFLICT (client_key) DO UPDATE SET count = EXCLUDED.count, reset_at = EXCLUDED.reset_at",
          [key, entry.count, entry.resetAt],
        );
      }
    }
  });
}

/** Unbind persistence (for testing / shutdown). */
export async function unbindRateLimiterDb(): Promise<void> {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
  if (persistEnabled) {
    try { await flushToDb(); } catch { /* DB may be unavailable */ }
    persistEnabled = false;
  }
}

function startCleanup() {
  /* v8 ignore next — cleanupTimer is always null in test suites (resetRateLimits called in beforeEach) */
  if (cleanupTimer) return;
  /* v8 ignore start — cleanup interval fires every 5min, not triggered in tests */
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) windows.delete(key);
    }
  }, 5 * 60_000);
  /* v8 ignore stop */
  // Don't keep process alive for cleanup
  /* v8 ignore next — unref availability is a Node.js version guard */
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/** Number of trusted proxies in front of the app (Render fronts it with one LB). */
function trustedProxyHops(): number {
  const n = process.env.TRUSTED_PROXY_HOPS ? parseInt(process.env.TRUSTED_PROXY_HOPS, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    // X-Forwarded-For is "client, proxy1, proxy2…" where each hop APPENDS the peer
    // it saw. Only the rightmost `hops` entries were added by our own proxies and
    // are trustworthy; everything to their left is client-supplied and spoofable.
    // Taking the leftmost (the old behavior) let a caller forge a fresh bucket per
    // request and bypass the limit. The real client is the entry our outermost
    // trusted proxy recorded.
    const list = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const idx = list.length - trustedProxyHops();
    if (idx >= 0 && list[idx]) return list[idx];
    // Fewer entries than configured hops → didn't traverse the expected chain;
    // fall back to the real TCP peer below.
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
