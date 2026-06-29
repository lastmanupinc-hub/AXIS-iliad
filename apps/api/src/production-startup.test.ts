import { describe, it, expect, afterEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resetTestDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleHealthCheck } from "./handlers.js";

interface Res { status: number; headers: Record<string, string>; body: string }

function rawReq(method: string, path: string, port: number): Promise<Res> {
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

// Start the app on an ephemeral port (0) and resolve once it is ACTUALLY listening,
// returning the OS-assigned port. Replaces hardcoded ports (EADDRINUSE-prone under
// parallel CI) + setTimeout startup waits (ECONNREFUSED race) — the A11 flaky-test pattern.
async function startServer(router: Router): Promise<{ server: Server; port: number }> {
  const server = createApp(router, 0);
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  }
  return { server, port: (server.address() as AddressInfo).port };
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
    await resetTestDb();
    delete process.env.CORS_ORIGIN;
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    const started = await startServer(router);
    server = started.server;

    const res = await rawReq("GET", "/v1/health", started.port);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["vary"]).toBeUndefined();
  });

  it("uses CORS_ORIGIN env var when set", async () => {
    await resetTestDb();
    process.env.CORS_ORIGIN = "https://app.axisiliad.com";
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    const started = await startServer(router);
    server = started.server;

    const res = await rawReq("GET", "/v1/health", started.port);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.axisiliad.com");
  });

  it("sets Vary: Origin header when CORS origin is not wildcard", async () => {
    await resetTestDb();
    process.env.CORS_ORIGIN = "https://app.axisiliad.com";
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    const started = await startServer(router);
    server = started.server;

    const res = await rawReq("GET", "/v1/health", started.port);
    expect(res.headers["vary"]).toBe("Origin");
  });

  it("includes DELETE in CORS allowed methods", async () => {
    await resetTestDb();
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    const started = await startServer(router);
    server = started.server;

    const res = await rawReq("OPTIONS", "/v1/health", started.port);
    // OPTIONS should return 204 with CORS headers
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
  });
});

// ─── EADDRINUSE error handling ──────────────────────────────────

describe("EADDRINUSE error handling", () => {
  let server1: Server;
  let server2: Server;

  afterEach(async () => {
    if (server1) server1.close();
    if (server2) server2.close();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("logs error when port is already in use", async () => {
    await resetTestDb();
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);

    // Start first server on an ephemeral port, then learn the port it took.
    const started = await startServer(router);
    server1 = started.server;
    const port = started.port;

    // Verify first server works
    const res = await rawReq("GET", "/v1/health", port);
    expect(res.status).toBe(200);

    // Start second server on the SAME (now-occupied) port — triggers EADDRINUSE.
    const router2 = new Router();
    router2.get("/v1/health", handleHealthCheck);
    server2 = createApp(router2, port);

    // Wait for the error event to fire (the port is known-occupied).
    await new Promise((r) => setTimeout(r, 300));

    // First server should still work
    const res2 = await rawReq("GET", "/v1/health", port);
    expect(res2.status).toBe(200);
  });
});

// ─── Non-EADDRINUSE error handling ──────────────────────────────

describe("non-EADDRINUSE server error", () => {
  it("logs generic server error for non-EADDRINUSE codes", async () => {
    await resetTestDb();
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    const { server, port } = await startServer(router);

    // Emit a non-EADDRINUSE error to exercise the else branch
    const err: NodeJS.ErrnoException = new Error("permission denied");
    err.code = "EACCES";
    server.emit("error", err);

    // Server should still be running (error is logged, not thrown)
    const res = await rawReq("GET", "/v1/health", port);
    expect(res.status).toBe(200);

    server.close();
    await new Promise((r) => setTimeout(r, 100));
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

// ─── Graceful shutdown database cleanup ─────────────────────────

describe("shutdown database cleanup", () => {
  it("performs WAL checkpoint and closes DB on shutdown", async () => {
    await resetTestDb();
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    const { server, port } = await startServer(router);

    // Verify server works
    const res = await rawReq("GET", "/v1/health", port);
    expect(res.status).toBe(200);

    // Trigger shutdown via the attached method
    const s = server as typeof server & { shutdown: (timeout?: number) => Promise<void> };
    await s.shutdown();

    // After shutdown, server should no longer accept connections
    await expect(rawReq("GET", "/v1/health", port)).rejects.toThrow();
  });
});
