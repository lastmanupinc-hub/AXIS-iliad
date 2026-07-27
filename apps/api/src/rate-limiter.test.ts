import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// H1.1: the persistence tests do real Postgres round-trips (resetTestDb +
// bind/flush) — 5s default was exceeded under load (observed 11-41s in the
// July full-suite run). Ceiling, not pace: the tests themselves are awaited
// DB calls with no sleeps.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import {
  getClientIp,
  checkRateLimit,
  getClientWindow,
  resetRateLimits,
  getViolationCount,
  limitForTier,
  LIMITS,
  bindRateLimiterDb,
  flushToDb,
  unbindRateLimiterDb,
} from "./rate-limiter.js";
import { resetTestDb, sql } from "@axis/snapshots";

// ─── Helpers ────────────────────────────────────────────────────

function makeReq(headers: Record<string, string | string[] | undefined> = {}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined) req.headers[k.toLowerCase()] = v as string;
  }
  return req;
}

function makeRes(): ServerResponse {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req);
  return res;
}

beforeEach(async () => {
  await unbindRateLimiterDb();
  await resetTestDb();
  resetRateLimits();
});

afterEach(async () => {
  await unbindRateLimiterDb();
});

// ─── getClientIp ────────────────────────────────────────────────

describe("getClientIp", () => {
  it("uses the rightmost (proxy-recorded) IP, not the spoofable leftmost", async () => {
    // The leftmost entry is client-supplied; with one trusted proxy (default) the
    // real client is the rightmost entry our proxy appended.
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(req)).toBe("10.0.0.2");
  });

  it("returns single IP from x-forwarded-for", async () => {
    const req = makeReq({ "x-forwarded-for": "8.8.8.8" });
    expect(getClientIp(req)).toBe("8.8.8.8");
  });

  it("falls back to socket.remoteAddress when no header", async () => {
    const req = makeReq();
    Object.defineProperty(req.socket, "remoteAddress", { value: "192.168.1.1", configurable: true });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it('returns "unknown" when no header and no remoteAddress', async () => {
    const req = makeReq();
    Object.defineProperty(req.socket, "remoteAddress", { value: undefined, configurable: true });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for entries", async () => {
    const req = makeReq({ "x-forwarded-for": "  3.3.3.3  , 4.4.4.4  " });
    expect(getClientIp(req)).toBe("4.4.4.4");
  });

  it("respects TRUSTED_PROXY_HOPS for multi-proxy chains", async () => {
    const prev = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "2";
    try {
      const req = makeReq({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 10.0.0.2" });
      expect(getClientIp(req)).toBe("10.0.0.1"); // length(3) - hops(2) = index 1
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = prev;
    }
  });

  it("handles IPv6 addresses", async () => {
    const req = makeReq({ "x-forwarded-for": "::1" });
    expect(getClientIp(req)).toBe("::1");
  });

  it("falls back when x-forwarded-for is empty string", async () => {
    const req = makeReq({ "x-forwarded-for": "" });
    Object.defineProperty(req.socket, "remoteAddress", { value: "10.10.10.10", configurable: true });
    expect(getClientIp(req)).toBe("10.10.10.10");
  });
});

// ─── checkRateLimit — allowed flow ──────────────────────────────

describe("checkRateLimit — allowed", () => {
  it("returns true for first request", async () => {
    const req = makeReq({ "x-forwarded-for": "1.1.1.1" });
    const res = makeRes();
    expect(checkRateLimit(req, res)).toBe(true);
  });

  it("sets RateLimit-Limit header to default (60)", async () => {
    const req = makeReq({ "x-forwarded-for": "2.2.2.2" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Limit")).toBe("60");
  });

  it("sets RateLimit-Remaining header after first request", async () => {
    const req = makeReq({ "x-forwarded-for": "3.3.3.3" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("59");
  });

  it("uses authenticated limit (120) when opted in", async () => {
    const req = makeReq({ "x-forwarded-for": "4.4.4.4" });
    const res = makeRes();
    checkRateLimit(req, res, { authenticated: true });
    expect(res.getHeader("RateLimit-Limit")).toBe("120");
    expect(res.getHeader("RateLimit-Remaining")).toBe("119");
  });

  it("decrements remaining with each request", async () => {
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ "x-forwarded-for": "5.5.5.5" });
      const res = makeRes();
      checkRateLimit(req, res);
      if (i === 4) {
        expect(res.getHeader("RateLimit-Remaining")).toBe("55");
      }
    }
  });

  it("sets RateLimit-Reset header as integer seconds", async () => {
    const req = makeReq({ "x-forwarded-for": "6.6.6.6" });
    const res = makeRes();
    checkRateLimit(req, res);
    const reset = Number(res.getHeader("RateLimit-Reset"));
    expect(Number.isInteger(reset)).toBe(true);
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThanOrEqual(60);
  });
});

// ─── checkRateLimit — blocked flow ──────────────────────────────

describe("checkRateLimit — blocked", () => {
  it("returns false after exceeding anonymous limit (60)", async () => {
    const ip = "10.10.10.10";
    // Use all 60 allowed requests
    for (let i = 0; i < 60; i++) {
      const req = makeReq({ "x-forwarded-for": ip });
      const res = makeRes();
      expect(checkRateLimit(req, res)).toBe(true);
    }
    // 61st should be blocked
    const req = makeReq({ "x-forwarded-for": ip });
    const res = makeRes();
    expect(checkRateLimit(req, res)).toBe(false);
  });

  it("returns false after exceeding authenticated limit (120)", async () => {
    const ip = "11.11.11.11";
    for (let i = 0; i < 120; i++) {
      const req = makeReq({ "x-forwarded-for": ip });
      const res = makeRes();
      expect(checkRateLimit(req, res, { authenticated: true })).toBe(true);
    }
    const req = makeReq({ "x-forwarded-for": ip });
    const res = makeRes();
    expect(checkRateLimit(req, res, { authenticated: true })).toBe(false);
  });

  it("sets Retry-After header when blocked", async () => {
    const ip = "12.12.12.12";
    for (let i = 0; i < 61; i++) {
      const req = makeReq({ "x-forwarded-for": ip });
      const res = makeRes();
      checkRateLimit(req, res);
    }
    // Last response should have Retry-After
    const req = makeReq({ "x-forwarded-for": ip });
    const res = makeRes();
    checkRateLimit(req, res);
    const retryAfter = Number(res.getHeader("Retry-After"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it("shows remaining as 0 when at or past limit", async () => {
    const ip = "13.13.13.13";
    for (let i = 0; i < 60; i++) {
      const req = makeReq({ "x-forwarded-for": ip });
      const res = makeRes();
      checkRateLimit(req, res);
    }
    // At limit — remaining is 0
    const req = makeReq({ "x-forwarded-for": ip });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("0");
  });
});

// ─── Per-IP isolation ───────────────────────────────────────────

describe("per-IP isolation", () => {
  it("tracks separate windows per IP", async () => {
    // Exhaust IP A
    for (let i = 0; i < 61; i++) {
      const req = makeReq({ "x-forwarded-for": "20.20.20.20" });
      const res = makeRes();
      checkRateLimit(req, res);
    }
    // IP B should be fine
    const req = makeReq({ "x-forwarded-for": "21.21.21.21" });
    const res = makeRes();
    expect(checkRateLimit(req, res)).toBe(true);
    expect(res.getHeader("RateLimit-Remaining")).toBe("59");
  });
});

// ─── resetRateLimits ────────────────────────────────────────────

describe("resetRateLimits", () => {
  it("clears all windows so an exhausted IP can request again", async () => {
    const ip = "30.30.30.30";
    for (let i = 0; i < 61; i++) {
      const req = makeReq({ "x-forwarded-for": ip });
      const res = makeRes();
      checkRateLimit(req, res);
    }
    // Blocked
    const blockedReq = makeReq({ "x-forwarded-for": ip });
    const blockedRes = makeRes();
    expect(checkRateLimit(blockedReq, blockedRes)).toBe(false);

    resetRateLimits();

    // Now allowed again
    const freshReq = makeReq({ "x-forwarded-for": ip });
    const freshRes = makeRes();
    expect(checkRateLimit(freshReq, freshRes)).toBe(true);
    expect(freshRes.getHeader("RateLimit-Remaining")).toBe("59");
  });
});

// ─── LIMITS export ──────────────────────────────────────────────

describe("LIMITS constants", () => {
  it("exports correct window and request limits", async () => {
    expect(LIMITS.WINDOW_MS).toBe(60_000);
    expect(LIMITS.DEFAULT_MAX).toBe(60);
    expect(LIMITS.AUTHENTICATED_MAX).toBe(120);
  });
});

// ─── RATE_LIMIT_* env tunables (R2.3) ────────────────────────────
// ENV_SPEC advertised these since 2026-04; nothing read them until now.
// One case per var, each restoring the prior value afterward.

describe("RATE_LIMIT_* env tunables", () => {
  const ENV_KEYS = ["RATE_LIMIT_WINDOW_MS", "RATE_LIMIT_MAX_REQUESTS", "RATE_LIMIT_MAX_AUTHENTICATED"] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) prev[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("RATE_LIMIT_MAX_REQUESTS changes the anonymous limit actually enforced", async () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "3";
    expect(LIMITS.DEFAULT_MAX).toBe(3);

    const ip = "41.41.41.41";
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(makeReq({ "x-forwarded-for": ip }), makeRes())).toBe(true);
    }
    const blockedRes = makeRes();
    expect(checkRateLimit(makeReq({ "x-forwarded-for": ip }), blockedRes)).toBe(false);
    expect(blockedRes.getHeader("RateLimit-Limit")).toBe("3");
  });

  it("RATE_LIMIT_MAX_AUTHENTICATED changes the authenticated limit actually enforced", async () => {
    process.env.RATE_LIMIT_MAX_AUTHENTICATED = "2";
    expect(LIMITS.AUTHENTICATED_MAX).toBe(2);

    const ip = "42.42.42.42";
    for (let i = 0; i < 2; i++) {
      expect(checkRateLimit(makeReq({ "x-forwarded-for": ip }), makeRes(), { authenticated: true })).toBe(true);
    }
    expect(checkRateLimit(makeReq({ "x-forwarded-for": ip }), makeRes(), { authenticated: true })).toBe(false);
  });

  it("RATE_LIMIT_WINDOW_MS changes the window reflected in getClientWindow", async () => {
    process.env.RATE_LIMIT_WINDOW_MS = "5000";
    expect(LIMITS.WINDOW_MS).toBe(5000);

    const ip = "43.43.43.43";
    checkRateLimit(makeReq({ "x-forwarded-for": ip }), makeRes());
    const w = getClientWindow(ip);
    expect(w.reset_in_seconds).toBeLessThanOrEqual(5);
  });

  it("falls back to the documented default when set to a non-numeric value", async () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "not-a-number";
    expect(LIMITS.DEFAULT_MAX).toBe(60);
  });
});

// ─── Persistence ────────────────────────────────────────────────

describe("rate limiter persistence", () => {
  it("flushToDb writes in-memory state to rate_limits table", async () => {
    await resetTestDb();
    await bindRateLimiterDb();

    // Make 5 requests from one IP
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ "x-forwarded-for": "40.40.40.40" });
      const res = makeRes();
      checkRateLimit(req, res);
    }

    await flushToDb();

    // client_key is the aggregated network prefix, matching what the limiter
    // enforces on — persisting exact-IP buckets would restore state that
    // lookups could never hit again.
    const row = await sql.one("SELECT count, reset_at FROM rate_limits WHERE client_key = ?", ["40.40.40.0/24"]) as { count: number; reset_at: number } | undefined;
    expect(row).toBeDefined();
    expect(Number(row!.count)).toBe(5);
    expect(Number(row!.reset_at)).toBeGreaterThan(Date.now() - 1000);

    await unbindRateLimiterDb();
  });

  it("bindRateLimiterDb restores persisted entries on startup", async () => {
    await resetTestDb();

    // Manually insert a persisted rate limit entry into DB
    const futureReset = Date.now() + 60_000;
    await sql.run("INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)", ["50.50.50.0/24", 30, futureReset]);

    await bindRateLimiterDb();

    // The next request from that IP should continue from 30 (becomes 31)
    const req = makeReq({ "x-forwarded-for": "50.50.50.50" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("29"); // 60 - 31 = 29

    await unbindRateLimiterDb();
  });

  it("expired persisted entries are not loaded", async () => {
    await resetTestDb();

    // Insert an expired entry
    const pastReset = Date.now() - 1000;
    await sql.run("INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)", ["60.60.60.0/24", 58, pastReset]);

    await bindRateLimiterDb();

    // Should start fresh (not carry over 58 count)
    const req = makeReq({ "x-forwarded-for": "60.60.60.60" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("59"); // 60 - 1 = 59

    await unbindRateLimiterDb();
  });

  it("flushToDb removes expired entries from database", async () => {
    await resetTestDb();
    await bindRateLimiterDb();

    // Insert an already-expired entry
    const pastReset = Date.now() - 5000;
    await sql.run(
      "INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?) ON CONFLICT (client_key) DO UPDATE SET count = EXCLUDED.count, reset_at = EXCLUDED.reset_at",
      ["70.70.70.70", 10, pastReset],
    );

    await flushToDb();

    const row = await sql.one("SELECT * FROM rate_limits WHERE client_key = ?", ["70.70.70.70"]);
    expect(row).toBeUndefined();

    await unbindRateLimiterDb();
  });

  it("unbindRateLimiterDb flushes before disconnecting", async () => {
    await resetTestDb();
    await bindRateLimiterDb();

    for (let i = 0; i < 3; i++) {
      const req = makeReq({ "x-forwarded-for": "80.80.80.80" });
      const res = makeRes();
      checkRateLimit(req, res);
    }

    await unbindRateLimiterDb();

    // Data should have been flushed before unbind
    const row = await sql.one("SELECT count FROM rate_limits WHERE client_key = ?", ["80.80.80.0/24"]) as { count: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.count).toBe(3);
  });

  it("works without persistence (no-op flush)", async () => {
    // No db bound — flushToDb should be a no-op
    await flushToDb();
    const req = makeReq({ "x-forwarded-for": "90.90.90.90" });
    const res = makeRes();
    expect(checkRateLimit(req, res)).toBe(true);
  });
});

// ─── getClientWindow ────────────────────────────────────────────

describe("getClientWindow", () => {
  it("returns zeroed window for unknown IP", async () => {
    const w = getClientWindow("192.168.99.99");
    expect(w.count).toBe(0);
    expect(w.remaining).toBe(w.limit);
    expect(w.reset_at).toBe(0);
    expect(w.reset_in_seconds).toBe(0);
  });

  it("reflects active window for IP that has made requests", async () => {
    const ip = "10.20.30.40";
    const req = makeReq({ "x-forwarded-for": ip });
    const res = makeRes();
    checkRateLimit(req, res);
    checkRateLimit(makeReq({ "x-forwarded-for": ip }), makeRes());

    const w = getClientWindow(ip);
    expect(w.count).toBe(2);
    expect(w.remaining).toBe(w.limit - 2);
    expect(w.reset_at).toBeGreaterThan(0);
    expect(w.reset_in_seconds).toBeGreaterThan(0);
  });

  it("applies authenticated limit when option is set", async () => {
    const ip = "10.20.30.41";
    const req = makeReq({ "x-forwarded-for": ip });
    checkRateLimit(req, makeRes(), { authenticated: true });

    const w = getClientWindow(ip, { authenticated: true });
    expect(w.limit).toBe(LIMITS.AUTHENTICATED_MAX);
    expect(w.count).toBe(1);
  });
});

// ─── Anti-gaming: network-prefix aggregation ────────────────────
//
// The limiter used to key on the exact IP string. Anyone holding an IPv6
// allocation — a /64 is the standard residential assignment, and OS privacy
// extensions rotate the host bits with no attacker effort at all — got a
// fresh budget on every single request, so the limiter bound hardest on the
// single-static-IPv4 callers least likely to be abusing anything. These lock
// the aggregation that closes it.

describe("checkRateLimit — prefix aggregation (anti-gaming)", () => {
  it("rotating the host bits of one IPv6 /64 does NOT mint a fresh budget", () => {
    const limit = LIMITS.DEFAULT_MAX;
    // Every address below is a distinct string but the same real /64.
    for (let i = 0; i < limit; i++) {
      const req = makeReq({ "x-forwarded-for": `2001:db8:abcd:1234::${i.toString(16)}` });
      expect(checkRateLimit(req, makeRes())).toBe(true);
    }
    // One more from a *different* host address in the SAME /64 must be blocked.
    const res = makeRes();
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "2001:db8:abcd:1234::ffff" }), res)).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it("aggregates an IPv6 /64 correctly even when the prefix itself is zero-compressed", () => {
    // "2001:db8::a1b2:..." — the "::" sits INSIDE the network portion, the
    // exact shape a naive split(":") mis-slices into a per-address bucket.
    const limit = LIMITS.DEFAULT_MAX;
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit(makeReq({ "x-forwarded-for": `2001:db8::a1b2:c3d4:e5f6:${i.toString(16)}` }), makeRes())).toBe(true);
    }
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "2001:db8::a1b2:c3d4:e5f6:ffff" }), makeRes())).toBe(false);
  });

  it("rotating the last IPv4 octet within one /24 does NOT mint a fresh budget", () => {
    const limit = LIMITS.DEFAULT_MAX;
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit(makeReq({ "x-forwarded-for": `203.0.113.${i % 254}` }), makeRes())).toBe(true);
    }
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "203.0.113.254" }), makeRes())).toBe(false);
  });

  it("keeps genuinely different networks in separate buckets", () => {
    const limit = LIMITS.DEFAULT_MAX;
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit(makeReq({ "x-forwarded-for": "198.51.100.7" }), makeRes())).toBe(true);
    }
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "198.51.100.7" }), makeRes())).toBe(false);
    // A different /24 is untouched by the neighbour's exhaustion.
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "198.51.99.7" }), makeRes())).toBe(true);
  });

  it("treats an IPv4-mapped IPv6 address as its underlying IPv4 network", () => {
    const limit = LIMITS.DEFAULT_MAX;
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit(makeReq({ "x-forwarded-for": "192.0.2.15" }), makeRes())).toBe(true);
    }
    // Same network, expressed in the dual-stack ::ffff: form — must share the bucket.
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "::ffff:192.0.2.200" }), makeRes())).toBe(false);
  });

  it("getClientWindow reports the same aggregated bucket enforcement uses", () => {
    checkRateLimit(makeReq({ "x-forwarded-for": "203.0.113.10" }), makeRes());
    checkRateLimit(makeReq({ "x-forwarded-for": "203.0.113.99" }), makeRes());
    // Both requests landed in one /24 bucket; querying by either address sees 2.
    expect(getClientWindow("203.0.113.10").count).toBe(2);
    expect(getClientWindow("203.0.113.99").count).toBe(2);
  });
});

