import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { resetRateLimits } from "./rate-limiter.js";

const TEST_PORT = 44490;
let appServer: Server & { shutdown?: (t?: number) => Promise<void> };

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
  data: unknown;
}

function req(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers: { "Content-Type": "application/json" } },
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
          resolve({ status: res.statusCode ?? 0, headers: h, body: raw, data });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

// ─── Server setup — dynamically import server.ts ────────────────

beforeAll(async () => {
  process.env.PORT = String(TEST_PORT);
  await resetTestDb();
  resetRateLimits();

  const mod = await import("./server.js");
  appServer = mod.app as Server & { shutdown?: (t?: number) => Promise<void> };
  // H-Phase-A cycle 19: a fixed 200ms sleep is the exact ECONNREFUSED-prone
  // pattern H1.1 already deflaked elsewhere (production-startup.test.ts) —
  // this file was apparently never updated to match. Wait for the ACTUAL
  // "listening" event instead of guessing a delay long enough for CI-load
  // conditions this test can't predict.
  if (!appServer.listening) {
    await new Promise<void>((resolve) => appServer.once("listening", () => resolve()));
  }
}, 300_000);

afterAll(async () => {
  if (appServer?.shutdown) await appServer.shutdown(2000);
  else appServer?.close();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── /v1/docs — OpenAPI spec (inline handler in server.ts) ──────

describe("/v1/docs — OpenAPI spec", () => {
  it("returns 200 with OpenAPI JSON", async () => {
    const res = await req("GET", "/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    const data = res.data as Record<string, unknown>;
    expect(data.openapi).toBe("3.1.0");
    expect(data.info).toBeDefined();
    expect(data.paths).toBeDefined();
  });

  it("has security headers on /v1/docs", async () => {
    const res = await req("GET", "/v1/docs");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});

// ─── /v1/programs — inline handler in server.ts ─────────────────

describe("/v1/programs — generator listing", () => {
  it("returns 200 with programs array", async () => {
    const res = await req("GET", "/v1/programs");
    expect(res.status).toBe(200);
    const data = res.data as Record<string, unknown>;
    expect(Array.isArray(data.programs)).toBe(true);
    expect(typeof data.total_generators).toBe("number");
  });

  it("each program has name, outputs, generator_count", async () => {
    const res = await req("GET", "/v1/programs");
    const data = res.data as Record<string, unknown>;
    const programs = data.programs as Array<Record<string, unknown>>;
    expect(programs.length).toBeGreaterThan(0);
    for (const p of programs) {
      expect(typeof p.name).toBe("string");
      expect(Array.isArray(p.outputs)).toBe(true);
      expect(typeof p.generator_count).toBe("number");
      expect(p.generator_count).toBe((p.outputs as unknown[]).length);
    }
  });

  it("total_generators matches sum of all program outputs", async () => {
    const res = await req("GET", "/v1/programs");
    const data = res.data as Record<string, unknown>;
    const programs = data.programs as Array<Record<string, unknown>>;
    const sum = programs.reduce((s, p) => s + (p.generator_count as number), 0);
    expect(data.total_generators).toBe(sum);
  });
});

// ─── Verify all route registrations are accessible ──────────────

describe("Server route wiring", () => {
  it("health endpoint wired", async () => {
    const res = await req("GET", "/v1/health");
    expect(res.status).toBe(200);
  });

  it("liveness endpoint wired", async () => {
    const res = await req("GET", "/v1/health/live");
    expect(res.status).toBe(200);
  });

  it("readiness endpoint wired", async () => {
    const res = await req("GET", "/v1/health/ready");
    expect(res.status).toBe(200);
  });

  it("metrics endpoint wired", async () => {
    const res = await req("GET", "/v1/metrics");
    expect(res.status).toBe(200);
  });

  it("plans endpoint wired", async () => {
    const res = await req("GET", "/v1/plans");
    expect(res.status).toBe(200);
  });

  it("GET account-creation endpoints return 405 with guidance", async () => {
    const versioned = await req("GET", "/v1/accounts");
    expect(versioned.status).toBe(405);
    const versionedData = versioned.data as Record<string, unknown>;
    expect(versionedData.error).toBe("Method not allowed");
    expect(versionedData.message).toBe("POST /v1/accounts (or POST /accounts) creates an account. To read the authenticated caller's own account, use GET /v1/account (singular) with Authorization: Bearer <api_key> instead.");
    expect(versionedData.see_also).toBe("/v1/account");

    const unversioned = await req("GET", "/accounts");
    expect(unversioned.status).toBe(405);
    const unversionedData = unversioned.data as Record<string, unknown>;
    expect(unversionedData.error).toBe("Method not allowed");
  });

  // Bug report (2026-07): production logs showed real 404s on these two paths.
  // RFC 8414/RFC 9728 path-insertion means a spec-compliant MCP client resolves
  // OAuth discovery RELATIVE TO the resource URL (/mcp), not just site-root.
  it("OAuth discovery is also served mounted under /mcp (RFC 8414/9728 path-insertion)", async () => {
    const authServer = await req("GET", "/mcp/.well-known/oauth-authorization-server");
    expect(authServer.status).toBe(200);
    expect((authServer.data as Record<string, unknown>).issuer).toBeTruthy();

    const protectedResource = await req("GET", "/mcp/.well-known/oauth-protected-resource");
    expect(protectedResource.status).toBe(200);
    expect((protectedResource.data as Record<string, unknown>).resource).toBeTruthy();
  });

  it("unknown route returns 404", async () => {
    const res = await req("GET", "/v1/nonexistent");
    expect(res.status).toBe(404);
  });
});
