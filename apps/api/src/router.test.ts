import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import { openMemoryDb, closeDb } from "@axis/snapshots";
import { Router, createApp, sendJSON, sendError, readBody } from "./router.js";
import { resetRateLimits } from "./rate-limiter.js";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

const TEST_PORT = 44417;
let server: Server;

// ─── HTTP helper ────────────────────────────────────────────────

interface Res {
  status: number;
  headers: Record<string, string>;
  body: string;
  data: Record<string, unknown> | string;
}

async function req(
  method: string,
  path: string,
  body?: string | object,
  headers?: Record<string, string>,
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = typeof body === "object" ? JSON.stringify(body) : body;
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    };
    const r = require("node:http").request(
      { hostname: "127.0.0.1", port: TEST_PORT, path, method, headers: h },
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
          resolve({ status: res.statusCode ?? 0, headers: rh, body: raw, data: data as Record<string, unknown> | string });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Server setup ───────────────────────────────────────────────

beforeAll(async () => {
  openMemoryDb();
  resetRateLimits();

  const router = new Router();

  // Echo handler — returns params + query + body
  router.get("/echo", async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    sendJSON(res, 200, {
      method: "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    });
  });

  router.post("/echo", async (req, res) => {
    const body = await readBody(req);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }
    sendJSON(res, 200, { method: "POST", body: parsed });
  });

  // Single param
  router.get("/items/:id", async (_req, res, params) => {
    sendJSON(res, 200, { id: params.id });
  });

  // Multiple params
  router.get("/users/:userId/posts/:postId", async (_req, res, params) => {
    sendJSON(res, 200, { userId: params.userId, postId: params.postId });
  });

  // Wildcard param
  router.get("/files/:path*", async (_req, res, params) => {
    sendJSON(res, 200, { path: params.path });
  });

  // Handler that throws
  router.get("/throws", async () => {
    throw new Error("Intentional test error");
  });

  // Handler that returns custom status
  router.post("/status/:code", async (_req, res, params) => {
    const code = parseInt(params.code, 10);
    sendJSON(res, code, { status: code });
  });

  // sendError test route
  router.get("/error-shape", async (_req, res) => {
    sendError(res, 422, "CUSTOM_CODE", "Custom error message", { detail: "extra" });
  });

  server = createApp(router, TEST_PORT);
  await new Promise<void>((r) => setTimeout(r, 100));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  closeDb();
});

beforeEach(() => {
  resetRateLimits();
});

// ─── Route matching ─────────────────────────────────────────────

describe("Router — route matching", () => {
  it("matches exact static path", async () => {
    const res = await req("GET", "/echo");
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).method).toBe("GET");
  });

  it("returns 404 for unregistered path", async () => {
    const res = await req("GET", "/nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 404 for wrong method", async () => {
    const res = await req("POST", "/items/123"); // /items/:id is GET-only
    expect(res.status).toBe(404);
  });

  it("distinguishes GET and POST on same path", async () => {
    const getRes = await req("GET", "/echo");
    expect((getRes.data as Record<string, unknown>).method).toBe("GET");
    const postRes = await req("POST", "/echo", { foo: "bar" });
    expect((postRes.data as Record<string, unknown>).method).toBe("POST");
  });
});

// ─── Parameter extraction ───────────────────────────────────────

describe("Router — parameter extraction", () => {
  it("extracts single :param", async () => {
    const res = await req("GET", "/items/abc-123");
    expect((res.data as Record<string, unknown>).id).toBe("abc-123");
  });

  it("extracts multiple :params", async () => {
    const res = await req("GET", "/users/u42/posts/p7");
    const data = res.data as Record<string, unknown>;
    expect(data.userId).toBe("u42");
    expect(data.postId).toBe("p7");
  });

  it("handles URL-encoded characters in params", async () => {
    const res = await req("GET", "/items/hello%20world");
    expect((res.data as Record<string, unknown>).id).toBe("hello%20world");
  });

  it("non-matching nested path returns 404", async () => {
    const res = await req("GET", "/items/123/extra");
    expect(res.status).toBe(404);
  });
});

// ─── Wildcard params ────────────────────────────────────────────

describe("Router — wildcard :param*", () => {
  it("captures single segment", async () => {
    const res = await req("GET", "/files/readme.md");
    expect((res.data as Record<string, unknown>).path).toBe("readme.md");
  });

  it("captures deep nested path", async () => {
    const res = await req("GET", "/files/src/components/Button.tsx");
    expect((res.data as Record<string, unknown>).path).toBe("src/components/Button.tsx");
  });

  it("captures path with dots and dashes", async () => {
    const res = await req("GET", "/files/dist/my-app.min.js");
    expect((res.data as Record<string, unknown>).path).toBe("dist/my-app.min.js");
  });
});

// ─── Error handling ─────────────────────────────────────────────

describe("Router — error handling", () => {
  it("handler error returns 500", async () => {
    const res = await req("GET", "/throws");
    expect(res.status).toBe(500);
  });

  it("500 response includes error field", async () => {
    const res = await req("GET", "/throws");
    const data = res.data as Record<string, unknown>;
    expect(data.error).toBe("Internal server error");
  });

  it("500 response includes request_id", async () => {
    const res = await req("GET", "/throws");
    const data = res.data as Record<string, unknown>;
    expect(typeof data.request_id).toBe("string");
  });
});

// ─── sendJSON / sendError ───────────────────────────────────────

describe("Router — sendJSON and sendError", () => {
  it("sendJSON sets Content-Type header", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["content-type"]).toBe("application/json");
  });

  it("sendError includes error_code field", async () => {
    const res = await req("GET", "/error-shape");
    expect(res.status).toBe(422);
    const data = res.data as Record<string, unknown>;
    expect(data.error_code).toBe("CUSTOM_CODE");
    expect(data.error).toBe("Custom error message");
    expect(data.detail).toBe("extra");
  });

  it("error responses include request_id", async () => {
    const res = await req("GET", "/error-shape");
    const data = res.data as Record<string, unknown>;
    expect(typeof data.request_id).toBe("string");
  });

  it("success response body is valid JSON", async () => {
    const res = await req("GET", "/echo");
    expect(() => JSON.parse(res.body)).not.toThrow();
  });

  it("custom status codes work", async () => {
    const res = await req("POST", "/status/201", {});
    expect(res.status).toBe(201);
    expect((res.data as Record<string, unknown>).status).toBe(201);
  });
});