// ─── Tier-scaled limits ─────────────────────────────────────────

describe("limitForTier", () => {
  it("scales upward across tiers so an upgrade buys real headroom", () => {
    expect(limitForTier(null)).toBe(LIMITS.DEFAULT_MAX);
    expect(limitForTier("free")).toBe(LIMITS.AUTHENTICATED_MAX);
    expect(limitForTier("paid")).toBe(LIMITS.PAID_MAX);
    expect(limitForTier("suite")).toBe(LIMITS.SUITE_MAX);
    // The ordering is the whole basis of the upgrade claim — assert it, don't assume it.
    expect(limitForTier(null)).toBeLessThan(limitForTier("free"));
    expect(limitForTier("free")).toBeLessThan(limitForTier("paid"));
    expect(limitForTier("paid")).toBeLessThan(limitForTier("suite"));
  });

  it("preserves the pre-existing anonymous and free ceilings exactly (no caller loses headroom)", () => {
    expect(limitForTier(null)).toBe(60);
    expect(limitForTier("free")).toBe(120);
  });

  it("a paid account gets more requests than a free one before being limited", () => {
    const freeLimit = limitForTier("free");
    for (let i = 0; i < freeLimit + 1; i++) {
      checkRateLimit(makeReq({ "x-forwarded-for": "198.18.0.1" }), makeRes(), { tier: "paid" });
    }
    // Past the FREE ceiling, but a paid caller is still under their own.
    expect(checkRateLimit(makeReq({ "x-forwarded-for": "198.18.0.1" }), makeRes(), { tier: "paid" })).toBe(true);
  });
});

