import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleHealthCheck } from "./handlers.js";
import { resetRateLimits, LIMITS } from "./rate-limiter.js";

const TEST_PORT = 44531;
let server: Server;

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method: "GET", headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf-8");
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, body });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

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

describe("Rate-limit integration — HTTP 429", () => {
  it("returns 429 after exceeding anonymous limit", async () => {
    const max = LIMITS.DEFAULT_MAX;
    // Exhaust all allowed requests
    for (let i = 0; i < max; i++) {
      const r = await get("/v1/health", { "x-forwarded-for": "99.99.99.99" });
      expect(r.status).toBe(200);
    }
    // Next request should be 429
    const blocked = await get("/v1/health", { "x-forwarded-for": "99.99.99.99" });
    expect(blocked.status).toBe(429);
    const data = JSON.parse(blocked.body);
    expect(data.error_code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("sets correct RateLimit headers", async () => {
    const r = await get("/v1/health", { "x-forwarded-for": "50.50.50.50" });
    expect(r.status).toBe(200);
    expect(r.headers["ratelimit-limit"]).toBe(String(LIMITS.DEFAULT_MAX));
    expect(Number(r.headers["ratelimit-remaining"])).toBe(LIMITS.DEFAULT_MAX - 1);
    expect(Number(r.headers["ratelimit-reset"])).toBeGreaterThan(0);
  });

  it("different IPs have independent limits", async () => {
    const max = LIMITS.DEFAULT_MAX;
    // Exhaust IP A
    for (let i = 0; i < max; i++) {
      await get("/v1/health", { "x-forwarded-for": "1.1.1.1" });
    }
    const blockedA = await get("/v1/health", { "x-forwarded-for": "1.1.1.1" });
    expect(blockedA.status).toBe(429);

    // IP B should still be allowed
    const okB = await get("/v1/health", { "x-forwarded-for": "2.2.2.2" });
    expect(okB.status).toBe(200);
  });
});
