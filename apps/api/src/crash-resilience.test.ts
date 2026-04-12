import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp } from "./router.js";
import { handleHealthCheck } from "./handlers.js";

const TEST_PORT = 44530;

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
          for (const [k, v] of Object.entries(res.headers)) h[k] = String(v);
          resolve({ status: res.statusCode ?? 0, headers: h, body });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("crash-resilience: keep-alive tuning + process error handlers", () => {
  let server: Server & { shutdown?: (t?: number) => Promise<void> };

  beforeAll(() => {
    openMemoryDb();
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((r) => server.close(() => r()));
    }
    closeDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ─── Keep-alive timeout tuning ────────────────────────────────

  it("sets keepAliveTimeout to default 65000ms when env not set", () => {
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    server = createApp(router, TEST_PORT);
    expect(server.keepAliveTimeout).toBe(65000);
  });

  it("sets headersTimeout to keepAliveTimeout + 5000ms", () => {
    expect(server.headersTimeout).toBe(70000);
  });

  it("server responds to requests with keep-alive tuning active", async () => {
    const res = await rawReq("GET", "/v1/health");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
  });

  it("reads KEEP_ALIVE_TIMEOUT_MS from env", async () => {
    // Shutdown the default server first
    await new Promise<void>((r) => server.close(() => r()));

    vi.stubEnv("KEEP_ALIVE_TIMEOUT_MS", "30000");
    const router = new Router();
    router.get("/v1/health", handleHealthCheck);
    server = createApp(router, TEST_PORT);

    expect(server.keepAliveTimeout).toBe(30000);
    expect(server.headersTimeout).toBe(35000);
  });

  // ─── Env spec includes KEEP_ALIVE_TIMEOUT_MS ─────────────────

  it("KEEP_ALIVE_TIMEOUT_MS is in ENV_SPEC", async () => {
    const { ENV_SPEC } = await import("./env.js");
    const spec = ENV_SPEC.find((s) => s.key === "KEEP_ALIVE_TIMEOUT_MS");
    expect(spec).toBeDefined();
    expect(spec!.type).toBe("number");
    expect(spec!.default).toBe("65000");
    expect(spec!.required).toBe(false);
  });

  it("validateEnv accepts KEEP_ALIVE_TIMEOUT_MS as valid number", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({ KEEP_ALIVE_TIMEOUT_MS: "45000" });
    expect(result.valid).toBe(true);
    expect(result.resolved.KEEP_ALIVE_TIMEOUT_MS).toBe("45000");
  });

  it("validateEnv rejects non-numeric KEEP_ALIVE_TIMEOUT_MS", async () => {
    const { validateEnv } = await import("./env.js");
    const result = validateEnv({ KEEP_ALIVE_TIMEOUT_MS: "abc" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.key === "KEEP_ALIVE_TIMEOUT_MS")).toBe(true);
  });

  // ─── Crash handler registration ──────────────────────────────

  it("uncaughtException handler is NOT registered in test environment", () => {
    // In test environment, crash handlers are skipped (guarded by NODE_ENV/VITEST check)
    // Verify by checking that our process doesn't have the axis crash handlers
    // (The guard is: process.env.NODE_ENV !== "test" && process.env.VITEST !== "true")
    // Since we're running under vitest, these should not be registered
    const listeners = process.listeners("uncaughtException");
    // The axis handler would call log("error", "uncaught_exception", ...)
    // In tests, no axis-specific listener should be present
    // (vitest has its own, but not the shutdown-triggering one)
    expect(process.env.VITEST).toBe("true");
    // Verify the guard condition works: no extra listeners from createApp
    const countBefore = process.listenerCount("uncaughtException");
    const router2 = new Router();
    // Use a different port to avoid EADDRINUSE
    const s2 = createApp(router2, TEST_PORT + 1);
    const countAfter = process.listenerCount("uncaughtException");
    expect(countAfter).toBe(countBefore); // no new listener added in test env
    s2.close();
  });

  it("unhandledRejection handler is NOT registered in test environment", () => {
    const countBefore = process.listenerCount("unhandledRejection");
    const router3 = new Router();
    const s3 = createApp(router3, TEST_PORT + 2);
    const countAfter = process.listenerCount("unhandledRejection");
    expect(countAfter).toBe(countBefore);
    s3.close();
  });

  it("SIGTERM handler is NOT registered in test environment", () => {
    const countBefore = process.listenerCount("SIGTERM");
    const router4 = new Router();
    const s4 = createApp(router4, TEST_PORT + 3);
    const countAfter = process.listenerCount("SIGTERM");
    expect(countAfter).toBe(countBefore);
    s4.close();
  });

  // ─── headersTimeout > keepAliveTimeout invariant ──────────────

  it("headersTimeout always exceeds keepAliveTimeout by 5000ms", async () => {
    await new Promise<void>((r) => server.close(() => r()));

    vi.stubEnv("KEEP_ALIVE_TIMEOUT_MS", "10000");
    const router = new Router();
    server = createApp(router, TEST_PORT);
    expect(server.headersTimeout - server.keepAliveTimeout).toBe(5000);
  });
});
