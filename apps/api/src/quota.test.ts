import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleCreateAccount, handleGetQuota } from "./billing.js";
import { handleHealthCheck } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44428;
let server: Server;

interface Res { status: number; headers: Record<string, string>; data: Record<string, unknown> }

async function req(
  method: string,
  path: string,
  body?: unknown,
  authKey?: string,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
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
    if (payload) r.write(payload);
    r.end();
  });
}

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/account/quota", handleGetQuota);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

describe("GET /v1/account/quota", () => {
  it("returns rate limit info for anonymous user", async () => {
    const r = await req("GET", "/v1/account/quota");
    expect(r.status).toBe(200);
    expect(r.data.authenticated).toBe(false);
    const rl = r.data.rate_limit as Record<string, unknown>;
    expect(rl.limit).toBe(60);
    expect(rl.remaining).toBeLessThanOrEqual(60);
    expect(typeof rl.count).toBe("number");
    expect(typeof rl.window_ms).toBe("number");
    // no resource_quota for anonymous
    expect(r.data.resource_quota).toBeUndefined();
  });

  it("returns higher limit for authenticated user", async () => {
    // create account and get key
    const acct = await req("POST", "/v1/accounts", { name: "Quota Tester", email: "quota-test@example.com" });
    expect(acct.status).toBe(201);
    const rawKey = (acct.data as any).api_key.raw_key;

    const r = await req("GET", "/v1/account/quota", undefined, rawKey);
    expect(r.status).toBe(200);
    expect(r.data.authenticated).toBe(true);
    const rl = r.data.rate_limit as Record<string, unknown>;
    expect(rl.limit).toBe(120);
    // authenticated users get resource_quota
    expect(r.data.resource_quota).toBeDefined();
    const rq = r.data.resource_quota as Record<string, unknown>;
    expect(rq.tier).toBe("free");
    expect(typeof rq.max_snapshots_per_month).toBe("number");
    expect(typeof rq.max_projects).toBe("number");
  });

  it("tracks request count across calls", async () => {
    // make a few requests then check count
    await req("GET", "/v1/health");
    await req("GET", "/v1/health");
    const r = await req("GET", "/v1/account/quota");
    expect(r.status).toBe(200);
    const rl = r.data.rate_limit as Record<string, unknown>;
    // count should be >= 3 (2 health + 1 quota)
    expect(rl.count).toBeGreaterThanOrEqual(3);
    expect(rl.remaining).toBeLessThanOrEqual(57);
  });

  it("includes standard rate limit response headers", async () => {
    const r = await req("GET", "/v1/account/quota");
    expect(r.headers["ratelimit-limit"]).toBeDefined();
    expect(r.headers["ratelimit-remaining"]).toBeDefined();
    expect(r.headers["ratelimit-reset"]).toBeDefined();
  });
});
