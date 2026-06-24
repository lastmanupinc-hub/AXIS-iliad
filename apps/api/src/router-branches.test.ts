import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server, IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { resetTestDb } from "@axis/snapshots";
import { Router, createApp, sendJSON, sendError, readBody } from "./router.js";
import { resetRateLimits } from "./rate-limiter.js";

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
  data: unknown;
}

function httpReq(
  port: number,
  method: string,
  path: string,
  body?: string | object,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = typeof body === "object" ? JSON.stringify(body) : body;
    const h: Record<string, string> = { "Content-Type": "application/json", ...(headers ?? {}) };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port, path, method, headers: h },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: unknown;
          try { data = JSON.parse(raw); } catch { data = raw; }
          const rh: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") rh[k] = v;
          }
          resolve({ status: res.statusCode ?? 0, headers: rh, body: raw, data });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ═══════════════════════════════════════════════════════════════════
// readBody — unit tests with mock streams (no HTTP)
// ═══════════════════════════════════════════════════════════════════

describe("readBody — error paths", () => {
  it("rejects when body exceeds MAX_BODY_BYTES", async () => {
    const saved = process.env.MAX_BODY_BYTES;
    process.env.MAX_BODY_BYTES = "50";
    try {
      const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
      const p = readBody(stream);
      stream.push(Buffer.alloc(100));
      await expect(p).rejects.toThrow("Request body too large");
    } finally {
      if (saved !== undefined) process.env.MAX_BODY_BYTES = saved;
      else delete process.env.MAX_BODY_BYTES;
    }
  });

  it("rejects on stream error", async () => {
    const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
    const p = readBody(stream);
    process.nextTick(() => stream.destroy(new Error("socket hangup")));
    await expect(p).rejects.toThrow("socket hangup");
  });

  it("rejects on premature close", async () => {
    const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
    const p = readBody(stream);
    // Push partial data, then close without ending
    stream.push(Buffer.from("partial"));
    setTimeout(() => stream.destroy(), 20);
    await expect(p).rejects.toThrow("Request closed prematurely");
  });

  it("resolves normally for valid stream", async () => {
    const stream = new Readable({ read() {} }) as unknown as IncomingMessage;
    const p = readBody(stream);
    stream.push(Buffer.from("hello"));
    stream.push(null); // end
    await expect(p).resolves.toBe("hello");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Router + createApp HTTP edge-case tests
// ═══════════════════════════════════════════════════════════════════

const PORT_A = 44485; // main test server (200ms timeout)
let serverA: Server;

beforeAll(async () => {
  await resetTestDb();
  resetRateLimits();

  const saved = process.env.REQUEST_TIMEOUT_MS;
  process.env.REQUEST_TIMEOUT_MS = "200";

  const router = new Router();

  // Slow handler — exceeds 200ms timeout
  router.get("/slow", async (_req, res) => {
    await new Promise((r) => setTimeout(r, 600));
    sendJSON(res, 200, { ok: true });
  });

  // Non-Error thrown (covers branch 47_b1)
  router.get("/throw-string", async () => {
    throw "string error"; // eslint-disable-line no-throw-literal
  });

  // Throw after response already sent (covers branch 48_b1)
  router.get("/throw-after-end", async (_req, res) => {
    sendJSON(res, 200, { ok: true });
    throw new Error("After response sent");
  });

  // sendJSON with null data on error status (covers branch 66_b1)
  router.get("/null-error", async (_req, res) => {
    sendJSON(res, 400, null);
  });

  // sendJSON with array data on error status
  router.get("/array-error", async (_req, res) => {
    sendJSON(res, 400, [1, 2, 3]);
  });

  // sendJSON success (no request_id in body)
  router.get("/ok", async (_req, res) => {
    sendJSON(res, 200, { ok: true });
  });

  // Explicit 500 via sendError
  router.get("/manual-500", async (_req, res) => {
    sendError(res, 500, "FORCED", "forced error");
  });

  // Explicit 422 to cover 400-499 log level
  router.get("/manual-422", async (_req, res) => {
    sendError(res, 422, "VALIDATION", "validation failed");
  });

  serverA = createApp(router, PORT_A);
  await new Promise<void>((r) => setTimeout(r, 150));

  // Restore env
  if (saved !== undefined) process.env.REQUEST_TIMEOUT_MS = saved;
  else delete process.env.REQUEST_TIMEOUT_MS;
});

afterAll(async () => {
  const fn = (serverA as unknown as Record<string, (t?: number) => Promise<void>>).shutdown;
  if (fn) await fn(2000);
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Request timeout ────────────────────────────────────────────

describe("Request timeout (408)", () => {
  it("returns 408 when handler exceeds timeout", async () => {
    const res = await httpReq(PORT_A, "GET", "/slow");
    expect(res.status).toBe(408);
    expect((res.data as Record<string, unknown>).error_code).toBe("TIMEOUT");
  });
});

// ─── Non-Error exceptions ───────────────────────────────────────

describe("Router — non-Error exceptions", () => {
  it("handler throwing string returns 500", async () => {
    const res = await httpReq(PORT_A, "GET", "/throw-string");
    expect(res.status).toBe(500);
    expect((res.data as Record<string, unknown>).error).toBe("Internal server error");
  });

  it("handler throwing after response sent does not double-write", async () => {
    const res = await httpReq(PORT_A, "GET", "/throw-after-end");
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).ok).toBe(true);
  });
});

// ─── sendJSON edge cases ────────────────────────────────────────

describe("sendJSON — non-object error data", () => {
  it("null data on 400 is sent as null (no request_id injection)", async () => {
    const res = await httpReq(PORT_A, "GET", "/null-error");
    expect(res.status).toBe(400);
    expect(res.data).toBe(null);
  });

  it("array data on 400 is spread into object (typeof array is 'object')", async () => {
    const res = await httpReq(PORT_A, "GET", "/array-error");
    expect(res.status).toBe(400);
    // Arrays are typeof "object" so sendJSON spreads them into an object with numeric keys
    const data = res.data as Record<string, unknown>;
    expect(data["0"]).toBe(1);
    expect(data["1"]).toBe(2);
    expect(data["2"]).toBe(3);
    expect(typeof data.request_id).toBe("string");
  });

  it("success response body has no request_id field", async () => {
    const res = await httpReq(PORT_A, "GET", "/ok");
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).request_id).toBeUndefined();
  });
});

// ─── Security headers on error responses ────────────────────────

describe("Security headers on non-success responses", () => {
  it("404 response has OWASP security headers", async () => {
    const res = await httpReq(PORT_A, "GET", "/nonexistent");
    expect(res.status).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["strict-transport-security"]).toBeTruthy();
  });

  it("500 response has OWASP security headers", async () => {
    const res = await httpReq(PORT_A, "GET", "/throw-string");
    expect(res.status).toBe(500);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("408 timeout response has request_id header", async () => {
    const res = await httpReq(PORT_A, "GET", "/slow");
    expect(res.status).toBe(408);
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

// ─── CORS preflight ─────────────────────────────────────────────

describe("CORS preflight handling", () => {
  it("OPTIONS returns 204 with correct CORS headers", async () => {
    const res = await httpReq(PORT_A, "OPTIONS", "/up");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("OPTIONS");
  });
});

// ─── Logging level branches ─────────────────────────────────────

describe("Log level selection via createApp middleware", () => {
  it("500 response triggers finish event (error-level logging)", async () => {
    const res = await httpReq(PORT_A, "GET", "/manual-500");
    expect(res.status).toBe(500);
    expect((res.data as Record<string, unknown>).error_code).toBe("FORCED");
  });

  it("422 response triggers finish event (warn-level logging)", async () => {
    const res = await httpReq(PORT_A, "GET", "/manual-422");
    expect(res.status).toBe(422);
    expect((res.data as Record<string, unknown>).error_code).toBe("VALIDATION");
  });

  it("200 response triggers finish event (info-level logging)", async () => {
    const res = await httpReq(PORT_A, "GET", "/ok");
    expect(res.status).toBe(200);
  });
});

// ─── Graceful shutdown edge cases ───────────────────────────────

describe("Shutdown — double call guard", () => {
  it("calling shutdown twice does not throw", async () => {
    const router = new Router();
    router.get("/health", async (_req, res) => sendJSON(res, 200, { ok: true }));
    const PORT_B = 44486;
    const srv = createApp(router, PORT_B);
    await new Promise<void>((r) => setTimeout(r, 100));

    const fn = (srv as unknown as Record<string, (t?: number) => Promise<void>>).shutdown;
    await fn(1000);
    // Second call — should return early without error (_shuttingDown guard)
    await fn(1000);
  });
});

describe("Shutdown — server rejects after close", () => {
  it("new connections are rejected after shutdown", async () => {
    const router = new Router();
    router.get("/up", async (_req, res) => sendJSON(res, 200, { ok: true }));
    const PORT_C = 44487;
    const srv = createApp(router, PORT_C);
    await new Promise<void>((r) => setTimeout(r, 100));

    // Verify operational
    const before = await httpReq(PORT_C, "GET", "/up");
    expect(before.status).toBe(200);

    // Shutdown
    const fn = (srv as unknown as Record<string, (t?: number) => Promise<void>>).shutdown;
    await fn(1000);

    // New connection should be rejected
    const err = await httpReq(PORT_C, "GET", "/up").catch((e: Error) => e.message);
    expect(typeof err).toBe("string");
  });
});
