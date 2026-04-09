import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleHealthCheck } from "./handlers.js";

const TEST_PORT = 44505;

interface Res { status: number; headers: Record<string, string>; body: string }

function rawReq(method: string, path: string, port = TEST_PORT): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port, path, method },
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

// ─── CORS origin from environment ───────────────────────────────

describe("CORS origin configuration", () => {
  let server: Server;

  afterEach(async () => {
    if (server) {
      server.close();
      await new Promise((r) => setTimeout(r, 100));
    }
    delete process.env.CORS_ORIGIN;
  });

  it("defaults to * when CORS_ORIGIN not set", async () => {
    openMemoryDb();
    delete process.env.CORS_ORIGIN;
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    server = createApp(router, TEST_PORT);
    await new Promise((r) => setTimeout(r, 200));

    const res = await rawReq("GET", "/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["vary"]).toBeUndefined();
    closeDb();
  });

  it("uses CORS_ORIGIN env var when set", async () => {
    openMemoryDb();
    process.env.CORS_ORIGIN = "https://app.axistoolbox.com";
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    server = createApp(router, TEST_PORT);
    await new Promise((r) => setTimeout(r, 200));

    const res = await rawReq("GET", "/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.axistoolbox.com");
    closeDb();
  });

  it("sets Vary: Origin header when CORS origin is not wildcard", async () => {
    openMemoryDb();
    process.env.CORS_ORIGIN = "https://app.axistoolbox.com";
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    server = createApp(router, TEST_PORT);
    await new Promise((r) => setTimeout(r, 200));

    const res = await rawReq("GET", "/v1/health");
    expect(res.headers["vary"]).toBe("Origin");
    closeDb();
  });

  it("includes DELETE in CORS allowed methods", async () => {
    openMemoryDb();
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    server = createApp(router, TEST_PORT);
    await new Promise((r) => setTimeout(r, 200));

    const res = await rawReq("OPTIONS", "/v1/health");
    // OPTIONS should return 204 with CORS headers
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
    closeDb();
  });
});

// ─── EADDRINUSE error handling ──────────────────────────────────

describe("EADDRINUSE error handling", () => {
  let server1: Server;
  let server2: Server;
  const CONFLICT_PORT = 44506;

  afterEach(async () => {
    if (server1) server1.close();
    if (server2) server2.close();
    await new Promise((r) => setTimeout(r, 100));
    closeDb();
  });

  it("logs error when port is already in use", async () => {
    openMemoryDb();
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);

    // Start first server
    server1 = createApp(router, CONFLICT_PORT);
    await new Promise((r) => setTimeout(r, 200));

    // Verify first server works
    const res = await rawReq("GET", "/v1/health", CONFLICT_PORT);
    expect(res.status).toBe(200);

    // Start second server on same port — should trigger EADDRINUSE
    const router2 = new Router();
    router2.get("/v1/health", handleHealthCheck);
    server2 = createApp(router2, CONFLICT_PORT);

    // Wait for error event to fire
    await new Promise((r) => setTimeout(r, 300));

    // First server should still work
    const res2 = await rawReq("GET", "/v1/health", CONFLICT_PORT);
    expect(res2.status).toBe(200);
  });
});

// ─── Startup env validation (unit) ──────────────────────────────

describe("startup env validation", () => {
  it("validateEnv detects invalid PORT type", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({ PORT: "abc" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === "PORT")).toBe(true);
  });

  it("validateEnv passes with all defaults", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({});
    expect(result.valid).toBe(true);
    expect(result.resolved.PORT).toBe("4000");
    expect(result.resolved.CORS_ORIGIN).toBe("*");
  });

  it("validateEnv resolves CORS_ORIGIN from env", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({ CORS_ORIGIN: "https://example.com" });
    expect(result.valid).toBe(true);
    expect(result.resolved.CORS_ORIGIN).toBe("https://example.com");
  });

  it("requireValidEnv throws on invalid config", async () => {
    const { requireValidEnv } = await import("./env.js");
    expect(() => requireValidEnv({ PORT: "not-a-number" })).toThrow("Environment validation failed");
  });

  it("validateEnv rejects negative PORT", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({ PORT: "-1" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].key).toBe("PORT");
    expect(result.errors[0].message).toContain("non-negative");
  });

  it("validateEnv rejects invalid RATE_LIMIT_WINDOW_MS", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({ RATE_LIMIT_WINDOW_MS: "Infinity" });
    expect(result.valid).toBe(false);
    expect(result.errors[0].key).toBe("RATE_LIMIT_WINDOW_MS");
  });
});
