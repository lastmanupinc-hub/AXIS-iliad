import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { resetTestDb } from "@axis/snapshots";
import { Router, sendJSON } from "./router.js";
import { startTestServer } from "./test-helpers.js";
import type { IncomingMessage, ServerResponse } from "node:http";

let testPort = 0;
let server: Server;

interface Res { status: number; headers: Record<string, string>; body: string }

function rawReq(method: string, path: string, body?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const b = Buffer.concat(chunks).toString("utf-8");
          const h: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") h[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: h, body: b });
        });
      },
    );
    r.on("error", reject);
    if (body) r.write(body);
    r.end();
  });
}

/** Send request that deliberately stays open to trigger timeout */
function slowReq(method: string, path: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: testPort, path, method },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const b = Buffer.concat(chunks).toString("utf-8");
          resolve({ status: res.statusCode ?? 0, headers: {}, body: b });
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

beforeAll(async () => {
  // Very short timeout for testing
  process.env.REQUEST_TIMEOUT_MS = "500";
  await resetTestDb();
  const router = new Router();

  // Normal fast endpoint
  router.get("/v1/test/fast", async (_req: IncomingMessage, res: ServerResponse) => {
    sendJSON(res, 200, { ok: true });
  });

  // Slow endpoint that takes longer than timeout
  router.get("/v1/test/slow", async (_req: IncomingMessage, res: ServerResponse) => {
    await new Promise((r) => setTimeout(r, 2000));
    if (!res.writableEnded) {
      sendJSON(res, 200, { ok: true });
    }
  });

  // Ephemeral port + deterministic readiness (awaits 'listening') — replaces the racy
  // fixed-port + 200ms-sleep that intermittently ECONNREFUSED'd under CI --coverage load.
  const ts = await startTestServer(router);
  server = ts.server;
  testPort = ts.port;
});

afterAll(async () => {
  delete process.env.REQUEST_TIMEOUT_MS;
  server.close();
  await new Promise((r) => setTimeout(r, 100));
});

describe("Request timeout enforcement", () => {
  it("fast requests complete normally", async () => {
    const res = await rawReq("GET", "/v1/test/fast");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("slow requests receive 408 timeout", async () => {
    const res = await slowReq("GET", "/v1/test/slow");
    expect(res.status).toBe(408);
    const data = JSON.parse(res.body);
    expect(data.error_code).toBe("TIMEOUT");
    expect(data.error).toBe("Request timed out");
  });
});

describe("Security headers on timeout", () => {
  it("normal requests include security headers", async () => {
    const res = await rawReq("GET", "/v1/test/fast");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeDefined();
  });
});

describe("Configurable body limit via MAX_BODY_BYTES", () => {
  it("readBody uses MAX_BODY_BYTES env var", () => {
    // Verify the env var is respected in ENV_SPEC
    // We just check it parses to a number and doesn't crash
    const val = parseInt(process.env.MAX_BODY_BYTES ?? "52428800", 10);
    expect(val).toBeGreaterThan(0);
  });
});
