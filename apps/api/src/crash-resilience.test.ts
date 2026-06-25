import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
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
          for (const [k, v] of Object.entries(res.headers)) h[k] = String(v);
          resolve({ status: res.statusCode ?? 0, headers: h, body });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

function healthRouter(): Router {
  const r = new Router();
  r.get("/v1/health", handleHealthCheck);
  return r;
}

// Bind on an EPHEMERAL port (0) and AWAIT 'listening' before any request — a hardcoded
// port races other workers/leftovers (EADDRINUSE) and the unawaited async listen() caused
// intermittent ECONNREFUSED. The OS-assigned port is returned for the request.
async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => (server.listening ? resolve() : server.once("listening", () => resolve())));
  return (server.address() as AddressInfo).port;
}

describe("crash-resilience: keep-alive tuning + process error handlers", () => {
  let server: Server | undefined;

  beforeAll(async () => {
    await resetTestDb();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server?.listening) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });

  // ─── Keep-alive timeout tuning ────────────────────────────────

  it("sets keepAliveTimeout/headersTimeout to the 65000/70000 defaults when env not set", async () => {
    server = createApp(healthRouter(), 0);
    await listen(server);
    expect(server.keepAliveTimeout).toBe(65000);
    expect(server.headersTimeout).toBe(70000);
  });

  it("server responds to requests with keep-alive tuning active", async () => {
    server = createApp(healthRouter(), 0);
    const port = await listen(server);
    const res = await rawReq("GET", "/v1/health", port);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).status).toBe("ok");
  });

  it("reads KEEP_ALIVE_TIMEOUT_MS from env", async () => {
    vi.stubEnv("KEEP_ALIVE_TIMEOUT_MS", "30000");
    server = createApp(healthRouter(), 0);
    await listen(server);
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

  it("uncaughtException handler is NOT registered in test environment", async () => {
    expect(process.env.VITEST).toBe("true");
    const countBefore = process.listenerCount("uncaughtException");
    server = createApp(healthRouter(), 0);
    await listen(server);
    const countAfter = process.listenerCount("uncaughtException");
    expect(countAfter).toBe(countBefore); // no new listener added in test env
  });
});
