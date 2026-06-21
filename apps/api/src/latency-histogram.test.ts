import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import { handleMetrics, recordLatency, getLatencyStats, resetLatencyStats } from "./metrics.js";
import { handleLiveness } from "./metrics.js";

let testPort = 0;

// ─── Unit tests for histogram internals ─────────────────────────

describe("recordLatency — histogram bucketing", () => {
  beforeEach(() => {
    resetLatencyStats();
  });

  it("records a single latency observation", () => {
    recordLatency("GET", "/v1/health", 15);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/health");
    expect(entry).toBeDefined();
    expect(entry!.count).toBe(1);
    expect(entry!.sum).toBe(15);
  });

  it("accumulates multiple observations for same route", () => {
    recordLatency("GET", "/v1/health", 10);
    recordLatency("GET", "/v1/health", 20);
    recordLatency("GET", "/v1/health", 30);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/health");
    expect(entry!.count).toBe(3);
    expect(entry!.sum).toBe(60);
  });

  it("tracks separate routes independently", () => {
    recordLatency("GET", "/v1/health", 5);
    recordLatency("POST", "/v1/snapshots", 100);
    const stats = getLatencyStats();
    expect(stats.routes.size).toBe(2);
    expect(stats.routes.get("GET /v1/health")!.count).toBe(1);
    expect(stats.routes.get("POST /v1/snapshots")!.count).toBe(1);
  });

  it("places observation in correct histogram buckets", () => {
    // 15ms should be in buckets: 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, +Inf
    // But NOT in buckets: 5, 10
    recordLatency("GET", "/v1/test", 15);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/test")!;

    // Bucket indices: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
    //                  0   1   2   3   4    5    6    7     8     9     10
    expect(entry.buckets[0]).toBe(0);  // <=5ms: no
    expect(entry.buckets[1]).toBe(0);  // <=10ms: no
    expect(entry.buckets[2]).toBe(1);  // <=25ms: yes (smallest matching)
    expect(entry.buckets[3]).toBe(0);  // <=50ms: not stored (cumulated on output)
    expect(entry.buckets[4]).toBe(0);  // <=100ms: not stored
  });

  it("handles observation exactly on bucket boundary", () => {
    recordLatency("GET", "/v1/test", 10);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/test")!;
    expect(entry.buckets[0]).toBe(0);  // <=5ms: no
    expect(entry.buckets[1]).toBe(1);  // <=10ms: yes (exact boundary, smallest match)
    expect(entry.buckets[2]).toBe(0);  // <=25ms: not stored (cumulated on output)
  });

  it("handles very fast requests (< 5ms)", () => {
    recordLatency("GET", "/v1/test", 2);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/test")!;
    expect(entry.buckets[0]).toBe(1);  // <=5ms: yes
  });

  it("handles slow requests (> 10s)", () => {
    recordLatency("GET", "/v1/test", 15000);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/test")!;
    // None of the fixed buckets should match
    for (let i = 0; i < 11; i++) {
      expect(entry.buckets[i]).toBe(0);
    }
    // Overflow goes to +Inf bucket (index 11)
    expect(entry.buckets[11]).toBe(1);
    expect(entry.count).toBe(1);
  });

  it("normalizes UUIDs in paths to :id", () => {
    recordLatency("GET", "/v1/snapshots/a1b2c3d4-e5f6-7890-abcd-ef1234567890/context", 10);
    const stats = getLatencyStats();
    expect(stats.routes.has("GET /v1/snapshots/:id/context")).toBe(true);
  });

  it("normalizes multiple UUIDs in same path", () => {
    recordLatency("POST", "/v1/accounts/a1b2c3d4-e5f6-7890-abcd-ef1234567890/keys/b2c3d4e5-f6a7-8901-bcde-f12345678901/revoke", 10);
    const stats = getLatencyStats();
    expect(stats.routes.has("POST /v1/accounts/:id/keys/:id/revoke")).toBe(true);
  });

  it("strips query strings from route", () => {
    recordLatency("GET", "/v1/snapshots?since=2024-01-01&limit=10", 10);
    const stats = getLatencyStats();
    expect(stats.routes.has("GET /v1/snapshots")).toBe(true);
    expect(stats.routes.has("GET /v1/snapshots?since=2024-01-01&limit=10")).toBe(false);
  });

  it("groups same normalized routes together", () => {
    recordLatency("GET", "/v1/snapshots/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/context", 5);
    recordLatency("GET", "/v1/snapshots/11111111-2222-3333-4444-555555555555/context", 15);
    const stats = getLatencyStats();
    const entry = stats.routes.get("GET /v1/snapshots/:id/context");
    expect(entry!.count).toBe(2);
    expect(entry!.sum).toBe(20);
  });

  it("resetLatencyStats clears all data", () => {
    recordLatency("GET", "/v1/test", 10);
    recordLatency("POST", "/v1/other", 20);
    expect(getLatencyStats().routes.size).toBe(2);
    resetLatencyStats();
    expect(getLatencyStats().routes.size).toBe(0);
  });

  it("returns standard Prometheus bucket boundaries", () => {
    const stats = getLatencyStats();
    expect(stats.buckets).toEqual([5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
  });
});

// ─── HTTP integration: histogram appears in /v1/metrics ─────────

let server: Server;

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

describe("Latency histograms in /v1/metrics", () => {
  beforeAll(async () => {
    openMemoryDb();
    const router = new Router();
    router.get("/v1/health/live", handleLiveness);
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

  it("includes histogram HELP and TYPE headers after requests", async () => {
    // Make a request to generate latency data
    await rawReq("GET", "/v1/health/live");
    // Now check metrics
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.status).toBe(200);
    expect(res.body).toContain("# HELP axis_http_request_duration_ms");
    expect(res.body).toContain("# TYPE axis_http_request_duration_ms histogram");
  });

  it("includes bucket lines with le labels", async () => {
    await rawReq("GET", "/v1/health/live");
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain('axis_http_request_duration_ms_bucket{route="GET /v1/health/live",le="5"}');
    expect(res.body).toContain('axis_http_request_duration_ms_bucket{route="GET /v1/health/live",le="100"}');
    expect(res.body).toContain('axis_http_request_duration_ms_bucket{route="GET /v1/health/live",le="+Inf"}');
  });

  it("includes sum and count lines", async () => {
    await rawReq("GET", "/v1/health/live");
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain('axis_http_request_duration_ms_sum{route="GET /v1/health/live"}');
    expect(res.body).toContain('axis_http_request_duration_ms_count{route="GET /v1/health/live"}');
  });

  it("cumulative bucket counts are monotonically non-decreasing", async () => {
    const res = await rawReq("GET", "/v1/metrics");
    const bucketLines = res.body.split("\n").filter((l: string) =>
      l.includes("axis_http_request_duration_ms_bucket") && l.includes("GET /v1/health/live"),
    );

    const values = bucketLines.map((l: string) => {
      const match = l.match(/\}\s*(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });

    // Each bucket count should be >= the previous (cumulative)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("normalizes UUID routes in metrics output", async () => {
    // Seed a latency entry with UUID path
    recordLatency("GET", "/v1/snapshots/a1b2c3d4-e5f6-7890-abcd-ef1234567890/context", 10);
    const res = await rawReq("GET", "/v1/metrics");
    expect(res.body).toContain("GET /v1/snapshots/:id/context");
    expect(res.body).not.toContain("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
  });
});
