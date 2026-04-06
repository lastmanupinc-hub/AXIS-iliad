import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { openMemoryDb, closeDb } from "@axis/snapshots";

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

beforeEach(() => {
  unbindRateLimiterDb();
  openMemoryDb();
  resetRateLimits();
});

afterEach(() => {
  unbindRateLimiterDb();
  closeDb();
});

// ─── getClientIp ────────────────────────────────────────────────

describe("getClientIp", () => {
  it("extracts first IP from x-forwarded-for", () => {
    const req = makeReq({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("returns single IP from x-forwarded-for", () => {
    const req = makeReq({ "x-forwarded-for": "8.8.8.8" });
    expect(getClientIp(req)).toBe("8.8.8.8");
  });

  it("falls back to socket.remoteAddress when no header", () => {
    const req = makeReq();
    Object.defineProperty(req.socket, "remoteAddress", { value: "192.168.1.1", configurable: true });
    expect(getClientIp(req)).toBe("192.168.1.1");
  });

  it('returns "unknown" when no header and no remoteAddress', () => {
    const req = makeReq();
    Object.defineProperty(req.socket, "remoteAddress", { value: undefined, configurable: true });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("trims whitespace from x-forwarded-for entries", () => {
    const req = makeReq({ "x-forwarded-for": "  3.3.3.3  , 4.4.4.4" });
    expect(getClientIp(req)).toBe("3.3.3.3");
  });

  it("handles IPv6 addresses", () => {
    const req = makeReq({ "x-forwarded-for": "::1" });
    expect(getClientIp(req)).toBe("::1");
  });

  it("falls back when x-forwarded-for is empty string", () => {
    const req = makeReq({ "x-forwarded-for": "" });
    Object.defineProperty(req.socket, "remoteAddress", { value: "10.10.10.10", configurable: true });
    expect(getClientIp(req)).toBe("10.10.10.10");
  });
});

// ─── checkRateLimit — allowed flow ──────────────────────────────

describe("checkRateLimit — allowed", () => {
  it("returns true for first request", () => {
    const req = makeReq({ "x-forwarded-for": "1.1.1.1" });
    const res = makeRes();
    expect(checkRateLimit(req, res)).toBe(true);
  });

  it("sets RateLimit-Limit header to default (60)", () => {
    const req = makeReq({ "x-forwarded-for": "2.2.2.2" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Limit")).toBe("60");
  });

  it("sets RateLimit-Remaining header after first request", () => {
    const req = makeReq({ "x-forwarded-for": "3.3.3.3" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("59");
  });

  it("uses authenticated limit (120) when opted in", () => {
    const req = makeReq({ "x-forwarded-for": "4.4.4.4" });
    const res = makeRes();
    checkRateLimit(req, res, { authenticated: true });
    expect(res.getHeader("RateLimit-Limit")).toBe("120");
    expect(res.getHeader("RateLimit-Remaining")).toBe("119");
  });

  it("decrements remaining with each request", () => {
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ "x-forwarded-for": "5.5.5.5" });
      const res = makeRes();
      checkRateLimit(req, res);
      if (i === 4) {
        expect(res.getHeader("RateLimit-Remaining")).toBe("55");
      }
    }
  });

  it("sets RateLimit-Reset header as integer seconds", () => {
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
  it("returns false after exceeding anonymous limit (60)", () => {
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

  it("returns false after exceeding authenticated limit (120)", () => {
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

  it("sets Retry-After header when blocked", () => {
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

  it("shows remaining as 0 when at or past limit", () => {
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
  it("tracks separate windows per IP", () => {
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
  it("clears all windows so an exhausted IP can request again", () => {
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
  it("exports correct window and request limits", () => {
    expect(LIMITS.WINDOW_MS).toBe(60_000);
    expect(LIMITS.DEFAULT_MAX).toBe(60);
    expect(LIMITS.AUTHENTICATED_MAX).toBe(120);
  });
});

// ─── Persistence ────────────────────────────────────────────────

describe("rate limiter persistence", () => {
  it("flushToDb writes in-memory state to rate_limits table", () => {
    const db = openMemoryDb();
    bindRateLimiterDb(db);

    // Make 5 requests from one IP
    for (let i = 0; i < 5; i++) {
      const req = makeReq({ "x-forwarded-for": "40.40.40.40" });
      const res = makeRes();
      checkRateLimit(req, res);
    }

    flushToDb();

    const row = db.prepare("SELECT count, reset_at FROM rate_limits WHERE client_key = ?").get("40.40.40.40") as { count: number; reset_at: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.count).toBe(5);
    expect(row!.reset_at).toBeGreaterThan(Date.now() - 1000);

    unbindRateLimiterDb();
    closeDb();
  });

  it("bindRateLimiterDb restores persisted entries on startup", () => {
    const db = openMemoryDb();

    // Manually insert a persisted rate limit entry into DB
    const futureReset = Date.now() + 60_000;
    db.prepare("INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)").run("50.50.50.50", 30, futureReset);

    bindRateLimiterDb(db);

    // The next request from that IP should continue from 30 (becomes 31)
    const req = makeReq({ "x-forwarded-for": "50.50.50.50" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("29"); // 60 - 31 = 29

    unbindRateLimiterDb();
    closeDb();
  });

  it("expired persisted entries are not loaded", () => {
    const db = openMemoryDb();

    // Insert an expired entry
    const pastReset = Date.now() - 1000;
    db.prepare("INSERT INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)").run("60.60.60.60", 58, pastReset);

    bindRateLimiterDb(db);

    // Should start fresh (not carry over 58 count)
    const req = makeReq({ "x-forwarded-for": "60.60.60.60" });
    const res = makeRes();
    checkRateLimit(req, res);
    expect(res.getHeader("RateLimit-Remaining")).toBe("59"); // 60 - 1 = 59

    unbindRateLimiterDb();
    closeDb();
  });

  it("flushToDb removes expired entries from database", () => {
    const db = openMemoryDb();
    bindRateLimiterDb(db);

    // Insert an already-expired entry
    const pastReset = Date.now() - 5000;
    db.prepare("INSERT OR REPLACE INTO rate_limits (client_key, count, reset_at) VALUES (?, ?, ?)").run("70.70.70.70", 10, pastReset);

    flushToDb();

    const row = db.prepare("SELECT * FROM rate_limits WHERE client_key = ?").get("70.70.70.70");
    expect(row).toBeUndefined();

    unbindRateLimiterDb();
    closeDb();
  });

  it("unbindRateLimiterDb flushes before disconnecting", () => {
    const db = openMemoryDb();
    bindRateLimiterDb(db);

    for (let i = 0; i < 3; i++) {
      const req = makeReq({ "x-forwarded-for": "80.80.80.80" });
      const res = makeRes();
      checkRateLimit(req, res);
    }

    unbindRateLimiterDb();

    // Data should have been flushed before unbind
    const row = db.prepare("SELECT count FROM rate_limits WHERE client_key = ?").get("80.80.80.80") as { count: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.count).toBe(3);

    closeDb();
  });

  it("works without persistence (no-op flush)", () => {
    // No db bound — flushToDb should be a no-op
    flushToDb();
    const req = makeReq({ "x-forwarded-for": "90.90.90.90" });
    const res = makeRes();
    expect(checkRateLimit(req, res)).toBe(true);
  });
});

// ─── getClientWindow ────────────────────────────────────────────

describe("getClientWindow", () => {
  it("returns zeroed window for unknown IP", () => {
    const w = getClientWindow("192.168.99.99");
    expect(w.count).toBe(0);
    expect(w.remaining).toBe(w.limit);
    expect(w.reset_at).toBe(0);
    expect(w.reset_in_seconds).toBe(0);
  });

  it("reflects active window for IP that has made requests", () => {
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

  it("applies authenticated limit when option is set", () => {
    const ip = "10.20.30.41";
    const req = makeReq({ "x-forwarded-for": ip });
    checkRateLimit(req, makeRes(), { authenticated: true });

    const w = getClientWindow(ip, { authenticated: true });
    expect(w.limit).toBe(LIMITS.AUTHENTICATED_MAX);
    expect(w.count).toBe(1);
  });
});
