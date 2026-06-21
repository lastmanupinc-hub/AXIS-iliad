import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleHealthCheck } from "./handlers.js";
import { handleLiveness, handleReadiness, handleMetrics } from "./metrics.js";

let server: Server;
let testPort = 0;

interface Res { status: number; headers: Record<string, string>; body: string }

function rawReq(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method },
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
  const router = new Router();
  router.get("/v1/health", handleHealthCheck);
  router.get("/v1/health/live", handleLiveness);
  router.get("/v1/health/ready", handleReadiness);
  router.get("/v1/metrics", handleMetrics);
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  server.close();
  closeDb();
  await new Promise((r) => setTimeout(r, 100));
});

describe("GET /v1/health/live", () => {
  it("returns alive status", async () => {
    const res = await rawReq("GET", "/v1/health/live");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe("alive");
  });
});

describe("GET /v1/health/ready", () => {
  it("returns ready when DB is healthy", async () => {
    const res = await rawReq("GET", "/v1/health/ready");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe("ready");
    expect(data.checks.shutting_down).toBe(false);
    expect(data.checks.database).toBe("ok");
  });
});

describe("GET /v1/metrics", () => {
  it("returns Prometheus text format", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
  });

  it("includes uptime metric", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain("axis_uptime_seconds");
    expect(res.body).toContain("# TYPE axis_uptime_seconds gauge");
  });

  it("includes request counter", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain("axis_requests_total");
    expect(res.body).toContain("# TYPE axis_requests_total counter");
  });

  it("includes error counter", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain("axis_errors_total");
  });

  it("includes memory metrics", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain("axis_memory_rss_bytes");
    expect(res.body).toContain("axis_memory_heap_used_bytes");
    expect(res.body).toContain("axis_memory_heap_total_bytes");
  });

  it("includes database size metric", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain("axis_db_size_bytes");
  });

  it("includes table row counts", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain('axis_db_table_rows{table="projects"}');
    expect(res.body).toContain('axis_db_table_rows{table="snapshots"}');
    expect(res.body).toContain('axis_db_table_rows{table="accounts"}');
  });

  it("reports status bucket counts", async () => {
    // After several 200 requests, we should see 2xx bucket
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain('axis_http_responses_total{status="2xx"}');
  });
});
