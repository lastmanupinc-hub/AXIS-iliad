import type { IncomingMessage, ServerResponse } from "node:http";
import { sql, MARKETED_TIERS, type BillingTier } from "@axis/snapshots";
import { sendError } from "./router.js";
import { ErrorCode, log, getRequestId } from "./logger.js";
import { aggregateIpPrefix } from "./ip-prefix.js";

// ─── Sliding window rate limiter (in-memory + Postgres persistence) ──

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// ─── Repeat-offender tracking (anti-gaming) ─────────────────────
//
// The sliding window alone can't tell a legitimately bursty client from one
// deliberately farming free capacity: both look identical inside any single
// window, and the window resets forget everything. This second, longer-lived
// counter is the memory the window doesn't have — it survives window resets
// so "went over once" and "has gone over twenty times in the last hour" stop
// being the same signal. Only used to decide whether a 429 carries upgrade
// guidance; it never blocks harder or bans, so a false positive costs a
// caller nothing but an extra JSON field.
interface OffenseEntry {
  violations: number;
  resetAt: number;
}
const offenses = new Map<string, OffenseEntry>();

/** How long a prefix's violation history is remembered (decays fully on expiry). */
const OFFENSE_TTL_MS = 60 * 60_000; // 1 hour

/** Violations within the TTL before a 429 starts carrying upgrade guidance. */
function upgradePromptAfter(): number {
  const n = parseInt(process.env.RATE_LIMIT_UPGRADE_PROMPT_AFTER ?? "3", 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Defaults — tunable per deployment via RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX_REQUESTS/
// RATE_LIMIT_MAX_AUTHENTICATED (declared in env.ts's ENV_SPEC since 2026-04; nothing
// read them until R2.3). Read fresh on each call (not cached at module load) so a
// value set after import -- as tests do -- takes effect immediately.
function rateLimitWindowMs(): number {
  const n = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}
function rateLimitMaxRequests(): number {
  const n = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "60", 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
function rateLimitMaxAuthenticated(): number {
  const n = parseInt(process.env.RATE_LIMIT_MAX_AUTHENTICATED ?? "120", 10);
  return Number.isFinite(n) && n > 0 ? n : 120;
}
function rateLimitMaxPaid(): number {
  const n = parseInt(process.env.RATE_LIMIT_MAX_PAID ?? "300", 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
}
function rateLimitMaxSuite(): number {
  const n = parseInt(process.env.RATE_LIMIT_MAX_SUITE ?? "600", 10);
  return Number.isFinite(n) && n > 0 ? n : 600;
}

/**
 * The per-window request ceiling for a caller. Tier-scaled so the upgrade
 * guidance a repeat-offender 429 carries is a TRUE statement — before this,
 * every authenticated account shared one limit regardless of plan, so
 * "upgrade for more headroom" would have been marketing copy for a benefit
 * that did not exist. Anonymous (60) and free (120) keep their existing
 * values exactly; paid/suite only ADD headroom, so no caller is worse off.
 */
export function limitForTier(tier: BillingTier | null): number {
  if (tier === "suite") return rateLimitMaxSuite();
  if (tier === "paid") return rateLimitMaxPaid();
  if (tier === "free") return rateLimitMaxAuthenticated();
  return rateLimitMaxRequests(); // anonymous / unresolved
}

/** The next tier up, or null when already at the top (nothing honest to sell). */
function nextTierUp(tier: BillingTier | null): BillingTier | null {
  if (tier === null) return "free";
  if (tier === "free") return "paid";
  if (tier === "paid") return "suite";
  return null; // suite — no higher tier exists
}

/**
 * Upgrade guidance attached to a repeat offender's 429. Deliberately
 * SYNCHRONOUS and allocation-only: the 402 path's buildPaymentRequiredPayload
 * mints a referral code (a DB write) and reads usage credits, which on this
 * path would turn every blocked request into database work — handing an
 * attacker a cheap amplification lever on the exact code path meant to shut
 * them down. Prices come from MARKETED_TIERS so this can't drift from the
 * real catalog. `upgrade_url` matches the canonical pointer name every other
 * payment/quota surface already uses, so an agent parses one field name.
 */
function buildUpgradeHint(tier: BillingTier | null, currentLimit: number): Record<string, unknown> | null {
  const next = nextTierUp(tier);
  if (next === null) return null;

  const nextLimit = limitForTier(next);
  // Only pitch an upgrade that actually buys headroom — if an operator has
  // tuned the env limits flat (or inverted), stay silent rather than claim a
  // benefit this deployment doesn't deliver.
  if (nextLimit <= currentLimit) return null;

  if (next === "free") {
    return {
      current_tier: "anonymous",
      recommended_tier: "free",
      current_limit_per_window: currentLimit,
      recommended_limit_per_window: nextLimit,
      price_monthly_cents: 0,
      reason: `Anonymous callers share a ${currentLimit}-request window per network. A free account raises it to ${nextLimit}.`,
      create_account_url: "https://axis-api-6c7z.onrender.com/v1/accounts",
      upgrade_url: "https://iliad.trustfabric.ai/#plans",
    };
  }

  const planId = next === "suite" ? "growth" : "pro";
  const plan = MARKETED_TIERS.find((t) => t.plan_id === planId);
  return {
    current_tier: tier,
    recommended_tier: next,
    recommended_plan_id: planId,
    current_limit_per_window: currentLimit,
    recommended_limit_per_window: nextLimit,
    price_monthly_cents: plan?.price_monthly_cents ?? null,
    monthly_credits: plan?.monthly_credits ?? null,
    reason: `This network has repeatedly exceeded the ${currentLimit}-request window for its tier. ${planId === "pro" ? "Pro" : "Growth"} raises it to ${nextLimit}.`,
    upgrade_url: "https://iliad.trustfabric.ai/#plans",
  };
}

// Cleanup stale entries every 5 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// ─── Persistence ────────────────────────────────────────────────

let persistEnabled = false;
let persistTimer: ReturnType<typeof setInterval> | null = null;
const PERSIST_INTERVAL_MS = 30_000; // flush in-memory state to Postgres every 30s

/**
 * Bind the rate limiter to Postgres for persistence across restarts.
 *
 * `client_key` holds the aggregated network prefix (see checkRateLimit). Rows
 * written before that change are keyed by exact IP, so they load into memory
 * under a key nothing looks up any more — harmless and self-clearing: a window
 * is 60s, and flushToDb's first statement deletes every expired row. No
 * migration needed, and nothing carries a stale count into the new scheme.
 */
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
  opts?: { authenticated?: boolean; tier?: BillingTier | null },
): boolean {
  startCleanup();

  const ip = getClientIp(req);
  // Key on the NETWORK prefix, not the exact address. Keying on the address
  // let any caller with an IPv6 allocation (a /64 is the normal residential
  // assignment, and OS privacy extensions rotate the host bits on their own)
  // mint a fresh budget per request — the limiter was strictest against the
  // single-static-IPv4 callers least likely to be abusing it. Same
  // aggregation the anonymous challenge door has always used.
  const key = aggregateIpPrefix(ip);
  // An explicit tier wins; `authenticated` alone (the pre-tier call shape,
  // still used by callers that haven't resolved an account) maps to the free
  // ceiling exactly as before.
  const tier: BillingTier | null = opts?.tier ?? (opts?.authenticated ? "free" : null);
  const maxRequests = limitForTier(tier);
  const now = Date.now();

  let entry = windows.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + rateLimitWindowMs() };
    windows.set(key, entry);
  }

  entry.count++;

  // Set rate limit headers (draft RFC 7231 / RateLimit fields)
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);
  res.setHeader("RateLimit-Limit", String(maxRequests));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (entry.count > maxRequests) {
    // Record the violation against the prefix's longer-lived history BEFORE
    // deciding whether to show upgrade guidance, so the threshold counts this
    // 429 too (a threshold of 1 means "the very first violation", not "the
    // second") — an off-by-one here would silently move the prompt a whole
    // violation later than configured.
    let offense = offenses.get(key);
    if (!offense || now >= offense.resetAt) {
      offense = { violations: 0, resetAt: now + OFFENSE_TTL_MS };
      offenses.set(key, offense);
    }
    offense.violations++;

    const repeatOffender = offense.violations >= upgradePromptAfter();
    const upgrade = repeatOffender ? buildUpgradeHint(tier, maxRequests) : null;

    log("warn", "rate_limited", {
      request_id: getRequestId(res),
      ip,
      prefix: key,
      count: entry.count,
      limit: maxRequests,
      tier: tier ?? "anonymous",
      violations: offense.violations,
      upgrade_prompted: upgrade !== null,
    });
    res.setHeader("Retry-After", String(resetSeconds));
    sendError(res, 429, ErrorCode.RATE_LIMITED, "Too many requests", {
      retry_after: resetSeconds,
      ...(upgrade ? { violations_in_window: offense.violations, upgrade } : {}),
    });
    return false;
  }

  return true;
}

