import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router, sendJSON, sendError } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleHealthCheck, handleCreateSnapshot } from "./handlers.js";
import { resetRateLimits, LIMITS } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

async function req(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = { "Content-Type": "application/json", ...headers };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers: reqHeaders },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  await resetTestDb();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/snapshots", handleCreateSnapshot);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Security headers ──────────────────────────────────────────

describe("security headers", () => {
  it("X-Content-Type-Options is nosniff on 200", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.status).toBe(200);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("X-Frame-Options is DENY", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["x-frame-options"]).toBe("DENY");
  });

  it("Content-Security-Policy is not set on JSON responses", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["content-security-policy"]).toBeUndefined();
  });

  it("Strict-Transport-Security is set", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("X-XSS-Protection is 0 (modern CSP signal)", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["x-xss-protection"]).toBe("0");
  });

  it("Referrer-Policy is strict-origin-when-cross-origin", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("Permissions-Policy is set", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["permissions-policy"]).toContain("camera=()");
  });

  it("security headers present on error responses too", async () => {
    const r = await req("GET", "/v1/nonexistent");
    expect(r.status).toBe(404);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("OPTIONS preflight includes security headers", async () => {
    const r = await req("OPTIONS", "/v1/health");
    expect(r.status).toBe(204);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
  });

  it("CORS headers coexist with security headers", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.headers["access-control-allow-origin"]).toBe("*");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });
});

// ─── Rate limiting ─────────────────────────────────────────────

describe("rate limiter", () => {
  it("includes RateLimit headers on normal responses", async () => {
    const r = await req("GET", "/v1/health");
    expect(r.status).toBe(200);
    expect(r.headers["ratelimit-limit"]).toBe(String(LIMITS.DEFAULT_MAX));
    expect(Number(r.headers["ratelimit-remaining"])).toBe(LIMITS.DEFAULT_MAX - 1);
    expect(Number(r.headers["ratelimit-reset"])).toBeGreaterThan(0);
  });

  it("remaining count decreases with each request", async () => {
    const r1 = await req("GET", "/v1/health");
    const r2 = await req("GET", "/v1/health");
    const remaining1 = Number(r1.headers["ratelimit-remaining"]);
    const remaining2 = Number(r2.headers["ratelimit-remaining"]);
    expect(remaining2).toBe(remaining1 - 1);
  });

  it("returns 429 after exceeding limit", async () => {
    // Exhaust the limit
    for (let i = 0; i < LIMITS.DEFAULT_MAX; i++) {
      await req("GET", "/v1/health");
    }
    // Next request should be blocked
    const r = await req("GET", "/v1/health");
    expect(r.status).toBe(429);
    const data = r.data as Record<string, unknown>;
    expect(data.error_code).toBe("RATE_LIMITED");
    expect(data.error).toBe("Too many requests");
    expect(data.retry_after).toBeTypeOf("number");
  });

  it("429 response includes Retry-After header", async () => {
    for (let i = 0; i < LIMITS.DEFAULT_MAX; i++) {
      await req("GET", "/v1/health");
    }
    const r = await req("GET", "/v1/health");
    expect(r.status).toBe(429);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("rate limit resets after window expires", async () => {
    // Fill to limit
    for (let i = 0; i < LIMITS.DEFAULT_MAX; i++) {
      await req("GET", "/v1/health");
    }
    const r1 = await req("GET", "/v1/health");
    expect(r1.status).toBe(429);

    // Reset simulates window expiry
    resetRateLimits();

    const r2 = await req("GET", "/v1/health");
    expect(r2.status).toBe(200);
    expect(Number(r2.headers["ratelimit-remaining"])).toBe(LIMITS.DEFAULT_MAX - 1);
  });

  it("429 responses also include security headers", async () => {
    for (let i = 0; i < LIMITS.DEFAULT_MAX; i++) {
      await req("GET", "/v1/health");
    }
    const r = await req("GET", "/v1/health");
    expect(r.status).toBe(429);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
  });
});
