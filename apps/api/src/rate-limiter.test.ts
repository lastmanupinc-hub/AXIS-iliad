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

    const row = await sql.one("SELECT count, reset_at FROM rate_limits WHERE client_key = ?", ["40.40.40.40"]) as { count: number; reset_at: number } | undefined;
    expect(row).toBeDefined();
    expect(Number(row!.count)).toBe(5);
    expect(Number(row!.reset_at)).toBeGreaterThan(Date.now() - 1000);

    await unbindRateLimiterDb();
  });

  it("bindRateLimiterDb restores persisted entries on startup", async () => {
    await resetTestDb();

    // Manually insert a persisted rate limit entry into DB
    const futureReset = Date.now() + 60_000;
    await sql.run("INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)", ["50.50.50.50", 30, futureReset]);

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
    await sql.run("INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)", ["60.60.60.60", 58, pastReset]);

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
    const row = await sql.one("SELECT count FROM rate_limits WHERE client_key = ?", ["80.80.80.80"]) as { count: number } | undefined;
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
