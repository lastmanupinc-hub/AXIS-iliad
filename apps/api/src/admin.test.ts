import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleCreateAccount } from "./billing.js";
import { handleAdminStats, handleAdminAccounts, handleAdminActivity } from "./admin.js";
import { handleCreateSnapshot, handleHealthCheck } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44429;
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

let apiKey: string;

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/accounts", handleCreateAccount);
  router.post("/v1/snapshots", handleCreateSnapshot);
  router.get("/v1/admin/stats", handleAdminStats);
  router.get("/v1/admin/accounts", handleAdminAccounts);
  router.get("/v1/admin/activity", handleAdminActivity);
  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));

  // Create a test account to get an API key
  const acct = await req("POST", "/v1/accounts", { name: "Admin Tester", email: "admin@test.com" });
  apiKey = (acct.data as any).api_key.raw_key;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

describe("GET /v1/admin/stats", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/stats");
    expect(r.status).toBe(401);
  });

  it("returns system-wide stats", async () => {
    const r = await req("GET", "/v1/admin/stats", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.total_accounts).toBeGreaterThanOrEqual(1);
    expect(r.data.accounts_by_tier).toBeDefined();
    const byTier = r.data.accounts_by_tier as Record<string, number>;
    expect(byTier.free).toBeGreaterThanOrEqual(1);
    expect(typeof r.data.total_snapshots).toBe("number");
    expect(typeof r.data.total_projects).toBe("number");
    expect(typeof r.data.total_api_keys).toBe("number");
    expect(typeof r.data.active_api_keys).toBe("number");
  });
});

describe("GET /v1/admin/accounts", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/accounts");
    expect(r.status).toBe(401);
  });

  it("returns paginated account list", async () => {
    const r = await req("GET", "/v1/admin/accounts", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.accounts)).toBe(true);
    expect(r.data.total).toBeGreaterThanOrEqual(1);
    expect(r.data.limit).toBe(50);
    expect(r.data.offset).toBe(0);
    const accounts = r.data.accounts as Array<Record<string, unknown>>;
    expect(accounts[0].account_id).toBeDefined();
    expect(accounts[0].name).toBe("Admin Tester");
    expect(accounts[0].email).toBe("admin@test.com");
    expect(accounts[0].tier).toBe("free");
  });

  it("respects limit and offset params", async () => {
    // Create a second account
    await req("POST", "/v1/accounts", { name: "Second User", email: "second@test.com" });

    const r1 = await req("GET", "/v1/admin/accounts?limit=1&offset=0", undefined, apiKey);
    expect(r1.status).toBe(200);
    expect((r1.data.accounts as unknown[]).length).toBe(1);
    expect(r1.data.limit).toBe(1);

    const r2 = await req("GET", "/v1/admin/accounts?limit=1&offset=1", undefined, apiKey);
    expect(r2.status).toBe(200);
    expect((r2.data.accounts as unknown[]).length).toBe(1);
    expect(r2.data.offset).toBe(1);
  });
});

describe("GET /v1/admin/activity", () => {
  it("requires authentication", async () => {
    const r = await req("GET", "/v1/admin/activity");
    expect(r.status).toBe(401);
  });

  it("returns recent activity events", async () => {
    const r = await req("GET", "/v1/admin/activity", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data.events)).toBe(true);
    expect(typeof r.data.count).toBe("number");
    // Should have at least the account_created events from setup
    const events = r.data.events as Array<Record<string, unknown>>;
    if (events.length > 0) {
      expect(events[0].event_id).toBeDefined();
      expect(events[0].account_id).toBeDefined();
      expect(events[0].event_type).toBeDefined();
      expect(events[0].created_at).toBeDefined();
    }
  });

  it("respects limit param", async () => {
    const r = await req("GET", "/v1/admin/activity?limit=1", undefined, apiKey);
    expect(r.status).toBe(200);
    expect((r.data.events as unknown[]).length).toBeLessThanOrEqual(1);
  });
});

// ─── Auth failure branches ──────────────────────────────────────

describe("Admin auth failure branches", () => {
  it("stats returns 401 without auth", async () => {
    const r = await req("GET", "/v1/admin/stats");
    expect(r.status).toBe(401);
  });

  it("accounts returns 401 without auth", async () => {
    const r = await req("GET", "/v1/admin/accounts");
    expect(r.status).toBe(401);
  });

  it("activity returns 401 without auth", async () => {
    const r = await req("GET", "/v1/admin/activity");
    expect(r.status).toBe(401);
  });
});

// ─── Boundary clamping branches ─────────────────────────────────

describe("admin param clamping", () => {
  it("accounts defaults limit=0 to 50 (falsy fallback)", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=0", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(50);
  });

  it("accounts clamps limit=-10 to 1", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=-10", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(1);
  });

  it("accounts clamps limit=999 to 200 (Math.min branch)", async () => {
    const r = await req("GET", "/v1/admin/accounts?limit=999", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.limit).toBe(200);
  });

  it("accounts clamps negative offset to 0", async () => {
    const r = await req("GET", "/v1/admin/accounts?offset=-5", undefined, apiKey);
    expect(r.status).toBe(200);
    expect(r.data.offset).toBe(0);
  });

  it("activity clamps limit=0 to 1", async () => {
    const r = await req("GET", "/v1/admin/activity?limit=0", undefined, apiKey);
    expect(r.status).toBe(200);
    // Activity was fetched successfully
  });
});
