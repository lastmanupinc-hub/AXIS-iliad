import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleHealthCheck, handleDbStats, handleDbMaintenance } from "./handlers.js";

let server: Server;
let testPort = 0;

interface Res { status: number; data: Record<string, unknown> }

function req(method: string, path: string, body?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload).toString();
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

beforeAll(async () => {
  openMemoryDb();
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.get("/v1/db/stats", handleDbStats);
  router.post("/v1/db/maintenance", handleDbMaintenance);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  server.close();
  closeDb();
  await new Promise((r) => setTimeout(r, 100));
});

describe("GET /v1/db/stats", () => {
  it("returns database stats with table counts", async () => {
    const res = await req("GET", "/v1/db/stats");
    expect(res.status).toBe(200);
    expect(res.data.action).toBe("db_stats");
    expect(res.data.success).toBe(true);
    const details = res.data.details as Record<string, unknown>;
    expect(typeof details.size_bytes).toBe("number");
    expect(typeof details.page_size).toBe("number");
    expect(typeof details.page_count).toBe("number");
    const tables = details.tables as Record<string, number>;
    expect(tables).toHaveProperty("projects");
    expect(tables).toHaveProperty("snapshots");
    expect(tables).toHaveProperty("accounts");
  });

  it("includes all expected tables", async () => {
    const res = await req("GET", "/v1/db/stats");
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

describe("POST /v1/db/maintenance", () => {
  it("runs all maintenance steps successfully", async () => {
    const res = await req("POST", "/v1/db/maintenance");
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const results = res.data.results as Array<{ action: string; success: boolean }>;
    expect(results).toHaveLength(4);
    expect(results[0].action).toBe("wal_checkpoint");
    expect(results[1].action).toBe("purge_stale");
    expect(results[2].action).toBe("vacuum");
    expect(results[3].action).toBe("integrity_check");
    for (const r of results) {
      expect(r.success).toBe(true);
    }
  });

  it("is idempotent — running twice is safe", async () => {
    const res1 = await req("POST", "/v1/db/maintenance");
    const res2 = await req("POST", "/v1/db/maintenance");
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.data.success).toBe(true);
    expect(res2.data.success).toBe(true);
  });
});
