import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleCreateAccount } from "./billing.js";
import { handleHealthCheck, handleDbStats, handleDbMaintenance } from "./handlers.js";
import { resetRateLimits } from "./rate-limiter.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

function req(method: string, path: string, body?: unknown, authKey?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload).toString();
    if (authKey) headers["Authorization"] = `Bearer ${authKey}`;
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method, headers },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          resolve({ status: res.statusCode ?? 0, data: data as Record<string, unknown> });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// /v1/db/stats and /v1/db/maintenance are admin-only (they leak schema/sizes and run
// privileged maintenance). requireAdmin needs a valid account key that ALSO equals
// ADMIN_API_KEY, so we mint an account and pin its raw key as the admin key.
let adminKey: string;
let nonAdminKey: string;

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.post("/v1/accounts", handleCreateAccount);
  router.get("/v1/db/stats", handleDbStats);
  router.post("/v1/db/maintenance", handleDbMaintenance);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;

  const acct = await req("POST", "/v1/accounts", { name: "DB Admin", email: "db-admin@test.com" });
  adminKey = (acct.data as { api_key: { raw_key: string } }).api_key.raw_key;
  process.env.ADMIN_API_KEY = adminKey;

  const acct2 = await req("POST", "/v1/accounts", { name: "DB Regular", email: "db-regular@test.com" });
  nonAdminKey = (acct2.data as { api_key: { raw_key: string } }).api_key.raw_key;
});

afterAll(async () => {
  delete process.env.ADMIN_API_KEY;
  server.close();
  await new Promise((r) => setTimeout(r, 100));
});

beforeEach(() => {
  resetRateLimits();
});

describe("GET /v1/db/stats (admin-only)", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await req("GET", "/v1/db/stats");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin account with 403", async () => {
    const res = await req("GET", "/v1/db/stats", undefined, nonAdminKey);
    expect(res.status).toBe(403);
  });

  it("returns database stats with table counts for an admin", async () => {
    const res = await req("GET", "/v1/db/stats", undefined, adminKey);
    expect(res.status).toBe(200);
    expect(res.data.action).toBe("stats");
    expect(res.data.success).toBe(true);
    const details = res.data.details as Record<string, unknown>;
    expect(typeof details.size_bytes).toBe("number");
    expect(typeof details.table_count).toBe("number");
    expect(typeof details.schema_version).toBe("number");
    const tables = details.tables as Record<string, number>;
    expect(tables).toHaveProperty("projects");
    expect(tables).toHaveProperty("snapshots");
    expect(tables).toHaveProperty("accounts");
  });

  it("includes all expected tables", async () => {
    const res = await req("GET", "/v1/db/stats", undefined, adminKey);
    const tables = (res.data.details as Record<string, unknown>).tables as Record<string, number>;
    const expectedTables = [
      "projects", "snapshots", "context_maps", "repo_profiles",
      "generator_results", "accounts", "api_keys", "program_entitlements",
      "usage_records", "seats", "funnel_events", "rate_limits", "search_index",
      "schema_migrations",
    ];
    for (const t of expectedTables) {
      expect(tables).toHaveProperty(t);
    }
  });
});

describe("POST /v1/db/maintenance (admin-only)", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await req("POST", "/v1/db/maintenance");
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin account with 403", async () => {
    const res = await req("POST", "/v1/db/maintenance", undefined, nonAdminKey);
    expect(res.status).toBe(403);
  });

  it("runs all maintenance steps successfully for an admin", async () => {
    const res = await req("POST", "/v1/db/maintenance", undefined, adminKey);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const results = res.data.results as Array<{ action: string; success: boolean }>;
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("analyze");
    for (const r of results) {
      expect(r.success).toBe(true);
    }
  });

  it("is idempotent — running twice is safe", async () => {
    const res1 = await req("POST", "/v1/db/maintenance", undefined, adminKey);
    const res2 = await req("POST", "/v1/db/maintenance", undefined, adminKey);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.data.success).toBe(true);
    expect(res2.data.success).toBe(true);
  });
});