// ─── Repeat offenders → upgrade guidance ────────────────────────

/** Drive one prefix past its ceiling `rounds` times; return the last 429's JSON body. */
function exhaust(ip: string, tier: Parameters<typeof limitForTier>[0], rounds: number): Record<string, unknown> {
  const limit = limitForTier(tier);
  let lastBody = "{}";
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i <= limit; i++) {
      const res = makeRes();
      const captured: string[] = [];
      const realEnd = res.end.bind(res);
      (res as unknown as { end: (c?: unknown) => unknown }).end = (chunk?: unknown) => {
        if (typeof chunk === "string") captured.push(chunk);
        return realEnd(chunk as never);
      };
      const allowed = checkRateLimit(makeReq({ "x-forwarded-for": ip }), res, { tier });
      if (!allowed && captured.length > 0) lastBody = captured.join("");
    }
  }
  return JSON.parse(lastBody) as Record<string, unknown>;
}

describe("checkRateLimit — repeat-offender upgrade guidance", () => {
  it("a first-time violation gets a plain 429 with no upgrade payload", () => {
    const body = exhaust("198.18.10.1", null, 1);
    expect(body.error_code).toBe("RATE_LIMITED");
    expect(body.retry_after).toBeDefined();
    expect(body.upgrade).toBeUndefined();
  });

  it("a repeat offender's 429 carries tier-upgrade guidance", () => {
    const body = exhaust("198.18.11.1", null, LIMITS.UPGRADE_PROMPT_AFTER);
    expect(body.error_code).toBe("RATE_LIMITED");
    const upgrade = body.upgrade as Record<string, unknown>;
    expect(upgrade).toBeDefined();
    expect(upgrade.recommended_tier).toBe("free");
    expect(upgrade.create_account_url).toContain("/v1/accounts");
    // The pitch must quote a genuinely higher ceiling, not just a URL.
    expect(upgrade.recommended_limit_per_window as number).toBeGreaterThan(upgrade.current_limit_per_window as number);
  });

  it("pitches a real paid plan (with its real price) to a repeat-offending free account", () => {
    const body = exhaust("198.18.12.1", "free", LIMITS.UPGRADE_PROMPT_AFTER);
    const upgrade = body.upgrade as Record<string, unknown>;
    expect(upgrade.current_tier).toBe("free");
    expect(upgrade.recommended_tier).toBe("paid");
    expect(upgrade.recommended_plan_id).toBe("pro");
    expect(upgrade.price_monthly_cents).toBe(9900); // MARKETED_TIERS' real Pro price
    expect(upgrade.upgrade_url).toContain("iliad.trustfabric.ai");
  });

  it("never pitches an upgrade to a suite account — there is no higher tier to sell", () => {
    const body = exhaust("198.18.13.1", "suite", LIMITS.UPGRADE_PROMPT_AFTER + 1);
    expect(body.error_code).toBe("RATE_LIMITED");
    expect(body.upgrade).toBeUndefined();
  });

  it("counts violations per network prefix, not per address", () => {
    const limit = limitForTier(null);
    for (let i = 0; i <= limit; i++) {
      checkRateLimit(makeReq({ "x-forwarded-for": `198.18.14.${i % 254}` }), makeRes());
    }
    // Rotating addresses across one /24 accumulates against the SAME history.
    expect(getViolationCount("198.18.14.1")).toBeGreaterThan(0);
    expect(getViolationCount("198.18.14.250")).toBe(getViolationCount("198.18.14.1"));
    // An unrelated network has no history at all.
    expect(getViolationCount("198.19.0.1")).toBe(0);
  });

  it("resetRateLimits clears violation history as well as windows", () => {
    const limit = limitForTier(null);
    for (let i = 0; i <= limit; i++) {
      checkRateLimit(makeReq({ "x-forwarded-for": "198.18.15.1" }), makeRes());
    }
    expect(getViolationCount("198.18.15.1")).toBeGreaterThan(0);
    resetRateLimits();
    expect(getViolationCount("198.18.15.1")).toBe(0);
  });
});
