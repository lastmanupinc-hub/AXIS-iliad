import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb, createAccount, createApiKey } from "@axis/snapshots";
import { Router, createApp, isShuttingDown } from "./router.js";
import { handleHealthCheck } from "./handlers.js";
import { resetRateLimits, LIMITS } from "./rate-limiter.js";

const TEST_PORT = 44411;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

function req(method: string, path: string, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers },
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
          resolve({ status: res.statusCode ?? 0, headers: h, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(() => {
  server?.close();
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Authenticated rate-limit differentiation ───────────────────

describe("Authenticated rate-limit wiring", () => {
  it("anonymous requests get 60 req/min limit header", async () => {
    const res = await req("GET", "/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe(String(LIMITS.DEFAULT_MAX));
  });

  it("authenticated requests get 120 req/min limit header", async () => {
    const acct = createAccount("RateTest", "rate@example.com");
    const key = createApiKey(acct.account_id, "rate-test-key");

    const res = await req("GET", "/v1/health", key.rawKey);
    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe(String(LIMITS.AUTHENTICATED_MAX));
  });

  it("anonymous user hits 429 at 60 but authenticated would not", async () => {
    // Burn through 60 anonymous requests
    for (let i = 0; i < LIMITS.DEFAULT_MAX; i++) {
      await req("GET", "/v1/health");
    }

    // 61st anonymous request should be rate limited
    const blocked = await req("GET", "/v1/health");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();

    // Reset and test that authenticated user at the same request count would NOT be blocked
    resetRateLimits();
    const acct = createAccount("AuthLimit", "auth-limit@example.com");
    const key = createApiKey(acct.account_id, "auth-limit-key");

    for (let i = 0; i < LIMITS.DEFAULT_MAX; i++) {
      await req("GET", "/v1/health", key.rawKey);
    }

    // 61st request with auth should still be allowed (limit is 120)
    const allowed = await req("GET", "/v1/health", key.rawKey);
    expect(allowed.status).toBe(200);
    expect(allowed.headers["ratelimit-remaining"]).toBeDefined();
    expect(parseInt(allowed.headers["ratelimit-remaining"], 10)).toBe(LIMITS.AUTHENTICATED_MAX - LIMITS.DEFAULT_MAX - 1);
  });

  it("invalid API key gets anonymous rate limit", async () => {
    const res = await req("GET", "/v1/health", "invalid-key-12345");
    expect(res.status).toBe(200);
    // Invalid key should be treated as anonymous for rate limiting
    expect(res.headers["ratelimit-limit"]).toBe(String(LIMITS.DEFAULT_MAX));
  });
});

// ─── Health endpoint readiness ──────────────────────────────────

describe("Health endpoint readiness", () => {
  it("returns ok status when server is running", async () => {
    const res = await req("GET", "/v1/health");
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("ok");
    expect(res.data.service).toBe("axis-api");
    expect(res.data.version).toBeDefined();
    expect(res.data.timestamp).toBeDefined();
  });

  it("isShuttingDown returns false during normal operation", () => {
    expect(isShuttingDown()).toBe(false);
  });
});

// ─── Graceful shutdown ──────────────────────────────────────────

describe("Graceful shutdown", () => {
  it("server has shutdown method attached", () => {
    expect((server as unknown as Record<string, unknown>).shutdown).toBeTypeOf("function");
  });

  it("shutdown drains and closes cleanly", async () => {
    // Create a separate server for shutdown testing so we don't break other tests
    const shutdownRouter = new Router();
    shutdownRouter.get("/v1/health", handleHealthCheck);
    const shutdownPort = 44412;
    const shutdownServer = createApp(shutdownRouter, shutdownPort);
    await new Promise<void>((r) => setTimeout(r, 100));

    // Verify it's responding
    const before = await new Promise<number>((resolve, reject) => {
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: shutdownPort, path: "/v1/health", method: "GET" },
        (res: import("node:http").IncomingMessage) => {
          res.on("data", () => {});
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      r.on("error", reject);
      r.end();
    });
    expect(before).toBe(200);

    // Trigger shutdown
    const fn = (shutdownServer as unknown as Record<string, (t?: number) => Promise<void>>).shutdown;
    await fn(2000);

    // Server should reject new connections
    const afterErr = await new Promise<string>((resolve) => {
      const r = require("node:http").request(
        { hostname: "127.0.0.1", port: shutdownPort, path: "/v1/health", method: "GET" },
        () => resolve("connected"),
      );
      r.on("error", (err: Error) => resolve(err.message));
      r.end();
    });
    expect(afterErr).not.toBe("connected");
  });
});