/** Query the current rate-limit window for a client IP. */
export function getClientWindow(
  ip: string,
  opts?: { authenticated?: boolean; tier?: BillingTier | null },
): {
  limit: number;
  remaining: number;
  count: number;
  reset_at: number;
  reset_in_seconds: number;
  window_ms: number;
} {
  const tier: BillingTier | null = opts?.tier ?? (opts?.authenticated ? "free" : null);
  const maxRequests = limitForTier(tier);
  const now = Date.now();
  // Must aggregate identically to checkRateLimit — reporting the exact-IP
  // bucket here while enforcement runs on the prefix would show every caller
  // a permanently empty window that never matches the 429s they actually get.
  const entry = windows.get(aggregateIpPrefix(ip));

  if (!entry || now >= entry.resetAt) {
    return {
      limit: maxRequests,
      remaining: maxRequests,
      count: 0,
      reset_at: 0,
      reset_in_seconds: 0,
      window_ms: rateLimitWindowMs(),
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
    window_ms: rateLimitWindowMs(),
  };
}

/** Reset all rate limit state (for testing) */
export function resetRateLimits(): void {
  windows.clear();
  offenses.clear();
}

/** Visible for testing: a prefix's remembered violation count (0 when unknown/expired). */
export function getViolationCount(ip: string): number {
  const entry = offenses.get(aggregateIpPrefix(ip));
  if (!entry || Date.now() >= entry.resetAt) return 0;
  return entry.violations;
}

/**
 * Visible for testing. Getters (not frozen values) so a test that sets
 * RATE_LIMIT_* env vars after this module is imported still observes the
 * live-configured limit, matching what checkRateLimit()/getClientWindow()
 * actually enforce.
 */
export const LIMITS = {
  get WINDOW_MS() { return rateLimitWindowMs(); },
  get DEFAULT_MAX() { return rateLimitMaxRequests(); },
  get AUTHENTICATED_MAX() { return rateLimitMaxAuthenticated(); },
  get PAID_MAX() { return rateLimitMaxPaid(); },
  get SUITE_MAX() { return rateLimitMaxSuite(); },
  get UPGRADE_PROMPT_AFTER() { return upgradePromptAfter(); },
};