// ─── Middleware pipeline ────────────────────────────────────────

describe("Router — middleware pipeline (security + CORS + request-id)", () => {
  it("every response has X-Request-Id", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("each request gets unique request ID", async () => {
    const r1 = await req("GET", "/echo");
    const r2 = await req("GET", "/echo");
    expect(r1.headers["x-request-id"]).not.toBe(r2.headers["x-request-id"]);
  });

  it("security headers present on success", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toBeTruthy();
    expect(res.headers["strict-transport-security"]).toBeTruthy();
  });

  it("CORS headers present", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toBeTruthy();
  });

  it("OPTIONS returns 204 with CORS", async () => {
    const res = await req("OPTIONS", "/echo");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("rate limit headers present", async () => {
    const res = await req("GET", "/echo");
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
    expect(res.headers["ratelimit-remaining"]).toBeTruthy();
    expect(res.headers["ratelimit-reset"]).toBeTruthy();
  });
});

// ─── readBody ───────────────────────────────────────────────────

describe("Router — readBody", () => {
  it("reads JSON body from POST", async () => {
    const res = await req("POST", "/echo", { key: "value" });
    const data = res.data as Record<string, unknown>;
    const body = data.body as Record<string, unknown>;
    expect(body.key).toBe("value");
  });

  it("handles empty body", async () => {
    const res = await req("POST", "/echo", "");
    expect(res.status).toBe(200);
  });

  it("handles nested JSON", async () => {
    const nested = { a: { b: { c: [1, 2, 3] } } };
    const res = await req("POST", "/echo", nested);
    const data = res.data as Record<string, unknown>;
    const body = data.body as Record<string, unknown>;
    const a = body.a as Record<string, unknown>;
    const b = a.b as Record<string, unknown>;
    expect(b.c).toEqual([1, 2, 3]);
  });
});

// ─── Query strings ──────────────────────────────────────────────

describe("Router — query string handling", () => {
  it("passes query params to handler", async () => {
    const res = await req("GET", "/echo?foo=bar&baz=1");
    const data = res.data as Record<string, unknown>;
    const query = data.query as Record<string, string>;
    expect(query.foo).toBe("bar");
    expect(query.baz).toBe("1");
  });

  it("query params do not affect route matching", async () => {
    const res = await req("GET", "/items/42?include=meta");
    expect(res.status).toBe(200);
    expect((res.data as Record<string, unknown>).id).toBe("42");
  });
});
